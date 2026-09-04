import express from 'express';

import { healthRouter } from './infrastructure/http/routes/health.routes';

export const app = express();

app.use(express.json());
app.use('/health', healthRouter);
