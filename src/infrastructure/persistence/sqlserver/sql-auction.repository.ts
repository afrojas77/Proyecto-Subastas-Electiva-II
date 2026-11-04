import * as mssql from 'mssql';

import { ConcurrentAuctionUpdateError } from '../../../application/errors/concurrent-auction-update.error';
import type { Auction } from '../../../domain/entities/auction';
import type {
  AuctionPage,
  AuctionPageQuery,
  AuctionRepository,
} from '../../../domain/ports/auction.repository';
import type { SqlDatabase, SqlExecutor } from './sql-executor';
import {
  restoreAuction,
  type AcceptedBidRow,
  type AuctionRow,
  type PaymentOrderRow,
  type RejectedBidAttemptRow,
} from './sqlserver-mappers';

export class SqlAuctionRepository implements AuctionRepository {
  private readonly aggregateVersions = new WeakMap<Auction, number>();

  constructor(private readonly database: SqlDatabase) {}

  findById(id: string): Promise<Auction | undefined> {
    return this.database.transaction((executor) => this.loadById(executor, id));
  }

  private async loadById(
    executor: SqlExecutor,
    id: string,
  ): Promise<Auction | undefined> {
    const parameters = [
      { name: 'auctionId', type: mssql.NVarChar(100), value: id },
    ];
    const auctionResult = await executor.query<AuctionRow>(
      `SELECT a.id, a.seller_id, a.article_denomination,
              a.article_description, a.article_conservation_state,
              a.category_name, a.base_price, a.minimum_increment,
              a.published_at, a.closes_at, a.status, a.version,
              c.auction_id AS closure_id, c.winning_bid_id
       FROM dbo.auctions AS a
       LEFT JOIN dbo.auction_closures AS c ON c.auction_id = a.id
       WHERE a.id = @auctionId;`,
      parameters,
    );
    const auctionRow = auctionResult.recordset[0];
    if (!auctionRow) {
      return undefined;
    }

    const bidResult = await executor.query<AcceptedBidRow>(
      `SELECT id, auction_id, bidder_id, amount, placed_at, sequence
       FROM dbo.accepted_bids
       WHERE auction_id = @auctionId
       ORDER BY sequence;`,
      parameters,
    );
    const rejectedResult = await executor.query<RejectedBidAttemptRow>(
      `SELECT id, auction_id, bidder_id, attempted_amount, attempted_at,
              reason, attempt_order
       FROM dbo.rejected_bid_attempts
       WHERE auction_id = @auctionId
       ORDER BY attempt_order;`,
      parameters,
    );
    const orderResult = await executor.query<PaymentOrderRow>(
      `SELECT id, auction_id, debtor_id, amount, created_at, due_at, status
       FROM dbo.payment_orders
       WHERE auction_id = @auctionId;`,
      parameters,
    );

    const auction = restoreAuction(
      auctionRow,
      bidResult.recordset,
      rejectedResult.recordset,
      orderResult.recordset[0],
    );
    this.aggregateVersions.set(auction, Number(auctionRow.version));
    return auction;
  }

