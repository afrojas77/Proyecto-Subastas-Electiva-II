import type { Config } from 'jest';

process.env.NODE_ENV = 'test';

const config: Config = {
  clearMocks: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.socket.test.ts'],
  testTimeout: 15_000,
};

export default config;
