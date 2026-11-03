import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as mssql from 'mssql';

import { LoginUser } from '../../../application/use-cases/login-user';
import { GetAuction } from '../../../application/use-cases/get-auction';
import { GetPaymentOrder } from '../../../application/use-cases/get-payment-order';
import { ProcessAuctionClosure } from '../../../application/use-cases/process-auction-closure';
import { RegisterUser } from '../../../application/use-cases/register-user';
import { AuthorizationError } from '../../../application/errors/authorization.error';
import type { RealtimeEvent } from '../../../application/ports/realtime-event-publisher';
import { Auction } from '../../../domain/entities/auction';
import { Bid } from '../../../domain/entities/bid';
import { PaymentEvent } from '../../../domain/entities/payment-event';
import {
  PaymentOrder,
  type PaymentOrderStatus,
} from '../../../domain/entities/payment-order';
import {
  RejectedBidAttempt,
  RejectedBidReason,
} from '../../../domain/entities/rejected-bid-attempt';
import { User } from '../../../domain/entities/user';
import type { ProcessedPaymentEvent } from '../../../domain/ports/payment-event.repository';
import { Article } from '../../../domain/value-objects/article';
import { AuctionStatus } from '../../../domain/value-objects/auction-status';
import { Category } from '../../../domain/value-objects/category';
import { Email } from '../../../domain/value-objects/email';
import { Money } from '../../../domain/value-objects/money';
import { BcryptPasswordHasher } from '../../auth/bcrypt-password-hasher';
import { JwtAccessTokenService } from '../../auth/jwt-access-token-service';
import { SqlAuctionRepository } from './sql-auction.repository';
import { SqlPaymentEventRepository } from './sql-payment-event.repository';
import { SqlPaymentOrderRepository } from './sql-payment-order.repository';
import { SqlUserRepository } from './sql-user.repository';
import { loadSqlServerConfig } from './sqlserver-config';
import { SqlServerDatabase } from './sqlserver-database';

const TEST_DATABASE_NAME = 'SubastasDB';
const RUN_PREFIX = `it${Date.now()}${process.pid}`;
const BASE_DATE = new Date('2026-06-01T12:00:00.000Z');
const SELLER_ID = id('seller');
const BIDDER_ONE_ID = id('bidder1');
const BIDDER_TWO_ID = id('bidder2');

let database: SqlServerDatabase;
let auctionRepository: SqlAuctionRepository;
let orderRepository: SqlPaymentOrderRepository;
let eventRepository: SqlPaymentEventRepository;
let userRepository: SqlUserRepository;

