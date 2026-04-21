import 'dotenv/config';
import { z } from 'zod';

// z.coerce.boolean() usa Boolean(v) — "false" vira true. Este parser trata strings "true"/"false"/"1"/"0".
const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['true', '1', 'yes'].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Banco de dados (PostgreSQL via Cloud SQL Auth Proxy em prod, direto em dev)
  POSTGRES_HOST: z.string().min(1).default('127.0.0.1'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USERNAME: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DATABASE: z.string().min(1),
  POSTGRES_SCHEMA: z.string().min(1).default('public'),

  // Redis (TLS opcional — ativo em prod, desativo em dev)
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: boolFromEnv.default(false),

  // Auth
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7),
  COOKIE_DOMAIN: z.string().min(1).default('localhost'),
  COOKIE_SECURE: boolFromEnv.default(false),

  // Google Cloud Storage (ADC — sem keyfile)
  GCS_BUCKET_NAME: z.string().min(1),
  GCP_PROJECT_ID: z.string().optional(),

  // Cloud SQL Auth Proxy (connection name para sidecar em Cloud Run)
  CLOUD_SQL_CONNECTION_NAME: z.string().optional(),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5-20251001'),

  // Datadog — NODE_OPTIONS=--require dd-trace/init é passado via env, não importado aqui
  DD_ENV: z.string().optional(),
  DD_SERVICE: z.string().optional(),
  DD_VERSION: z.string().optional(),
  DD_AGENT_HOST: z.string().optional(),
  DD_TRACE_AGENT_URL: z.string().optional(),
  DD_LOGS_INJECTION: boolFromEnv.default(false),
  DD_API_KEY: z.string().optional(),
  DD_SITE: z.string().optional(),

  // Log file (quando setado, Pino escreve neste path; usado pelo sidecar Datadog em Cloud Run)
  LOG_FILE: z.string().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  FRONTEND_URL: z.string().optional(),

  // GCS local emulator (fake-gcs-server em dev local e testes E2E)
  // Definir como 'localhost:4443' quando usar fake-gcs-server. Em produção, deixar vazio.
  STORAGE_EMULATOR_HOST: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[env] variáveis de ambiente inválidas:', parsed.error.format());
  throw new Error('Variáveis de ambiente inválidas. Verifique .env');
}

export const env = parsed.data;
export type Env = typeof env;
