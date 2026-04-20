import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildTestApp, type TestContext } from './helpers/app.helper.js';

describe('GET /health', () => {
  let ctx: TestContext;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
    server = http.createServer(ctx.app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await ctx.teardown();
  });

  it('GET /api/v1/health retorna 200', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('GET /api/v1/health/ready retorna resposta com status de DB', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health/ready`);
    const body = (await res.json()) as Record<string, string>;
    // Versão com Redis: { db: 'ok'|'fail', redis: 'ok'|'fail' }
    // Versão legada:    { status: 'ready'|'degraded', db: 'up'|'down' }
    const dbOk = body.db === 'ok' || body.db === 'up';
    expect(dbOk).toBe(true);
    // Status HTTP: 200 se tudo ok, 503 se algum falhar
    expect([200, 503]).toContain(res.status);
  });
});
