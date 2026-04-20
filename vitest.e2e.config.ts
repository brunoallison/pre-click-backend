import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    pool: 'forks',
    // Testes E2E rodam sequencialmente para evitar conflitos de porta/container
    fileParallelism: false,
    // setupFiles roda em cada worker antes dos testes, após o env do processo ser herdado
    // As variáveis de ambiente são definidas no próprio setup.ts (process.env) para garantir
    // que env.ts valida corretamente durante o import dos módulos
    setupFiles: ['test/e2e/setup.ts'],
    env: {
      NODE_ENV: 'test',
      POSTGRES_USERNAME: 'pedido',
      POSTGRES_PASSWORD: 'pedido',
      POSTGRES_DATABASE: 'pedido_test',
      POSTGRES_HOST: '127.0.0.1',
      REDIS_HOST: '127.0.0.1',
      JWT_SECRET: 'test-secret-for-e2e-tests-min-16-chars',
      GCS_BUCKET_NAME: 'fake-bucket-e2e',
      COOKIE_DOMAIN: 'localhost',
    },
  },
});
