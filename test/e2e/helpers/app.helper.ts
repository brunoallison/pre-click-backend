/**
 * Helper de bootstrap para testes E2E.
 *
 * Fluxo:
 * 1. Sobe Postgres via Testcontainers.
 * 2. Conecta TypeORM, roda migrations.
 * 3. Registra repositórios no container DI.
 * 4. Registra FakeGcsProvider no lugar do GcsProvider real.
 * 5. Monta o app Express e retorna supertest agent.
 */
import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express } from 'express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import * as entities from '../../../src/entities/index.js';
import { registerRepositories, container } from '../../../src/utils/di.js';
import { errorHandler } from '../../../src/middlewares/error-handler.middleware.js';
import { authRouter } from '../../../src/modules/auth/auth.routes.js';
import { ordersRouter } from '../../../src/modules/orders/orders.routes.js';
import { exportsRouter } from '../../../src/modules/exports/exports.routes.js';
import { healthRouter } from '../../../src/modules/health/health.routes.js';
import { GcsProvider } from '../../../src/providers/gcs/gcs.provider.js';
import { FakeGcsProvider } from '../../../src/providers/gcs/__fakes__/fake-gcs.provider.js';
import { FakeProvider } from '../../../src/decorators/fake-provider.decorator.js';

export interface TestContext {
  app: Express;
  dataSource: DataSource;
  pgContainer: StartedPostgreSqlContainer;
  fakeGcs: FakeGcsProvider;
  teardown: () => Promise<void>;
  makeToken: (opts: { userId: string; tenantId: string | null; role?: 'super_admin' | 'user' }) => string;
  seedUser: (opts: { tenantId?: string | null; role?: 'super_admin' | 'user'; email?: string }) => Promise<{ id: string; email: string }>;
  seedTenant: () => Promise<{ id: string; slug: string }>;
}

export async function buildTestApp(): Promise<TestContext> {
  // 1. Sobe Postgres
  const pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('pedido_test')
    .withUsername('pedido')
    .withPassword('pedido')
    .start();

  // 2. DataSource com migrations
  const dataSource = new DataSource({
    type: 'postgres',
    host: pgContainer.getHost(),
    port: pgContainer.getMappedPort(5432),
    username: 'pedido',
    password: 'pedido',
    database: 'pedido_test',
    schema: 'public',
    entities: Object.values(entities).filter((e) => typeof e === 'function') as unknown[] as never[],
    migrations: ['src/migrations/*.ts'],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  await dataSource.runMigrations();

  // 3. Registra repositórios no DI
  registerRepositories(dataSource);

  // 4. Fake GCS em memória (não bate no GCS real)
  const fakeGcs = new FakeGcsProvider();
  FakeProvider(GcsProvider.name, fakeGcs);
  // Registra também pelo token string que alguns tasks usam
  container.register('GcsProvider', { useValue: fakeGcs });

  // 5. Monta Express
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  const v1 = express.Router();
  v1.use('/auth', authRouter);
  v1.use('/orders', ordersRouter);
  v1.use('/exports', exportsRouter);
  v1.use('/health', healthRouter);
  app.use('/api/v1', v1);
  app.use(errorHandler);

  // Utilitários de teste
  const JWT_SECRET = 'test-secret-for-e2e-tests-min-16';
  process.env['JWT_SECRET'] = JWT_SECRET;

  function makeToken(opts: { userId: string; tenantId: string | null; role?: 'super_admin' | 'user' }): string {
    return jwt.sign(
      { sub: opts.userId, tid: opts.tenantId, role: opts.role ?? 'user' },
      JWT_SECRET,
      { expiresIn: 900 },
    );
  }

  async function seedTenant(): Promise<{ id: string; slug: string }> {
    const result = await dataSource.query<Array<{ id: string; slug: string }>>(
      `INSERT INTO tenant (slug, display_name) VALUES ($1, $2) RETURNING id, slug`,
      [`tenant-${Date.now()}`, 'Tenant Teste E2E'],
    );
    return result[0];
  }

  async function seedUser(opts: { tenantId?: string | null; role?: 'super_admin' | 'user'; email?: string } = {}): Promise<{ id: string; email: string }> {
    const email = opts.email ?? `user-${Date.now()}@e2e.test`;
    const tenantId = opts.tenantId !== undefined ? opts.tenantId : null;
    const role = opts.role ?? (tenantId ? 'user' : 'super_admin');
    const hash = await argon2.hash('senha-teste-12345');
    const result = await dataSource.query<Array<{ id: string; email: string }>>(
      `INSERT INTO "user" (tenant_id, email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email`,
      [tenantId, email, hash, 'Usuário Teste', role],
    );
    return result[0];
  }

  const teardown = async () => {
    await dataSource.destroy();
    await pgContainer.stop();
  };

  return { app, dataSource, pgContainer, fakeGcs, teardown, makeToken, seedUser, seedTenant };
}
