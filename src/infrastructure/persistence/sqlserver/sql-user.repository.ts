import * as mssql from 'mssql';

import type { User } from '../../../domain/entities/user';
import type { UserRepository } from '../../../domain/ports/user.repository';
import type { Email } from '../../../domain/value-objects/email';
import type { SqlDatabase } from './sql-executor';
import { restoreUser, type UserRow } from './sqlserver-mappers';

export class SqlUserRepository implements UserRepository {
  constructor(private readonly database: SqlDatabase) {}

  async existsByEmail(email: Email): Promise<boolean> {
    const result = await this.database.query<{ exists: number }>(
      `SELECT TOP (1) 1 AS [exists]
       FROM dbo.users
       WHERE email = @email;`,
      [{ name: 'email', type: mssql.NVarChar(320), value: email.value }],
    );
    return result.recordset.length > 0;
  }

  async findById(id: string): Promise<User | undefined> {
    const result = await this.database.query<UserRow>(
      `SELECT id, name, email, password_hash, document_type, document_number, phone
       FROM dbo.users
       WHERE id = @id;`,
      [{ name: 'id', type: mssql.NVarChar(100), value: id }],
    );
    const row = result.recordset[0];
    return row ? restoreUser(row) : undefined;
  }

  async findByEmail(email: Email): Promise<User | undefined> {
    const result = await this.database.query<UserRow>(
      `SELECT id, name, email, password_hash, document_type, document_number, phone
       FROM dbo.users
       WHERE email = @email;`,
      [{ name: 'email', type: mssql.NVarChar(320), value: email.value }],
    );
    const row = result.recordset[0];
    return row ? restoreUser(row) : undefined;
  }

  async save(user: User): Promise<void> {
    await this.database.query(
      `MERGE dbo.users AS target
       USING (
         SELECT @id AS id, @name AS name, @email AS email,
                @passwordHash AS password_hash, @documentType AS document_type,
                @documentNumber AS document_number, @phone AS phone
       ) AS source
       ON target.id = source.id
       WHEN MATCHED THEN UPDATE SET
         name = COALESCE(source.name, target.name),
         email = source.email,
         password_hash = COALESCE(source.password_hash, target.password_hash),
         document_type = COALESCE(source.document_type, target.document_type),
         document_number = COALESCE(source.document_number, target.document_number),
         phone = COALESCE(source.phone, target.phone)
       WHEN NOT MATCHED THEN INSERT
         (id, name, email, password_hash, document_type, document_number, phone)
         VALUES (source.id, source.name, source.email, source.password_hash,
                 source.document_type, source.document_number, source.phone);`,
      [
        { name: 'id', type: mssql.NVarChar(100), value: user.id },
        {
          name: 'name',
          type: mssql.NVarChar(200),
          value: user.name ?? null,
        },
        {
          name: 'email',
          type: mssql.NVarChar(320),
          value: user.email.value,
        },
        {
          name: 'passwordHash',
          type: mssql.NVarChar(255),
          value: user.passwordHash ?? null,
        },
        {
          name: 'documentType',
          type: mssql.NVarChar(20),
          value: user.documentType ?? null,
        },
        {
          name: 'documentNumber',
          type: mssql.NVarChar(30),
          value: user.documentNumber ?? null,
        },
        {
          name: 'phone',
          type: mssql.NVarChar(16),
          value: user.phone ?? null,
        },
      ],
    );
  }
}
