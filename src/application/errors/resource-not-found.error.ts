export class ResourceNotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} no encontrado: ${id}`);
    this.name = 'ResourceNotFoundError';
  }
}
