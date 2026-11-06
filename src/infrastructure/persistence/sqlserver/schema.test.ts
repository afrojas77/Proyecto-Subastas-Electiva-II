import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from '@jest/globals';

const schema = readFileSync(
  resolve(process.cwd(), 'database', 'schema.sql'),
  'utf8',
);

describe('esquema SQL Server', () => {
  it('protege correo único y valores monetarios enteros', () => {
    expect(schema).toContain('CONSTRAINT UQ_users_email UNIQUE (email)');
    expect(schema).toContain('name NVARCHAR(200) NOT NULL');
    expect(schema).toContain("COL_LENGTH(N'dbo.users', N'name')");
    expect(schema).toContain('password_hash NVARCHAR(255) NULL');
    expect(schema).toContain('base_price BIGINT NOT NULL');
    expect(schema).toContain('amount BIGINT NOT NULL');
    expect(schema).toContain('9007199254740991');
    expect(schema).toContain('version BIGINT NOT NULL');
    expect(schema).toContain("COL_LENGTH(N'dbo.auctions', N'version')");
  });

  it('define relaciones e índices de idempotencia y vencimiento', () => {
    expect(schema).toContain('CONSTRAINT PK_payment_events PRIMARY KEY (id)');
    expect(schema).toContain('CONSTRAINT FK_payment_orders_auction');
    expect(schema).toContain('CONSTRAINT FK_auction_closures_winning_bid');
    expect(schema).toContain('IX_payment_orders_status_due_at');
    expect(schema).toContain('IX_accepted_bids_bidder_auction');
  });
});
