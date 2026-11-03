import { describe, expect, it } from '@jest/globals';

import { Auction } from '../../domain/entities/auction';
import { PaymentOrder } from '../../domain/entities/payment-order';
import { Article } from '../../domain/value-objects/article';
import { AuctionStatus } from '../../domain/value-objects/auction-status';
import { Category } from '../../domain/value-objects/category';
import { Money } from '../../domain/value-objects/money';
import { InMemoryAuctionRepository } from '../../infrastructure/persistence/memory/in-memory-auction.repository';
import { InMemoryPaymentOrderRepository } from '../../infrastructure/persistence/memory/in-memory-payment-order.repository';
import { AuthorizationError } from '../errors/authorization.error';
import { InvalidPaginationError } from '../errors/invalid-pagination.error';
import { ResourceNotFoundError } from '../errors/resource-not-found.error';
import { GetPaymentOrder } from './get-payment-order';
import {
  DEFAULT_AUCTION_PAGE_LIMIT,
  ListAuctions,
  MAXIMUM_AUCTION_PAGE_LIMIT,
} from './list-auctions';

describe('consultas de subastas', () => {
  it('aplica valores predeterminados y devuelve totales', async () => {
    const repository = await auctionRepositoryWithFixtures();

    const result = await new ListAuctions(repository).execute();

    expect(result).toEqual(
      expect.objectContaining({
        page: 1,
        limit: DEFAULT_AUCTION_PAGE_LIMIT,
        total: 4,
        totalPages: 1,
      }),
    );
    expect(result.auctions.map((auction) => auction.id)).toEqual([
      'auction-1',
      'auction-2',
      'auction-3',
      'auction-4',
    ]);
  });

  it('combina categoría y estado normalizados', async () => {
    const repository = await auctionRepositoryWithFixtures();

    const result = await new ListAuctions(repository).execute({
      category: '  Libros  ',
      status: 'cancelled',
    });

    expect(result.total).toBe(1);
    expect(result.auctions.map((auction) => auction.id)).toEqual([
      'auction-3',
    ]);
  });

  it('filtra individualmente por categoría y por estado', async () => {
    const repository = await auctionRepositoryWithFixtures();
    const useCase = new ListAuctions(repository);

    const byCategory = await useCase.execute({ category: 'Arte' });
    const byStatus = await useCase.execute({ status: 'CANCELLED' });

    expect(byCategory.auctions.map((auction) => auction.id)).toEqual([
      'auction-4',
    ]);
    expect(byStatus.auctions.map((auction) => auction.id)).toEqual([
      'auction-3',
    ]);
  });

  it('pagina en orden determinista y permite páginas vacías', async () => {
    const repository = await auctionRepositoryWithFixtures();
    const useCase = new ListAuctions(repository);

    const first = await useCase.execute({ page: 1, limit: 2 });
    const second = await useCase.execute({ page: 2, limit: 2 });
    const empty = await useCase.execute({ page: 3, limit: 2 });

    expect(first.auctions.map((auction) => auction.id)).toEqual([
      'auction-1',
      'auction-2',
    ]);
    expect(second.auctions.map((auction) => auction.id)).toEqual([
      'auction-3',
      'auction-4',
    ]);
    expect(empty.auctions).toEqual([]);
    expect(empty).toEqual(expect.objectContaining({ total: 4, totalPages: 2 }));
  });

  it.each([
    { page: 0, limit: 20 },
    { page: 1.5, limit: 20 },
    { page: 1, limit: 0 },
    { page: 1, limit: MAXIMUM_AUCTION_PAGE_LIMIT + 1 },
  ])('rechaza paginación inválida: %o', async (input) => {
    const repository = new InMemoryAuctionRepository();

    await expect(new ListAuctions(repository).execute(input)).rejects.toBeInstanceOf(
      InvalidPaginationError,
    );
  });
});

describe('consulta autorizada de órdenes de pago', () => {
  it('devuelve la orden únicamente al ganador asociado', async () => {
    const repository = new InMemoryPaymentOrderRepository();
    const order = paymentOrder();
    await repository.save(order);
    const useCase = new GetPaymentOrder(repository);

    await expect(
      useCase.execute({ paymentOrderId: order.id, requesterId: 'winner-1' }),
    ).resolves.toBe(order);
    await expect(
      useCase.execute({ paymentOrderId: order.id, requesterId: 'other-user' }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('distingue una orden inexistente', async () => {
    const useCase = new GetPaymentOrder(
      new InMemoryPaymentOrderRepository(),
    );

    await expect(
      useCase.execute({ paymentOrderId: 'missing', requesterId: 'winner-1' }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});

async function auctionRepositoryWithFixtures() {
  const repository = new InMemoryAuctionRepository();
  await repository.save(auction('auction-4', 'Arte', AuctionStatus.OPEN, 4));
  await repository.save(auction('auction-2', 'Libros', AuctionStatus.OPEN, 2));
  await repository.save(
    auction('auction-3', 'Libros', AuctionStatus.CANCELLED, 3),
  );
  await repository.save(auction('auction-1', 'Libros', AuctionStatus.OPEN, 1));
  return repository;
}

function auction(
  id: string,
  category: string,
  status: AuctionStatus,
  publishedHour: number,
): Auction {
  const publishedAt = new Date(`2026-01-01T0${publishedHour}:00:00.000Z`);
  return Auction.restore({
    id,
    sellerId: 'seller-1',
    article: new Article('Artículo', 'Descripción', 'USED'),
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

function paymentOrder(): PaymentOrder {
  const createdAt = new Date('2026-01-01T12:00:00.000Z');
  return PaymentOrder.create(
    'payment-1',
    'auction-1',
    'winner-1',
    new Money(120_000),
    createdAt,
  );
}
