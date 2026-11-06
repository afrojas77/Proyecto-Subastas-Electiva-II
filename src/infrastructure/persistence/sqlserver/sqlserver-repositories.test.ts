import { describe, expect, it } from '@jest/globals';

import { ConcurrentAuctionUpdateError } from '../../../application/errors/concurrent-auction-update.error';
import type { Auction } from '../../../domain/entities/auction';
import { PaymentOrder } from '../../../domain/entities/payment-order';
import { User } from '../../../domain/entities/user';
import type { ProcessedPaymentEvent } from '../../../domain/ports/payment-event.repository';
import { Email } from '../../../domain/value-objects/email';
import type { SqlDatabase, SqlParameter, SqlQueryResult } from './sql-executor';
import { SqlAuctionRepository } from './sql-auction.repository';
import { SqlPaymentEventRepository } from './sql-payment-event.repository';
import { SqlPaymentOrderRepository } from './sql-payment-order.repository';
import { SqlUserRepository } from './sql-user.repository';
import type {
  AcceptedBidRow,
  AuctionRow,
  PaymentEventRow,
  PaymentOrderRow,
  RejectedBidAttemptRow,
  UserRow,
} from './sqlserver-mappers';

interface QueryCall {
  statement: string;
  parameters: readonly SqlParameter[];
}

class FakeSqlDatabase implements SqlDatabase {
  readonly calls: QueryCall[] = [];
  transactionCount = 0;
  private readonly responses: Array<readonly unknown[]> = [];

  enqueue<Row>(rows: readonly Row[]): void {
    this.responses.push(rows);
  }

  query<Row>(
    statement: string,
    parameters: readonly SqlParameter[] = [],
  ): Promise<SqlQueryResult<Row>> {
    this.calls.push({ statement, parameters });
    const recordset = (this.responses.shift() ?? []) as readonly Row[];
    return Promise.resolve({ recordset });
  }

  async transaction<Result>(
    work: (executor: FakeSqlDatabase) => Promise<Result>,
  ): Promise<Result> {
    this.transactionCount += 1;
    return work(this);
  }
}

const CREATED_AT = new Date('2026-01-01T13:00:00.000Z');
const DUE_AT = new Date('2026-01-03T13:00:00.000Z');

