import { copyValidDate, requireNonEmpty } from '../internal/validation';

export enum NotificationType {
  BID_OUTBID = 'BID_OUTBID',
  AUCTION_WON = 'AUCTION_WON',
  AUCTION_CLOSED = 'AUCTION_CLOSED',
}

export class Notification {
  public readonly id: string;
  public readonly recipientId: string;
  public readonly auctionId: string;
  readonly #createdAt: Date;

  constructor(
    id: string,
    recipientId: string,
    auctionId: string,
    public readonly type: NotificationType,
    createdAt: Date,
  ) {
    this.id = requireNonEmpty(id, 'El identificador de la notificación');
    this.recipientId = requireNonEmpty(
      recipientId,
      'El destinatario de la notificación',
    );
    this.auctionId = requireNonEmpty(
      auctionId,
      'El identificador de la subasta',
    );
    this.#createdAt = copyValidDate(createdAt, 'La fecha de la notificación');
    Object.freeze(this);
  }

  get createdAt(): Date {
    return new Date(this.#createdAt.getTime());
  }
}
