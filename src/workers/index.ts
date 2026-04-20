import 'reflect-metadata';
import { AppDataSource } from '../database/data-source.js';
import { registerRepositories } from '../utils/di.js';
import { logger } from '../utils/logger.js';
import { startCallbackWorker } from './callback.worker.js';
import { startImportBaseWorker } from './import-base.worker.js';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  registerRepositories(AppDataSource);

  const importWorker = startImportBaseWorker();
  const callbackWorker = startCallbackWorker();

  logger.info('workers: started');

  const shutdown = async () => {
    logger.info('workers: shutting down');
    await importWorker.close();
    await callbackWorker.close();
    await AppDataSource.destroy();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'workers: fatal');
  process.exit(1);
});
