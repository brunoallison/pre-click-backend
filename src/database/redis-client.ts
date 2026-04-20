import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/** Cliente Redis compartilhado. Criado uma vez no bootstrap. */
export let redisClient: Redis;

export function createRedisClient(): Redis {
  redisClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    tls: env.REDIS_TLS ? {} : undefined,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
  });

  redisClient.on('error', (err: Error) => {
    logger.error({ err }, 'redis: connection error');
  });

  redisClient.on('connect', () => {
    logger.info('redis: connected');
  });

  return redisClient;
}
