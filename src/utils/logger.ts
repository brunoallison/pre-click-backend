import pino from 'pino';
import { env } from '../config/env.js';

function buildTransport(): pino.TransportSingleOptions | pino.TransportMultiOptions | undefined {
  if (env.NODE_ENV === 'development') {
    return { target: 'pino-pretty', options: { colorize: true, singleLine: false } };
  }

  // Em produção: escreve em arquivo quando LOG_FILE está setado (sidecar Datadog lê o arquivo)
  // e mantém stdout para Cloud Run logs nativos.
  if (env.LOG_FILE) {
    return {
      targets: [
        {
          target: 'pino/file',
          options: { destination: env.LOG_FILE, mkdir: true },
          level: env.LOG_LEVEL,
        },
        { target: 'pino/file', options: { destination: 1 /* stdout */ }, level: env.LOG_LEVEL },
      ],
    } as pino.TransportMultiOptions;
  }

  return undefined;
}

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: buildTransport(),
  base: { service: env.DD_SERVICE ?? 'pedido-backend' },
});

export type Logger = typeof logger;