describe('persistencia real en SQL Server', () => {
  beforeAll(async () => {
    const environment = integrationEnvironment(process.env);
    database = new SqlServerDatabase(loadSqlServerConfig(environment));
    try {
      await database.connect();
      await applySchema(database);
      await cleanupRunData(database);
      auctionRepository = new SqlAuctionRepository(database);
      orderRepository = new SqlPaymentOrderRepository(database);
      eventRepository = new SqlPaymentEventRepository(database);
      userRepository = new SqlUserRepository(database);
      await seedRelationalUsers();
    } catch (error: unknown) {
      await database.close();
      throw error;
    }
  });

  afterAll(async () => {
    if (!database) {
      return;
    }
    try {
      await cleanupRunData(database);
    } finally {
      await database.close();
    }
  });

  it('inserta y recupera usuarios, normaliza búsquedas y exige correo único', async () => {
    const user = new User(
      id('user'),
      new Email(`${RUN_PREFIX}.USER@EXAMPLE.COM`),
      '$2b$10$integrationOnlyPasswordHashValue000000000000000000000',
    );
    await userRepository.save(user);

    const restored = await userRepository.findById(user.id);

    expect(restored?.id).toBe(user.id);
    expect(restored?.email.value).toBe(`${RUN_PREFIX}.user@example.com`);
    expect(restored?.passwordHash).toBe(user.passwordHash);
    expect((await userRepository.findByEmail(user.email))?.id).toBe(user.id);
    expect(
      await userRepository.existsByEmail(
        new Email(`  ${RUN_PREFIX}.USER@EXAMPLE.COM  `),
      ),
    ).toBe(true);

    const duplicate = new User(
      id('duplicate-user'),
      new Email(`${RUN_PREFIX}.user@example.com`),
    );
    await expect(userRepository.save(duplicate)).rejects.toBeDefined();
    expect(await userRepository.findById(duplicate.id)).toBeUndefined();
  });

  it('registra una credencial y permite autenticarla desde SQL Server', async () => {
    const userId = id('authenticated-user');
    const email = `${RUN_PREFIX}.authenticated@example.com`;
    const hasher = new BcryptPasswordHasher(10);
    const tokens = new JwtAccessTokenService(
      'integration-test-secret-with-at-least-32-characters',
      3600,
    );
    const register = new RegisterUser(userRepository, hasher, {
      generate: () => userId,
    });
    const login = new LoginUser(userRepository, hasher, tokens);

    const profile = await register.execute({
      email,
      password: 'integration-password',
    });
    const authenticated = await login.execute({
      email: email.toUpperCase(),
      password: 'integration-password',
    });
    const restored = await userRepository.findById(userId);

    expect(profile).toEqual({ id: userId, email });
    expect(restored?.passwordHash).toBeDefined();
    expect(restored?.passwordHash).not.toBe('integration-password');
    expect(tokens.verify(authenticated.token)).toEqual({ userId });
  });

  it('persiste un cierre perezoso una sola vez y restaura su orden', async () => {
    const auctionId = id('lazy-auction');
    const closesAt = new Date(BASE_DATE.getTime() + 60 * 60 * 1000);
    const winningBid = new Bid(
      id('lazy-bid'),
      auctionId,
      BIDDER_ONE_ID,
      new Money(100_000),
      new Date(BASE_DATE.getTime() + 30 * 60 * 1000),
      1,
    );
    const auction = Auction.restore({
      id: auctionId,
      sellerId: SELLER_ID,
      article: new Article('Libro', 'Primera edición', 'USED'),
      category: new Category('Libros'),
      basePrice: new Money(100_000),
      minimumIncrement: new Money(10_000),
      publishedAt: BASE_DATE,
      closesAt,
      status: AuctionStatus.OPEN,
      acceptedBids: [winningBid],
      rejectedBidAttempts: [],
    });
    await auctionRepository.save(auction);
    const events: RealtimeEvent[] = [];
    const processor = new ProcessAuctionClosure(
      auctionRepository,
      { now: () => new Date(closesAt.getTime()) },
      orderRepository,
      {
        publish: (event) => {
          events.push(event);
          return Promise.resolve();
        },
      },
    );
    const getAuction = new GetAuction(auctionRepository, processor);

    await getAuction.execute(auctionId);
    await getAuction.execute(auctionId);
    const restored = await auctionRepository.findById(auctionId);
    const order = await orderRepository.findById(`payment-${auctionId}`);

    expect(restored?.status).toBe(AuctionStatus.CLOSED);
    expect(restored?.winnerId).toBe(BIDDER_ONE_ID);
    expect(restored?.closure?.paymentOrder?.id).toBe(order?.id);
    expect(order?.debtorId).toBe(BIDDER_ONE_ID);
    expect(events.filter((event) => event.type === 'auction:closed')).toHaveLength(
      1,
    );
  });

  it('guarda y restaura la subasta, sus pujas, rechazos, cierre y ganador', async () => {
    const { auction, order } = closedAuction('aggregate', 'PENDING');

    await auctionRepository.save(auction);
    await orderRepository.save(order);
    const restored = await auctionRepository.findById(auction.id);

    expect(restored?.status).toBe(AuctionStatus.CLOSED);
    expect(restored?.acceptedBids.map((bid) => bid.sequence)).toEqual([1, 2]);
    expect(restored?.acceptedBids.map((bid) => bid.amount.amount)).toEqual([
      100_000, 120_000,
    ]);
    expect(restored?.rejectedBidAttempts).toHaveLength(1);
    expect(restored?.rejectedBidAttempts[0]?.reason).toBe(
      RejectedBidReason.BID_INCREMENT_TOO_LOW,
    );
    expect(restored?.winnerId).toBe(BIDDER_TWO_ID);
    expect(restored?.closure?.winningBid?.id).toBe(id('aggregate-bid2'));
    expect(restored?.closure?.paymentOrder?.id).toBe(order.id);
    expect(restored?.closure?.paymentOrder?.status).toBe('PENDING');
  });

  it('aplica filtros, paginación y conteo en el repositorio SQL', async () => {
    await auctionRepository.save(
      listedAuction('list-1', 'Libros', AuctionStatus.OPEN, 1),
    );
    await auctionRepository.save(
      listedAuction('list-2', 'Libros', AuctionStatus.OPEN, 2),
    );
    await auctionRepository.save(
      listedAuction('list-3', 'Libros', AuctionStatus.CANCELLED, 3),
    );
    await auctionRepository.save(
      listedAuction('list-4', 'Arte', AuctionStatus.OPEN, 4),
    );

    const first = await auctionRepository.findPage({
      category: 'Libros',
      status: 'OPEN',
      page: 1,
      limit: 1,
    });
    const second = await auctionRepository.findPage({
      category: 'Libros',
      status: 'OPEN',
      page: 2,
      limit: 1,
    });

    expect(first.total).toBe(2);
    expect(first.items.map((auction) => auction.id)).toEqual([id('list-1')]);
    expect(second.items.map((auction) => auction.id)).toEqual([id('list-2')]);
  });

  it('recupera la orden SQL sólo para su ganador mediante Application', async () => {
    const { auction, order } = closedAuction('authorized-order', 'PENDING');
    await auctionRepository.save(auction);
    await orderRepository.save(order);
    const getPaymentOrder = new GetPaymentOrder(orderRepository);

    await expect(
      getPaymentOrder.execute({
        paymentOrderId: order.id,
        requesterId: BIDDER_TWO_ID,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: order.id }));
    await expect(
      getPaymentOrder.execute({
        paymentOrderId: order.id,
        requesterId: BIDDER_ONE_ID,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it.each<PaymentOrderStatus>(['PENDING', 'PAID', 'EXPIRED'])(
    'persiste y recupera una orden %s vinculada a su subasta y deudor',
    async (status) => {
      const suffix = `order-${status.toLowerCase()}`;
      const { auction, order } = closedAuction(suffix, status);
      await auctionRepository.save(auction);
      await orderRepository.save(order);

      const restored = await orderRepository.findById(order.id);

      expect(restored?.status).toBe(status);
      expect(restored?.auctionId).toBe(auction.id);
      expect(restored?.debtorId).toBe(BIDDER_TWO_ID);
      expect(restored?.amount.amount).toBe(120_000);
      expect(restored?.createdAt).toEqual(order.createdAt);
      expect(restored?.dueAt).toEqual(order.dueAt);
    },
  );

  it('conserva el evento original y su respuesta ante un ID duplicado', async () => {
    const { auction, order } = closedAuction('event', 'PAID');
    await auctionRepository.save(auction);
    await orderRepository.save(order);
    const original = processedEvent('event', order, 'original-content');
    await eventRepository.save(original);

    const duplicate = processedEvent('event', order, 'changed-content');
    await expect(eventRepository.save(duplicate)).rejects.toBeDefined();

    const restored = await eventRepository.findById(original.event.id);
    expect(restored?.contentKey).toBe('original-content');
    expect(restored?.event.result).toBe('APPROVED');
    expect(restored?.response).toEqual(original.response);
  });

  it('hace cumplir referencias, importes no negativos y secuencias únicas', async () => {
    await expect(insertAuctionWithMissingSeller()).rejects.toBeDefined();

    const auction = openAuction('integrity');
    await auctionRepository.save(auction);

    await expect(insertNegativeBid(auction.id)).rejects.toBeDefined();
    await expect(insertNegativePaymentOrder(auction.id)).rejects.toBeDefined();
    await insertRawBid(auction.id, id('integrity-bid1'), 1, 100_000);
    await expect(
      insertRawBid(auction.id, id('integrity-bid2'), 1, 110_000),
    ).rejects.toBeDefined();
  });

  it('revierte todas las tablas del agregado cuando una inserción interna falla', async () => {
    const { auction: original, order } = closedAuction('rollback', 'PENDING');
    await auctionRepository.save(original);
    await orderRepository.save(order);

    const invalidBid = new Bid(
      id('rollback-invalid-bid'),
      original.id,
      id('missing-bidder'),
      new Money(100_000),
      new Date(BASE_DATE.getTime() + 60_000),
      1,
    );
    const winningBid = new Bid(
      id('rollback-bid2'),
      original.id,
      BIDDER_TWO_ID,
      new Money(120_000),
      new Date(BASE_DATE.getTime() + 120_000),
      2,
    );
    const invalidUpdate = Auction.restore({
      id: original.id,
      sellerId: SELLER_ID,
      article: original.article,
      category: original.category,
      basePrice: original.basePrice,
      minimumIncrement: original.minimumIncrement,
      publishedAt: original.publishedAt,
      closesAt: original.closesAt,
      status: AuctionStatus.CLOSED,
      acceptedBids: [invalidBid, winningBid],
      rejectedBidAttempts: [],
      closure: { winningBidId: winningBid.id, paymentOrder: order },
    });

    await expect(auctionRepository.save(invalidUpdate)).rejects.toBeDefined();

    const restored = await auctionRepository.findById(original.id);
    expect(restored?.acceptedBids.map((bid) => bid.id)).toEqual([
      id('rollback-bid1'),
      id('rollback-bid2'),
    ]);
    expect(restored?.status).toBe(AuctionStatus.CLOSED);
    expect(restored?.closure?.winningBid?.id).toBe(id('rollback-bid2'));
  });
});

function integrationEnvironment(
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (environment.RUN_SQLSERVER_INTEGRATION !== 'true') {
    throw new Error(
      'Defina RUN_SQLSERVER_INTEGRATION=true para autorizar las pruebas reales.',
    );
  }
  if (environment.NODE_ENV !== 'test') {
    throw new Error('Las pruebas de integración exigen NODE_ENV=test.');
  }
  if (environment.DB_TEST_DATABASE !== TEST_DATABASE_NAME) {
    throw new Error(
      `DB_TEST_DATABASE debe ser exactamente ${TEST_DATABASE_NAME}.`,
    );
  }
  return { ...environment, DB_DATABASE: TEST_DATABASE_NAME };
}

async function applySchema(sqlDatabase: SqlServerDatabase): Promise<void> {
  const schema = await readFile(
    resolve(process.cwd(), 'database', 'schema.sql'),
    'utf8',
  );
  const batches = schema
    .split(/^\s*GO\s*$/gim)
    .map((batch) => batch.trim())
    .filter(Boolean);
  for (const batch of batches) {
    await sqlDatabase.query(batch);
  }
}

async function cleanupRunData(sqlDatabase: SqlServerDatabase): Promise<void> {
  if (!RUN_PREFIX.startsWith('it')) {
    throw new Error('Se rechazó una limpieza sin prefijo de integración.');
  }
  await sqlDatabase.transaction(async (executor) => {
    const parameter = {
      name: 'prefix',
      type: mssql.NVarChar(101),
      value: `${RUN_PREFIX}%`,
    };
    await executor.query(
      `DELETE FROM dbo.payment_events WHERE id LIKE @prefix;
       DELETE FROM dbo.auction_closures WHERE auction_id LIKE @prefix;
       DELETE FROM dbo.payment_orders
         WHERE id LIKE @prefix OR auction_id LIKE @prefix;
       DELETE FROM dbo.rejected_bid_attempts WHERE id LIKE @prefix;
       DELETE FROM dbo.accepted_bids WHERE id LIKE @prefix;
       DELETE FROM dbo.auctions WHERE id LIKE @prefix;
       DELETE FROM dbo.users WHERE id LIKE @prefix;`,
      [parameter],
    );
  });
}

async function seedRelationalUsers(): Promise<void> {
  await userRepository.save(
    new User(SELLER_ID, new Email(`${RUN_PREFIX}.seller@example.com`)),
  );
  await userRepository.save(
    new User(BIDDER_ONE_ID, new Email(`${RUN_PREFIX}.bidder1@example.com`)),
  );
  await userRepository.save(
    new User(BIDDER_TWO_ID, new Email(`${RUN_PREFIX}.bidder2@example.com`)),
  );
}

function closedAuction(
  suffix: string,
  orderStatus: PaymentOrderStatus,
): { auction: Auction; order: PaymentOrder } {
  const auctionId = id(`${suffix}-auction`);
  const firstBid = new Bid(
    id(`${suffix}-bid1`),
    auctionId,
    BIDDER_ONE_ID,
    new Money(100_000),
    new Date(BASE_DATE.getTime() + 60_000),
    1,
  );
  const winningBid = new Bid(
    id(`${suffix}-bid2`),
    auctionId,
    BIDDER_TWO_ID,
    new Money(120_000),
    new Date(BASE_DATE.getTime() + 120_000),
    2,
  );
  const rejectedAttempt = new RejectedBidAttempt(
    id(`${suffix}-rejected1`),
    auctionId,
    BIDDER_ONE_ID,
    new Money(125_000),
    new Date(BASE_DATE.getTime() + 180_000),
    RejectedBidReason.BID_INCREMENT_TOO_LOW,
  );
  const order = PaymentOrder.restore({
    id: id(`${suffix}-order`),
    auctionId,
    debtorId: BIDDER_TWO_ID,
    amount: new Money(120_000),
    createdAt: new Date(BASE_DATE.getTime() + 24 * 60 * 60 * 1000),
    dueAt: new Date(BASE_DATE.getTime() + 72 * 60 * 60 * 1000),
    status: orderStatus,
  });
  const auction = Auction.restore({
    id: auctionId,
    sellerId: SELLER_ID,
    article: new Article('Reloj', 'Reloj mecánico', 'USED'),
    category: new Category('Coleccionables'),
    basePrice: new Money(100_000),
    minimumIncrement: new Money(10_000),
    publishedAt: BASE_DATE,
    closesAt: new Date(BASE_DATE.getTime() + 24 * 60 * 60 * 1000),
    status: AuctionStatus.CLOSED,
    acceptedBids: [firstBid, winningBid],
    rejectedBidAttempts: [rejectedAttempt],
    closure: { winningBidId: winningBid.id, paymentOrder: order },
  });
  return { auction, order };
}

function openAuction(suffix: string): Auction {
  return Auction.restore({
    id: id(`${suffix}-auction`),
    sellerId: SELLER_ID,
    article: new Article('Libro', 'Primera edición', 'USED'),
    category: new Category('Libros'),
    basePrice: new Money(100_000),
    minimumIncrement: new Money(10_000),
    publishedAt: BASE_DATE,
    closesAt: new Date(BASE_DATE.getTime() + 24 * 60 * 60 * 1000),
    status: AuctionStatus.OPEN,
    acceptedBids: [],
    rejectedBidAttempts: [],
  });
}

function listedAuction(
  suffix: string,
  category: string,
  status: AuctionStatus,
  minute: number,
): Auction {
  const publishedAt = new Date(BASE_DATE.getTime() + minute * 60_000);
  return Auction.restore({
    id: id(suffix),
    sellerId: SELLER_ID,
    article: new Article('Libro', 'Consulta paginada', 'USED'),
    category: new Category(category),
    basePrice: new Money(100_000),
    minimumIncrement: new Money(10_000),
    publishedAt,
    closesAt: new Date(publishedAt.getTime() + 60 * 60 * 1000),
    status,
    acceptedBids: [],
    rejectedBidAttempts: [],
  });
}

function processedEvent(
  suffix: string,
  order: PaymentOrder,
  contentKey: string,
): ProcessedPaymentEvent {
  const event = new PaymentEvent(
    id(`${suffix}-payment-event`),
    order.id,
    'APPROVED',
    new Date(BASE_DATE.getTime() + 25 * 60 * 60 * 1000),
    'verified-integration-origin',
  );
  return {
    event,
    contentKey,
    response: {
      eventId: event.id,
      paymentOrderId: order.id,
      result: 'APPROVED',
      orderStatus: 'PAID',
    },
  };
}

function insertAuctionWithMissingSeller(): Promise<unknown> {
  return database.query(
    `INSERT INTO dbo.auctions (
       id, seller_id, article_denomination, article_description,
       article_conservation_state, category_name, base_price,
       minimum_increment, published_at, closes_at, status
     ) VALUES (
       @id, @sellerId, N'Artículo', N'Integridad', N'USED', N'Pruebas',
       1000, 100, @publishedAt, @closesAt, N'OPEN'
     );`,
    [
      { name: 'id', type: mssql.NVarChar(100), value: id('missing-fk-auction') },
      {
        name: 'sellerId',
        type: mssql.NVarChar(100),
        value: id('missing-seller'),
      },
      { name: 'publishedAt', type: mssql.DateTime2(3), value: BASE_DATE },
      {
        name: 'closesAt',
        type: mssql.DateTime2(3),
        value: new Date(BASE_DATE.getTime() + 3_600_000),
      },
    ],
  );
}

function insertNegativeBid(auctionId: string): Promise<unknown> {
  return insertRawBid(auctionId, id('negative-bid'), 1, -1);
}

function insertNegativePaymentOrder(auctionId: string): Promise<unknown> {
  return database.query(
    `INSERT INTO dbo.payment_orders (
       id, auction_id, debtor_id, amount, created_at, due_at, status
     ) VALUES (
       @id, @auctionId, @debtorId, @amount, @createdAt, @dueAt, N'PENDING'
     );`,
    [
      { name: 'id', type: mssql.NVarChar(100), value: id('negative-order') },
      { name: 'auctionId', type: mssql.NVarChar(100), value: auctionId },
      {
        name: 'debtorId',
        type: mssql.NVarChar(100),
        value: BIDDER_ONE_ID,
      },
      { name: 'amount', type: mssql.BigInt, value: -1 },
      { name: 'createdAt', type: mssql.DateTime2(3), value: BASE_DATE },
      {
        name: 'dueAt',
        type: mssql.DateTime2(3),
        value: new Date(BASE_DATE.getTime() + 48 * 60 * 60 * 1000),
      },
    ],
  );
}

function insertRawBid(
  auctionId: string,
  bidId: string,
  sequence: number,
  amount: number,
): Promise<unknown> {
  return database.query(
    `INSERT INTO dbo.accepted_bids (
       id, auction_id, bidder_id, amount, placed_at, sequence
     ) VALUES (@id, @auctionId, @bidderId, @amount, @placedAt, @sequence);`,
    [
      { name: 'id', type: mssql.NVarChar(100), value: bidId },
      { name: 'auctionId', type: mssql.NVarChar(100), value: auctionId },
      {
        name: 'bidderId',
        type: mssql.NVarChar(100),
        value: BIDDER_ONE_ID,
      },
      { name: 'amount', type: mssql.BigInt, value: amount },
      { name: 'placedAt', type: mssql.DateTime2(3), value: BASE_DATE },
      { name: 'sequence', type: mssql.Int, value: sequence },
    ],
  );
}

function id(suffix: string): string {
  return `${RUN_PREFIX}-${suffix}`;
}
