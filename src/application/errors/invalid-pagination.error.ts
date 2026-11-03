export class InvalidPaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaginationError';
  }
}