describe('repositorios SQL Server', () => {
  it('recupera y guarda una orden con parámetros, y maneja inexistentes', async () => {
    const database = new FakeSqlDatabase();
    const repository = new SqlPaymentOrderRepository(database);
    const row: PaymentOrderRow = {
      id: 'payment-1',
      auction_id: 'auction-1',
      debtor_id: 'bidder-1',
      amount: 100_000,
      created_at: CREATED_AT,
      due_at: DUE_AT,
      status: 'EXPIRED',
    };
    database.enqueue([row]);
    database.enqueue([]);

    const found = await repository.findById('payment-1');
    const missing = await repository.findById('missing');
    await repository.save(found as PaymentOrder);

    expect(found?.status).toBe('EXPIRED');
    expect(found?.dueAt).toEqual(DUE_AT);
    expect(missing).toBeUndefined();
    const saveCall = database.calls[2];
    expect(saveCall?.statement).toContain('MERGE dbo.payment_orders');
    expect(parameterValue(saveCall, 'amount')).toBe(100_000);
    expect(parameterValue(saveCall, 'status')).toBe('EXPIRED');
  });

  it('persiste y reproduce la respuesta idempotente de un evento', async () => {
    const database = new FakeSqlDatabase();
    const repository = new SqlPaymentEventRepository(database);
    const eventRow: PaymentEventRow = {
      id: 'event-1',
      payment_order_id: 'payment-1',
      result: 'APPROVED',
      occurred_at: new Date('2026-01-01T14:00:00.000Z'),
      origin_verification_data: 'verified-test-origin',
      content_key: 'same-content',
      response_event_id: 'event-1',
      response_payment_order_id: 'payment-1',
      response_result: 'APPROVED',
      response_order_status: 'PAID',
    };
    database.enqueue([eventRow]);
    database.enqueue([eventRow]);

    const first = await repository.findById('event-1');
    const repeated = await repository.findById('event-1');
    await repository.save(first as ProcessedPaymentEvent);

    expect(repeated).toEqual(first);
    expect(database.calls[2]?.statement).toContain(
      'INSERT INTO dbo.payment_events',
    );
    expect(parameterValue(database.calls[2], 'contentKey')).toBe(
      'same-content',
    );
  });

  it('consulta usuarios por ID y correo normalizado usando parámetros', async () => {
    const database = new FakeSqlDatabase();
    const repository = new SqlUserRepository(database);
    const user = new User(
      'user-1',
      new Email('USER@EXAMPLE.COM'),
      'stored-password-hash',
      'Andrea Rojas',
    );
    database.enqueue([{ exists: 1 }]);
    const row: UserRow = {
      id: 'user-1',
      name: 'Andrea Rojas',
      email: 'user@example.com',
      password_hash: 'stored-password-hash',
    };
    database.enqueue<UserRow>([row]);
    database.enqueue<UserRow>([row]);

    expect(await repository.existsByEmail(user.email)).toBe(true);
    const restoredById = await repository.findById(user.id);
    const restoredByEmail = await repository.findByEmail(user.email);
    expect(restoredById?.email.value).toBe('user@example.com');
    expect(restoredByEmail?.passwordHash).toBe('stored-password-hash');
    expect(restoredByEmail?.name).toBe('Andrea Rojas');
    await repository.save(user);

    expect(parameterValue(database.calls[0], 'email')).toBe('user@example.com');
    expect(database.calls[3]?.statement).toContain('MERGE dbo.users');
    expect(parameterValue(database.calls[3], 'passwordHash')).toBe(
      'stored-password-hash',
    );
  });

  it('restaura una subasta desde consultas normalizadas y parametrizadas', async () => {
    const database = new FakeSqlDatabase();
    const repository = new SqlAuctionRepository(database);
    const maliciousId = "auction-1'; DROP TABLE dbo.auctions; --";
    const auctionRow: AuctionRow = {
      id: maliciousId,
      seller_id: 'seller-1',
      article_denomination: 'Reloj',
      article_description: 'Reloj mecánico',
      article_conservation_state: 'USED',
      category_name: 'Coleccionables',
      base_price: 100_000,
      minimum_increment: 10_000,
      published_at: new Date('2026-01-01T12:00:00.000Z'),
      closes_at: CREATED_AT,
      status: 'OPEN',
      version: 0,
      closure_id: null,
      winning_bid_id: null,
    };
    database.enqueue<AuctionRow>([auctionRow]);
    database.enqueue<AcceptedBidRow>([]);
    database.enqueue<RejectedBidAttemptRow>([]);
    database.enqueue<PaymentOrderRow>([]);

    const auction = await repository.findById(maliciousId);

    expect(auction?.id).toBe(maliciousId);
    expect(database.calls[0]?.statement).not.toContain(maliciousId);
    expect(parameterValue(database.calls[0], 'auctionId')).toBe(maliciousId);
  });

  it('filtra, cuenta y pagina subastas en SQL con parámetros', async () => {
    const database = new FakeSqlDatabase();
    const repository = new SqlAuctionRepository(database);
    const category = "Libros'; DROP TABLE dbo.auctions; --";
    const auctionRow: AuctionRow = {
      id: 'auction-page-1',
      seller_id: 'seller-1',
      article_denomination: 'Libro',
      article_description: 'Primera edición',
      article_conservation_state: 'USED',
      category_name: category,
      base_price: 100_000,
      minimum_increment: 10_000,
      published_at: new Date('2026-01-01T12:00:00.000Z'),
      closes_at: CREATED_AT,
      status: 'OPEN',
      version: 0,
      closure_id: null,
      winning_bid_id: null,
    };
    database.enqueue([{ total: 3 }]);
    database.enqueue([{ id: auctionRow.id }]);
    database.enqueue([auctionRow]);
    database.enqueue<AcceptedBidRow>([]);
    database.enqueue<RejectedBidAttemptRow>([]);
    database.enqueue<PaymentOrderRow>([]);

    const page = await repository.findPage({
      category,
      status: 'OPEN',
      page: 2,
      limit: 1,
    });

    expect(page.total).toBe(3);
    expect(page.items.map((auction) => auction.id)).toEqual(['auction-page-1']);
    expect(database.transactionCount).toBe(1);
    expect(database.calls[0]?.statement).toContain('COUNT(*)');
    expect(database.calls[1]?.statement).toContain('OFFSET @offset ROWS');
    expect(database.calls[1]?.statement).not.toContain(category);
    expect(parameterValue(database.calls[1], 'category')).toBe(category);
    expect(parameterValue(database.calls[1], 'status')).toBe('OPEN');
    expect(parameterValue(database.calls[1], 'offset')).toBe(1);
    expect(parameterValue(database.calls[1], 'limit')).toBe(1);
  });

  it('guarda el agregado de subasta dentro de una transacción', async () => {
    const database = new FakeSqlDatabase();
    const repository = new SqlAuctionRepository(database);
    const auction = (await createOpenAuction(
      database,
      repository,
    )) as NonNullable<Awaited<ReturnType<SqlAuctionRepository['findById']>>>;
    database.transactionCount = 0;
    database.enqueue([{ version: 1 }]);

    await repository.save(auction);

    expect(database.transactionCount).toBe(1);
    expect(
      database.calls.some((call) =>
        call.statement.includes(
          'WHERE id = @id AND version = @expectedVersion',
        ),
      ),
    ).toBe(true);
    expect(
      database.calls.some((call) =>
        call.statement.includes('DELETE FROM dbo.accepted_bids'),
      ),
    ).toBe(true);
  });

  it('rechaza una escritura cuando cambió la versión leída del agregado', async () => {
    const database = new FakeSqlDatabase();
    const repository = new SqlAuctionRepository(database);
    const auction = (await createOpenAuction(database, repository)) as Auction;
    database.enqueue([]);

    await expect(repository.save(auction)).rejects.toBeInstanceOf(
      ConcurrentAuctionUpdateError,
    );

    expect(
      database.calls.some((call) =>
        call.statement.includes('DELETE FROM dbo.accepted_bids'),
      ),
    ).toBe(false);
  });
});

async function createOpenAuction(
  database: FakeSqlDatabase,
  repository: SqlAuctionRepository,
) {
  database.enqueue<AuctionRow>([
    {
      id: 'auction-1',
      seller_id: 'seller-1',
      article_denomination: 'Reloj',
      article_description: 'Reloj mecánico',
      article_conservation_state: 'USED',
      category_name: 'Coleccionables',
      base_price: 100_000,
      minimum_increment: 10_000,
      published_at: new Date('2026-01-01T12:00:00.000Z'),
      closes_at: CREATED_AT,
      status: 'OPEN',
      version: 0,
      closure_id: null,
      winning_bid_id: null,
    },
  ]);
  database.enqueue<AcceptedBidRow>([]);
  database.enqueue<RejectedBidAttemptRow>([]);
  database.enqueue<PaymentOrderRow>([]);
  return repository.findById('auction-1');
}

function parameterValue(call: QueryCall | undefined, name: string): unknown {
  return call?.parameters.find((parameter) => parameter.name === name)?.value;
}
