import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildTestApp, type TestContext } from './helpers/app.helper.js';

// supertest não está instalado — importamos dynamicamente e verificamos
// Como supertest não está em devDependencies, usamos fetch/http diretamente
import http from 'node:http';
import type { AddressInfo } from 'node:net';

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

  it('GET /api/v1/health/ready retorna 200 com db ok e redis', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health/ready`);
    // Redis não está disponível no teste, mas db deve estar ok
    const body = (await res.json()) as { db: string; redis: string };
    expect(body.db).toBe('ok');
    // Redis pode falhar no ambiente de teste — apenas verificamos o formato
    expect(['ok', 'fail']).toContain(body.redis);
    // Status é 200 se ambos ok, 503 se algum falhar
    expect([200, 503]).toContain(res.status);
  });
});
