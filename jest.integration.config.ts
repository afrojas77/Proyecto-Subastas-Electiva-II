import type { Config } from 'jest';

// La suite siempre se ejecuta como prueba aunque el .env local use development.
process.env.NODE_ENV = 'test';

const config: Config = {
  clearMocks: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.integration.test.ts'],
  testTimeout: 60_000,
};

export default config;
