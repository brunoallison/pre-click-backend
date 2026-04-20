import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildTestApp, type TestContext } from './helpers/app.helper.js';

describe('Auth E2E', () => {
  let ctx: TestContext;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
    server = http.createServer(ctx.app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await ctx.teardown();
  });

  describe('POST /auth/login', () => {
    it('sucesso: retorna access_token e user', async () => {
      const tenant = await ctx.seedTenant();
      const user = await ctx.seedUser({ tenantId: tenant.id, role: 'user' });

      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: 'senha-teste-12345' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { access_token: string; user: { email: string }; tenant: { id: string } };
      expect(body.access_token).toBeTruthy();
      expect(body.user.email).toBe(user.email);
      expect(body.tenant.id).toBe(tenant.id);
    });

    it('erro: senha inválida → 401', async () => {
      const tenant = await ctx.seedTenant();
      const user = await ctx.seedUser({ tenantId: tenant.id });

      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: 'senha-errada' }),
      });

      expect(res.status).toBe(401);
    });

    it('erro: email inexistente → 401', async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'naoexiste@e2e.test', password: 'qualquer' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/me', () => {
    it('retorna dados do usuário autenticado', async () => {
      const tenant = await ctx.seedTenant();
      const user = await ctx.seedUser({ tenantId: tenant.id, role: 'user' });
      const token = ctx.makeToken({ userId: user.id, tenantId: tenant.id, role: 'user' });

      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: { id: string; email: string }; tenant: { id: string } };
      expect(body.user.id).toBe(user.id);
      expect(body.tenant.id).toBe(tenant.id);
    });

    it('sem token → 401', async () => {
      const res = await fetch(`${baseUrl}/auth/me`);
      expect(res.status).toBe(401);
    });
  });
});