  findPage(query: AuctionPageQuery): Promise<AuctionPage> {
    return this.database.transaction(async (executor) => {
      const conditions: string[] = [];
      const parameters = [];
      if (query.category) {
        conditions.push(
          'category_name COLLATE Latin1_General_100_BIN2 = @category',
        );
        parameters.push({
          name: 'category',
          type: mssql.NVarChar(200),
          value: query.category,
        });
      }
      if (query.status) {
        conditions.push('status = @status');
        parameters.push({
          name: 'status',
          type: mssql.NVarChar(20),
          value: query.status,
        });
      }
      const where = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : '';
      const countResult = await executor.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM dbo.auctions ${where};`,
        parameters,
      );
      const offset = (query.page - 1) * query.limit;
      const pageResult = await executor.query<{ id: string }>(
        `SELECT id
         FROM dbo.auctions
         ${where}
         ORDER BY published_at, id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`,
        [
          ...parameters,
          { name: 'offset', type: mssql.Int, value: offset },
          { name: 'limit', type: mssql.Int, value: query.limit },
        ],
      );
      const items: Auction[] = [];
      for (const row of pageResult.recordset) {
        const auction = await this.loadById(executor, row.id);
        if (auction) {
          items.push(auction);
        }
      }
      return {
        items,
        total: Number(countResult.recordset[0]?.total ?? 0),
      };
    });
  }

  async save(auction: Auction): Promise<void> {
    const expectedVersion = this.aggregateVersions.get(auction);
    const persistedVersion = await this.database.transaction(
      async (executor) => {
        const newVersion = await saveAuctionRow(
          executor,
          auction,
          expectedVersion,
        );
        await executor.query(
          `DELETE FROM dbo.auction_closures WHERE auction_id = @auctionId;
         DELETE FROM dbo.rejected_bid_attempts WHERE auction_id = @auctionId;
         DELETE FROM dbo.accepted_bids WHERE auction_id = @auctionId;`,
          [
            {
              name: 'auctionId',
              type: mssql.NVarChar(100),
              value: auction.id,
            },
          ],
        );

        for (const bid of auction.acceptedBids) {
          await executor.query(
            `INSERT INTO dbo.accepted_bids (
             id, auction_id, bidder_id, amount, placed_at, sequence
           ) VALUES (
             @id, @auctionId, @bidderId, @amount, @placedAt, @sequence
           );`,
            [
              { name: 'id', type: mssql.NVarChar(100), value: bid.id },
              {
                name: 'auctionId',
                type: mssql.NVarChar(100),
                value: bid.auctionId,
              },
              {
                name: 'bidderId',
                type: mssql.NVarChar(100),
                value: bid.bidderId,
              },
              { name: 'amount', type: mssql.BigInt, value: bid.amount.amount },
              {
                name: 'placedAt',
                type: mssql.DateTime2(3),
                value: bid.placedAt,
              },
              { name: 'sequence', type: mssql.Int, value: bid.sequence },
            ],
          );
        }

        for (const [index, attempt] of auction.rejectedBidAttempts.entries()) {
          await executor.query(
            `INSERT INTO dbo.rejected_bid_attempts (
             id, auction_id, bidder_id, attempted_amount, attempted_at,
             reason, attempt_order
           ) VALUES (
             @id, @auctionId, @bidderId, @attemptedAmount, @attemptedAt,
             @reason, @attemptOrder
           );`,
            [
              { name: 'id', type: mssql.NVarChar(100), value: attempt.id },
              {
                name: 'auctionId',
                type: mssql.NVarChar(100),
                value: attempt.auctionId,
              },
              {
                name: 'bidderId',
                type: mssql.NVarChar(100),
                value: attempt.bidderId,
              },
              {
                name: 'attemptedAmount',
                type: mssql.BigInt,
                value: attempt.attemptedAmount.amount,
              },
              {
                name: 'attemptedAt',
                type: mssql.DateTime2(3),
                value: attempt.attemptedAt,
              },
              {
                name: 'reason',
                type: mssql.NVarChar(40),
                value: attempt.reason,
              },
              { name: 'attemptOrder', type: mssql.Int, value: index + 1 },
            ],
          );
        }

        if (auction.closure) {
          await executor.query(
            `INSERT INTO dbo.auction_closures (
             auction_id, status, winning_bid_id
           ) VALUES (@auctionId, @status, @winningBidId);`,
            [
              {
                name: 'auctionId',
                type: mssql.NVarChar(100),
                value: auction.closure.auctionId,
              },
              {
                name: 'status',
                type: mssql.NVarChar(20),
                value: auction.closure.status.value,
              },
              {
                name: 'winningBidId',
                type: mssql.NVarChar(100),
                value: auction.closure.winningBid?.id ?? null,
              },
            ],
          );
        }
        return newVersion;
      },
    );
    this.aggregateVersions.set(auction, persistedVersion);
  }
}

async function saveAuctionRow(
  executor: SqlExecutor,
  auction: Auction,
  expectedVersion: number | undefined,
): Promise<number> {
  const parameters = [
    { name: 'id', type: mssql.NVarChar(100), value: auction.id },
    {
      name: 'sellerId',
      type: mssql.NVarChar(100),
      value: auction.sellerId,
    },
    {
      name: 'articleDenomination',
      type: mssql.NVarChar(200),
      value: auction.article.denomination,
    },
    {
      name: 'articleDescription',
      type: mssql.NVarChar(2000),
      value: auction.article.description,
    },
    {
      name: 'articleConservationState',
      type: mssql.NVarChar(20),
      value: auction.article.conservationState,
    },
    {
      name: 'categoryName',
      type: mssql.NVarChar(200),
      value: auction.category.name,
    },
    {
      name: 'basePrice',
      type: mssql.BigInt,
      value: auction.basePrice.amount,
    },
    {
      name: 'minimumIncrement',
      type: mssql.BigInt,
      value: auction.minimumIncrement.amount,
    },
    {
      name: 'publishedAt',
      type: mssql.DateTime2(3),
      value: auction.publishedAt,
    },
    {
      name: 'closesAt',
      type: mssql.DateTime2(3),
      value: auction.closesAt,
    },
    {
      name: 'status',
      type: mssql.NVarChar(20),
      value: auction.status.value,
    },
  ];

  if (expectedVersion !== undefined) {
    const result = await executor.query<{ version: number | string }>(
      `UPDATE dbo.auctions
       SET seller_id = @sellerId,
           article_denomination = @articleDenomination,
           article_description = @articleDescription,
           article_conservation_state = @articleConservationState,
           category_name = @categoryName,
           base_price = @basePrice,
           minimum_increment = @minimumIncrement,
           published_at = @publishedAt,
           closes_at = @closesAt,
           status = @status,
           version = version + 1
       OUTPUT inserted.version AS version
       WHERE id = @id AND version = @expectedVersion;`,
      [
        ...parameters,
        {
          name: 'expectedVersion',
          type: mssql.BigInt,
          value: expectedVersion,
        },
      ],
    );
    const row = result.recordset[0];
    if (!row) {
      throw new ConcurrentAuctionUpdateError(auction.id);
    }
    return Number(row.version);
  }

  const result = await executor.query<{ version: number | string }>(
    `MERGE dbo.auctions WITH (HOLDLOCK) AS target
     USING (
       SELECT @id AS id, @sellerId AS seller_id,
              @articleDenomination AS article_denomination,
              @articleDescription AS article_description,
              @articleConservationState AS article_conservation_state,
              @categoryName AS category_name, @basePrice AS base_price,
              @minimumIncrement AS minimum_increment,
              @publishedAt AS published_at, @closesAt AS closes_at,
              @status AS status
     ) AS source
     ON target.id = source.id
     WHEN MATCHED THEN UPDATE SET
       seller_id = source.seller_id,
       article_denomination = source.article_denomination,
       article_description = source.article_description,
       article_conservation_state = source.article_conservation_state,
       category_name = source.category_name,
       base_price = source.base_price,
       minimum_increment = source.minimum_increment,
       published_at = source.published_at,
       closes_at = source.closes_at,
       status = source.status,
       version = target.version + 1
     WHEN NOT MATCHED THEN INSERT (
       id, seller_id, article_denomination, article_description,
       article_conservation_state, category_name, base_price,
       minimum_increment, published_at, closes_at, status, version
     ) VALUES (
       source.id, source.seller_id, source.article_denomination,
       source.article_description, source.article_conservation_state,
       source.category_name, source.base_price, source.minimum_increment,
       source.published_at, source.closes_at, source.status, 0
     )
     OUTPUT inserted.version AS version;`,
    parameters,
  );
  const row = result.recordset[0];
  if (!row) {
    throw new Error(`No se pudo persistir la subasta ${auction.id}.`);
  }
  return Number(row.version);
}
