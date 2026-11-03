import { Router, type RequestHandler } from 'express';

import type { UserController } from '../controllers/user.controller';

export function createUserRouter(
  controller: UserController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.post('/register', controller.register);
  router.get('/me', authenticate, controller.me);
  return router;
}
