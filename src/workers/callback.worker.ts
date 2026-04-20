import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function startCallbackWorker(): Worker {
  const worker = new Worker(
    'callback',
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, 'callback: processing');
      // TODO: implementar callbacks (retry de notificações, etc.)
      return { ok: true };
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

  return worker;
}
