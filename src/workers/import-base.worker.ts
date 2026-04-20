import { Worker } from 'bullmq';
import { container } from '../utils/di.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ImportBaseTask } from '../modules/admin/tasks/import-base.task.js';

export function startImportBaseWorker(): Worker {
  const worker = new Worker(
    'import-base',
    async (job) => {
      const task = container.resolve(ImportBaseTask);
      return task.runAsJobBase({ body: job.data });
    },
    {
      connection: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        tls: env.REDIS_TLS ? {} : undefined,
      },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'import-base: completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'import-base: failed');
  });
  return worker;
}
