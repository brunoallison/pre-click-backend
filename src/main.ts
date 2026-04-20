import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { AppDataSource } from './database/data-source.js';
import { createRedisClient } from './database/redis-client.js';
import { errorHandler } from './middlewares/error-handler.middleware.js';
import { requestLogger } from './middlewares/request-logger.middleware.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { aiRouter } from './modules/ai/ai.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { clickErrorsRouter } from './modules/click-errors/click-errors.routes.js';
import { collectionsRouter } from './modules/collections/collections.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { exportsRouter } from './modules/exports/exports.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { insightsRouter } from './modules/insights/insights.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { storesRouter } from './modules/stores/stores.routes.js';
import { tenantBudgetRouter } from './modules/tenant-budget/tenant-budget.routes.js';
import { registerRepositories } from './utils/di.js';
import { logger } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();
  logger.info('database: connected');

  createRedisClient();

  registerRepositories(AppDataSource);

  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(requestLogger);

  const v1 = express.Router();
  v1.use('/auth', authRouter);
  v1.use('/admin', adminRouter);
  v1.use('/stores', storesRouter);
  v1.use('/collections', collectionsRouter);
  v1.use('/catalog', catalogRouter);
  v1.use('/orders', ordersRouter);
  v1.use('/exports', exportsRouter);
  v1.use('/click-errors', clickErrorsRouter);
  v1.use('/dashboard', dashboardRouter);
  v1.use('/insights', insightsRouter);
  v1.use('/ai', aiRouter);
  v1.use('/tenant-budget', tenantBudgetRouter);
  v1.use('/health', healthRouter);

  app.use('/api/v1', v1);
  app.use(errorHandler);

  app.listen(env.PORT, () => {
    logger.info(`http: listening on :${env.PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'bootstrap: fatal');
  process.exit(1);
});
