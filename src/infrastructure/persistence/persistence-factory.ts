import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { PaymentEventRepository } from '../../domain/ports/payment-event.repository';
import type { PaymentOrderRepository } from '../../domain/ports/payment-order.repository';
import type { UserRepository } from '../../domain/ports/user.repository';
import type { PersistenceTransaction } from '../../application/ports/persistence-transaction';
import { InMemoryAuctionRepository } from './memory/in-memory-auction.repository';
import { InMemoryPaymentEventRepository } from './memory/in-memory-payment-event.repository';
import { InMemoryPaymentOrderRepository } from './memory/in-memory-payment-order.repository';
import { InMemoryUserRepository } from './memory/in-memory-user.repository';
import { loadSqlServerConfig } from './sqlserver/sqlserver-config';
import { SqlAuctionRepository } from './sqlserver/sql-auction.repository';
import { SqlPaymentEventRepository } from './sqlserver/sql-payment-event.repository';
import { SqlPaymentOrderRepository } from './sqlserver/sql-payment-order.repository';
import { SqlPersistenceTransaction } from './sqlserver/sql-persistence-transaction';
import { SqlUserRepository } from './sqlserver/sql-user.repository';
import { SqlServerDatabase } from './sqlserver/sqlserver-database';

export interface PersistenceAdapters {
  auctionRepository: AuctionRepository;
  paymentEventRepository: PaymentEventRepository;
  paymentOrderRepository: PaymentOrderRepository;
  persistenceTransaction?: PersistenceTransaction;
  userRepository: UserRepository;
  close(): Promise<void>;
}

export async function createPersistenceAdapters(
  environment: NodeJS.ProcessEnv,
): Promise<PersistenceAdapters> {
  const persistence = selectPersistence(environment);
  if (persistence === 'memory') {
    return {
      auctionRepository: new InMemoryAuctionRepository(),
      paymentEventRepository: new InMemoryPaymentEventRepository(),
      paymentOrderRepository: new InMemoryPaymentOrderRepository(),
      userRepository: new InMemoryUserRepository(),
      close: () => Promise.resolve(),
    };
  }

  const database = new SqlServerDatabase(loadSqlServerConfig(environment));
  await database.connect();
  return {
    auctionRepository: new SqlAuctionRepository(database),
    paymentEventRepository: new SqlPaymentEventRepository(database),
    paymentOrderRepository: new SqlPaymentOrderRepository(database),
    persistenceTransaction: new SqlPersistenceTransaction(database),
    userRepository: new SqlUserRepository(database),
    close: () => database.close(),
  };
}

export function selectPersistence(
  environment: NodeJS.ProcessEnv,
): 'memory' | 'sqlserver' {
  const configured = environment.PERSISTENCE?.trim().toLowerCase();
  if (!configured) {
    if (environment.NODE_ENV === 'production') {
      throw new Error(
        'PERSISTENCE=sqlserver es obligatorio en producción.',
      );
    }
    return 'memory';
  }
  if (configured !== 'memory' && configured !== 'sqlserver') {
    throw new Error('PERSISTENCE debe ser memory o sqlserver.');
  }
  if (environment.NODE_ENV === 'production' && configured === 'memory') {
    throw new Error(
      'La persistencia en memoria no está permitida en producción.',
    );
  }
  return configured;
}
