import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['dev', 'test', 'prod']).default('dev'),
  POSTGRES_HOST: z.string().min(1).default('127.0.0.1'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USERNAME: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DATABASE: z.string().min(1),
  POSTGRES_SCHEMA: z.string().min(1).default('public'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('[migration-env] variáveis inválidas:', parsed.error.format());
  throw new Error('Variáveis de ambiente de migration inválidas.');
}

export const migrationEnv = parsed.data;
