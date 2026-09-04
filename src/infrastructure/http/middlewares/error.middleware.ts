import type { NextFunction, Request, Response } from 'express';

import { ResourceNotFoundError } from '../../../application/errors/resource-not-found.error';
import { BidRejectedError } from '../../../domain/errors/bid-rejected.error';
import { DomainError } from '../../../domain/errors/domain.error';
import { InvalidAuctionStateError } from '../../../domain/errors/invalid-auction-state.error';
import { ConsoleLogger } from '../../logging/console-logger';
import { HttpValidationError } from '../errors/http-validation.error';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export function createErrorMiddleware(logger: ConsoleLogger) {
  return (
    error: unknown,
    _request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    void next;
    if (error instanceof ResourceNotFoundError) {
      sendError(response, 404, 'RESOURCE_NOT_FOUND', error.message);
      return;
    }
    if (error instanceof InvalidAuctionStateError) {
      sendError(response, 409, error.code, error.message);
      return;
    }
    if (error instanceof BidRejectedError) {
      logger.info('Puja rechazada', { reason: error.reason });
      sendError(response, 400, error.code, error.message);
      return;
    }
    if (error instanceof SyntaxError) {
      sendError(response, 400, 'INVALID_JSON', 'El JSON enviado no es válido.');
      return;
    }
    if (error instanceof DomainError || error instanceof HttpValidationError) {
      const code =
        error instanceof DomainError ? error.code : 'INVALID_REQUEST';
      sendError(response, 400, code, error.message);
      return;
    }

    logger.error('Error no controlado', {
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
    sendError(response, 500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado.');
  };
}

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
): void {
  const body: ErrorResponse = { error: { code, message } };
  response.status(status).json(body);
}
