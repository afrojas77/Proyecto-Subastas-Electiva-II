import type { Auction } from '../../domain/entities/auction';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import { AuctionStatus } from '../../domain/value-objects/auction-status';
import { Category } from '../../domain/value-objects/category';
import { InvalidPaginationError } from '../errors/invalid-pagination.error';

export const DEFAULT_AUCTION_PAGE = 1;
export const DEFAULT_AUCTION_PAGE_LIMIT = 20;
export const MAXIMUM_AUCTION_PAGE_LIMIT = 100;

export interface ListAuctionsInput {
  category?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ListAuctionsResult {
  auctions: readonly Auction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class ListAuctions {
  constructor(private readonly auctionRepository: AuctionRepository) {}

  async execute(input: ListAuctionsInput = {}): Promise<ListAuctionsResult> {
    const page = input.page ?? DEFAULT_AUCTION_PAGE;
    const limit = input.limit ?? DEFAULT_AUCTION_PAGE_LIMIT;
    validatePagination(page, limit);

    const category = input.category
      ? new Category(input.category).name
      : undefined;
    const status = input.status
      ? AuctionStatus.from(input.status.trim().toUpperCase()).value
      : undefined;
    const result = await this.auctionRepository.findPage({
      ...(category ? { category } : {}),
      ...(status ? { status } : {}),
      page,
      limit,
    });

    return {
      auctions: result.items,
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    };
  }
}

function validatePagination(page: number, limit: number): void {
  if (!Number.isInteger(page) || page <= 0) {
    throw new InvalidPaginationError('page debe ser un entero positivo.');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new InvalidPaginationError('limit debe ser un entero positivo.');
  }
  if (limit > MAXIMUM_AUCTION_PAGE_LIMIT) {
    throw new InvalidPaginationError(
      `limit no puede ser mayor que ${MAXIMUM_AUCTION_PAGE_LIMIT}.`,
    );
  }
}
