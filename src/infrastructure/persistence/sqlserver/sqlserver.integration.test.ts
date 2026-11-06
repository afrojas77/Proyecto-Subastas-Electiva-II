import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import * as mssql from 'mssql';

import { LoginUser } from '../../../application/use-cases/login-user';
import { GetAuthenticatedProfile } from '../../../application/use-cases/get-authenticated-profile';
import { GetAuction } from '../../../application/use-cases/get-auction';
import { GetPaymentOrder } from '../../../application/use-cases/get-payment-order';
import { ProcessAuctionClosure } from '../../../application/use-cases/process-auction-closure';
import { PlaceBid } from '../../../application/use-cases/place-bid';
import { ProcessPaymentNotification } from '../../../application/use-cases/process-payment-notification';
import { ProcessPaymentOrderExpiration } from '../../../application/use-cases/process-payment-order-expiration';
import { RegisterUser } from '../../../application/use-cases/register-user';
import { AuthorizationError } from '../../../application/errors/authorization.error';
import { UnverifiedPaymentNotificationError } from '../../../application/errors/unverified-payment-notification.error';
import type {
  RealtimeEvent,
  RealtimeEventPublisher,
} from '../../../application/ports/realtime-event-publisher';
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
import { BidRejectedError } from '../../../domain/errors/bid-rejected.error';
import { InvalidPaymentOrderStateError } from '../../../domain/errors/invalid-payment-order-state.error';
import type {
  AuctionPage,
  AuctionPageQuery,
  AuctionRepository,
} from '../../../domain/ports/auction.repository';
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
import { SqlPersistenceTransaction } from './sql-persistence-transaction';
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
let persistenceTransaction: SqlPersistenceTransaction;

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
      persistenceTransaction = new SqlPersistenceTransaction(database);
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
      'Usuario Integración',
    );
    await userRepository.save(user);

    const restored = await userRepository.findById(user.id);

    expect(restored?.id).toBe(user.id);
    expect(restored?.name).toBe('Usuario Integración');
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
      undefined,
      'Usuario Duplicado',
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
      name: 'Usuario Autenticado',
      email,
      password: 'integration-password',
    });
    const authenticated = await login.execute({
      email: email.toUpperCase(),
      password: 'integration-password',
    });
    const restored = await userRepository.findById(userId);

    expect(profile).toEqual({
      id: userId,
      name: 'Usuario Autenticado',
      email,
    });
    expect(restored?.passwordHash).toBeDefined();
    expect(restored?.passwordHash).not.toBe('integration-password');
    expect(tokens.verify(authenticated.token)).toEqual({ userId });
  });

  it('consulta desde SQL las subastas publicadas y participadas del perfil', async () => {
    const auction = openAuctionWithBid('profile-activity');
    await auctionRepository.save(auction);
    const profile = new GetAuthenticatedProfile(
      userRepository,
      auctionRepository,
    );

    const sellerProfile = await profile.execute(SELLER_ID);
    const bidderProfile = await profile.execute(BIDDER_ONE_ID);

    expect(sellerProfile.publishedAuctions.map(({ id }) => id)).toContain(
      auction.id,
    );
    expect(bidderProfile.participatedAuctions.map(({ id }) => id)).toContain(
      auction.id,
    );
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
      persistenceTransaction,
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
    expect(
      events.filter((event) => event.type === 'auction:closed'),
    ).toHaveLength(1);
  });

  it('persiste como desierta una subasta sin pujas y no crea orden', async () => {
    const auction = openAuction('deserted-closure');
    await auctionRepository.save(auction);
    const events: RealtimeEvent[] = [];
    const processor = new ProcessAuctionClosure(
      auctionRepository,
      { now: () => auction.closesAt },
      orderRepository,
      {
        publish: (event) => {
          events.push(event);
          return Promise.resolve();
        },
      },
      persistenceTransaction,
    );

    const closure = await processor.execute(auction);

    expect(closure.status).toBe(AuctionStatus.DESERTED);
    expect(closure.paymentOrder).toBeUndefined();
    expect(
      await orderRepository.findById(`payment-${auction.id}`),
    ).toBeUndefined();
    expect(
      events.filter((event) => event.type === 'auction:closed'),
    ).toHaveLength(1);
  });

  it('revierte el cierre si falla la orden y permite reintentarlo', async () => {
    const auction = openAuctionWithBid('closure-rollback');
    await auctionRepository.save(auction);
    const blockingOrder = PaymentOrder.create(
      id('closure-rollback-existing-order'),
      auction.id,
      BIDDER_ONE_ID,
      new Money(100_000),
      auction.closesAt,
    );
    await orderRepository.save(blockingOrder);
    const events: RealtimeEvent[] = [];
    const processor = new ProcessAuctionClosure(
      auctionRepository,
      { now: () => auction.closesAt },
      orderRepository,
      {
        publish: (event) => {
          events.push(event);
          return Promise.resolve();
        },
      },
      persistenceTransaction,
    );

    await expect(processor.execute(auction)).rejects.toBeDefined();
    const rolledBack = await auctionRepository.findById(auction.id);
    expect(rolledBack?.status).toBe(AuctionStatus.OPEN);
    expect(rolledBack?.closure).toBeUndefined();
    expect(events).toHaveLength(0);

    await deletePaymentOrder(blockingOrder.id);
    const closure = await processor.execute(rolledBack as Auction);
    expect(closure.paymentOrder?.id).toBe(`payment-${auction.id}`);
    expect((await auctionRepository.findById(auction.id))?.status).toBe(
      AuctionStatus.CLOSED,
    );
    expect(
      events.filter((event) => event.type === 'auction:closed'),
    ).toHaveLength(1);
  });

  it('serializa dos cierres y crea una sola orden y un solo evento', async () => {
    const auction = openAuctionWithBid('concurrent-closure');
    await auctionRepository.save(auction);
    const firstSnapshot = await auctionRepository.findById(auction.id);
    const secondSnapshot = await auctionRepository.findById(auction.id);
    const events: RealtimeEvent[] = [];
    const processor = new ProcessAuctionClosure(
      auctionRepository,
      { now: () => auction.closesAt },
      orderRepository,
      {
        publish: (event) => {
          events.push(event);
          return Promise.resolve();
        },
      },
      persistenceTransaction,
    );

    const closures = await Promise.all([
      processor.execute(firstSnapshot as Auction),
      processor.execute(secondSnapshot as Auction),
    ]);

    expect(closures[0]?.paymentOrder?.id).toBe(`payment-${auction.id}`);
    expect(closures[1]?.paymentOrder?.id).toBe(`payment-${auction.id}`);
    expect(
      await orderRepository.findById(`payment-${auction.id}`),
    ).toBeDefined();
    expect(
      events.filter((event) => event.type === 'auction:closed'),
    ).toHaveLength(1);
  });

  it('vence orden y subasta atómicamente y tolera el reintento', async () => {
    const { auction, order } = closedAuction('expiration', 'PENDING');
    await auctionRepository.save(auction);
    await orderRepository.save(order);
    const events: RealtimeEvent[] = [];
    const processor = new ProcessPaymentOrderExpiration(
      orderRepository,
      auctionRepository,
      { now: () => order.dueAt },
      {
        publish: (event) => {
          events.push(event);
          return Promise.resolve();
        },
      },
      persistenceTransaction,
    );

    const getPaymentOrder = new GetPaymentOrder(orderRepository, processor);
    await expect(
      getPaymentOrder.execute({
        paymentOrderId: order.id,
        requesterId: order.debtorId,
      }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });
    await expect(processor.execute(order.id)).resolves.toMatchObject({
      outcome: 'ALREADY_PROCESSED',
    });

    expect((await orderRepository.findById(order.id))?.status).toBe('EXPIRED');
    expect((await auctionRepository.findById(auction.id))?.status).toBe(
      AuctionStatus.DEFAULTED,
    );
    expect(
      events.filter((event) => event.type === 'auction:defaulted'),
    ).toHaveLength(1);
  });

  it('procesa webhooks duplicados concurrentes con una respuesta idempotente', async () => {
    const { auction, order } = closedAuction('concurrent-webhook', 'PENDING');
    await auctionRepository.save(auction);
    await orderRepository.save(order);
    const events: RealtimeEvent[] = [];
    const processor = new ProcessPaymentNotification(
      {
        verify: () =>
          Promise.resolve({ verified: true, verificationData: 'test' }),
      },
      orderRepository,
      eventRepository,
      {
        publish: (event) => {
          events.push(event);
          return Promise.resolve();
        },
      },
      persistenceTransaction,
    );
    const payload = {
      id: id('concurrent-webhook-event'),
      paymentOrderId: order.id,
      result: 'APPROVED',
      occurredAt: order.createdAt.toISOString(),
    };

    const responses = await Promise.all([
      processor.execute({ payload, verificationCredential: 'valid' }),
      processor.execute({ payload, verificationCredential: 'valid' }),
    ]);

    expect(responses[1]).toEqual(responses[0]);
    expect((await orderRepository.findById(order.id))?.status).toBe('PAID');
    expect(await eventRepository.findById(payload.id)).toBeDefined();
    expect(
      events.filter((event) => event.type === 'payment:confirmed'),
    ).toHaveLength(1);
  });

  it('un webhook no verificado no modifica la orden ni registra evento', async () => {
    const { auction, order } = closedAuction('invalid-webhook', 'PENDING');
    await auctionRepository.save(auction);
    await orderRepository.save(order);
    const eventId = id('invalid-webhook-event');
    const processor = new ProcessPaymentNotification(
      { verify: () => Promise.resolve({ verified: false }) },
      orderRepository,
      eventRepository,
      { publish: () => Promise.resolve() },
      persistenceTransaction,
    );

    await expect(
      processor.execute({
        payload: {
          id: eventId,
          paymentOrderId: order.id,
          result: 'APPROVED',
          occurredAt: order.createdAt.toISOString(),
        },
      }),
    ).rejects.toBeInstanceOf(UnverifiedPaymentNotificationError);

    expect((await orderRepository.findById(order.id))?.status).toBe('PENDING');
    expect(await eventRepository.findById(eventId)).toBeUndefined();
  });

  it('vence atómicamente antes de rechazar una confirmación tardía', async () => {
    const { auction, order } = closedAuction('late-confirmation', 'PENDING');
    await auctionRepository.save(auction);
    await orderRepository.save(order);
    const eventId = id('late-confirmation-event');
    const expiration = new ProcessPaymentOrderExpiration(
      orderRepository,
      auctionRepository,
      { now: () => order.dueAt },
      { publish: () => Promise.resolve() },
      persistenceTransaction,
    );
    const notification = new ProcessPaymentNotification(
      {
        verify: () =>
          Promise.resolve({ verified: true, verificationData: 'test' }),
      },
      orderRepository,
      eventRepository,
      { publish: () => Promise.resolve() },
      persistenceTransaction,
      expiration,
    );

    await expect(
      notification.execute({
        payload: {
          id: eventId,
          paymentOrderId: order.id,
          result: 'APPROVED',
          occurredAt: order.dueAt.toISOString(),
        },
      }),
    ).rejects.toBeInstanceOf(InvalidPaymentOrderStateError);

    expect((await orderRepository.findById(order.id))?.status).toBe('EXPIRED');
    expect((await auctionRepository.findById(auction.id))?.status).toBe(
      AuctionStatus.DEFAULTED,
    );
    expect(await eventRepository.findById(eventId)).toBeUndefined();
  });

  it('serializa confirmación y vencimiento sin estados contradictorios', async () => {
    const { auction, order } = closedAuction('payment-race', 'PENDING');
    await auctionRepository.save(auction);
    await orderRepository.save(order);
    const eventId = id('payment-race-event');
    const notification = new ProcessPaymentNotification(
      {
        verify: () =>
          Promise.resolve({ verified: true, verificationData: 'test' }),
      },
      orderRepository,
      eventRepository,
      { publish: () => Promise.resolve() },
      persistenceTransaction,
    );
    const expiration = new ProcessPaymentOrderExpiration(
      orderRepository,
      auctionRepository,
      { now: () => order.dueAt },
      { publish: () => Promise.resolve() },
      persistenceTransaction,
    );

    await Promise.allSettled([
      notification.execute({
        payload: {
          id: eventId,
          paymentOrderId: order.id,
          result: 'APPROVED',
          occurredAt: order.dueAt.toISOString(),
        },
      }),
      expiration.execute(order.id),
    ]);

    const persistedOrder = await orderRepository.findById(order.id);
    const persistedAuction = await auctionRepository.findById(auction.id);
    const persistedEvent = await eventRepository.findById(eventId);
    const coherentPaidState =
      persistedOrder?.status === 'PAID' &&
      persistedAuction?.status.equals(AuctionStatus.CLOSED) === true &&
      persistedEvent !== undefined;
    const coherentExpiredState =
      persistedOrder?.status === 'EXPIRED' &&
      persistedAuction?.status.equals(AuctionStatus.DEFAULTED) === true &&
      persistedEvent === undefined;

    expect(coherentPaidState || coherentExpiredState).toBe(true);
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
      listedAuction('list-1', 'Paginacion', AuctionStatus.OPEN, 1),
    );
    await auctionRepository.save(
      listedAuction('list-2', 'Paginacion', AuctionStatus.OPEN, 2),
    );
    await auctionRepository.save(
      listedAuction('list-3', 'Paginacion', AuctionStatus.CANCELLED, 3),
    );
    await auctionRepository.save(
      listedAuction('list-4', 'Arte', AuctionStatus.OPEN, 4),
    );

    const first = await auctionRepository.findPage({
      category: 'Paginacion',
      status: 'OPEN',
      page: 1,
      limit: 1,
    });
    const second = await auctionRepository.findPage({
      category: 'Paginacion',
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

  it('serializa pujas simultáneas sin perder la actualización rechazada', async () => {
    const auction = openAuction('concurrent-bids');
    await auctionRepository.save(auction);
    const synchronizedRepository = new SynchronizedReadAuctionRepository(
      auctionRepository,
    );
    const publishedEvents: RealtimeEvent[] = [];
    const publisher: RealtimeEventPublisher = {
      publish: (event) => {
        publishedEvents.push(event);
        return Promise.resolve();
      },
    };
    const placeBid = new PlaceBid(
      synchronizedRepository,
      { now: () => new Date(BASE_DATE.getTime() + 60_000) },
      publisher,
    );

    const results = await Promise.allSettled([
      placeBid.execute({
        id: id('concurrent-bid1'),
        auctionId: auction.id,
        bidderId: BIDDER_ONE_ID,
        amount: 100_000,
      }),
      placeBid.execute({
        id: id('concurrent-bid2'),
        auctionId: auction.id,
        bidderId: BIDDER_TWO_ID,
        amount: 100_000,
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(BidRejectedError) });

    const restored = await auctionRepository.findById(auction.id);
    expect(restored?.acceptedBids).toHaveLength(1);
    expect(restored?.rejectedBidAttempts).toHaveLength(1);
    expect(
      publishedEvents.filter((event) => event.type === 'auction:bid-accepted'),
    ).toHaveLength(1);
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

class SynchronizedReadAuctionRepository implements AuctionRepository {
  private readCount = 0;
  private releaseReads!: () => void;
  private readonly bothReadsCompleted = new Promise<void>((resolve) => {
    this.releaseReads = resolve;
  });

  constructor(private readonly delegate: AuctionRepository) {}

  async findById(id: string): Promise<Auction | undefined> {
    const auction = await this.delegate.findById(id);
    this.readCount += 1;
    if (this.readCount === 2) {
      this.releaseReads();
    }
    if (this.readCount <= 2) {
      await this.bothReadsCompleted;
    }
    return auction;
  }

  findBySellerId(sellerId: string): Promise<readonly Auction[]> {
    return this.delegate.findBySellerId(sellerId);
  }

  findByBidderId(bidderId: string): Promise<readonly Auction[]> {
    return this.delegate.findByBidderId(bidderId);
  }

  findPage(query: AuctionPageQuery): Promise<AuctionPage> {
    return this.delegate.findPage(query);
  }

  save(auction: Auction): Promise<void> {
    return this.delegate.save(auction);
  }
}

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
    new User(
      SELLER_ID,
      new Email(`${RUN_PREFIX}.seller@example.com`),
      undefined,
      'Vendedor Integración',
    ),
  );
  await userRepository.save(
    new User(
      BIDDER_ONE_ID,
      new Email(`${RUN_PREFIX}.bidder1@example.com`),
      undefined,
      'Postor Uno',
    ),
  );
  await userRepository.save(
    new User(
      BIDDER_TWO_ID,
      new Email(`${RUN_PREFIX}.bidder2@example.com`),
      undefined,
      'Postor Dos',
    ),
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

function openAuctionWithBid(suffix: string): Auction {
  const auction = openAuction(suffix);
  return Auction.restore({
    id: auction.id,
    sellerId: auction.sellerId,
    article: auction.article,
    category: auction.category,
    basePrice: auction.basePrice,
    minimumIncrement: auction.minimumIncrement,
    publishedAt: auction.publishedAt,
    closesAt: auction.closesAt,
    status: AuctionStatus.OPEN,
    acceptedBids: [
      new Bid(
        id(`${suffix}-bid`),
        auction.id,
        BIDDER_ONE_ID,
        new Money(100_000),
        new Date(BASE_DATE.getTime() + 60_000),
        1,
      ),
    ],
    rejectedBidAttempts: [],
  });
}

async function deletePaymentOrder(paymentOrderId: string): Promise<void> {
  await database.query('DELETE FROM dbo.payment_orders WHERE id = @id;', [
    { name: 'id', type: mssql.NVarChar(100), value: paymentOrderId },
  ]);
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
      {
        name: 'id',
        type: mssql.NVarChar(100),
        value: id('missing-fk-auction'),
      },
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
