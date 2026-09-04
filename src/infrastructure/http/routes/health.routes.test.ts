import { describe, expect, it } from '@jest/globals';
import request from 'supertest';

import { app } from '../../../app';

describe('GET /health', () => {
  it('confirma que el servidor está disponible', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
