import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildTestApp, type TestContext } from './helpers/app.helper.js';

describe('X-Tenant-Id override para super_admin', () => {
  let ctx: TestContext;
  let server: http.Server;
  let baseUrl: string;
  let superToken: string;
  let userToken: string;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
    server = http.createServer(ctx.app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;

    const superUser = await ctx.seedUser({ tenantId: null, role: 'super_admin' });
    superToken = ctx.makeToken({
      userId: superUser.id,
      tenantId: null,
      role: 'super_admin',
    });

    const tA = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO tenant (slug, display_name) VALUES ($1, $2) RETURNING id`,
      [`ovr-a-${Date.now()}`, 'Tenant A'],
    );
    tenantAId = tA[0].id;
    const tB = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO tenant (slug, display_name) VALUES ($1, $2) RETURNING id`,
      [`ovr-b-${Date.now()}`, 'Tenant B'],
    );
    tenantBId = tB[0].id;

    const userB = await ctx.seedUser({ tenantId: tenantBId, role: 'user' });
    userToken = ctx.makeToken({ userId: userB.id, tenantId: tenantBId, role: 'user' });

    await ctx.dataSource.query(
      `INSERT INTO store (tenant_id, customer_id_sap, legal_name, display_name, store_concept, status_comp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantAId, '7000000001', 'Loja Exclusiva A LTDA', 'Exclusiva A', 'BCS', 'COMP'],
    );
    await ctx.dataSource.query(
      `INSERT INTO store (tenant_id, customer_id_sap, legal_name, display_name, store_concept, status_comp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantBId, '7000000002', 'Loja Exclusiva B LTDA', 'Exclusiva B', 'BCS', 'COMP'],
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await ctx.teardown();
  });

  it('super_admin sem override recebe 403 em rota tenant-scoped', async () => {
    const res = await fetch(`${baseUrl}/stores`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('super_admin com X-Tenant-Id válido lê dados do tenant alvo', async () => {
    const res = await fetch(`${baseUrl}/stores`, {
      headers: { Authorization: `Bearer ${superToken}`, 'X-Tenant-Id': tenantAId },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ display_name: string; legal_name: string }>;
    expect(body.some((s) => s.display_name === 'Exclusiva A')).toBe(true);
    expect(body.some((s) => s.display_name === 'Exclusiva B')).toBe(false);
  });

  it('super_admin com X-Tenant-Id inválido retorna 422', async () => {
    const res = await fetch(`${baseUrl}/stores`, {
      headers: { Authorization: `Bearer ${superToken}`, 'X-Tenant-Id': 'not-a-uuid' },
    });
    expect(res.status).toBe(422);
  });

  it('user comum ignora X-Tenant-Id e enxerga só seu próprio tenant', async () => {
    const res = await fetch(`${baseUrl}/stores`, {
      headers: { Authorization: `Bearer ${userToken}`, 'X-Tenant-Id': tenantAId },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ display_name: string }>;
    expect(body.some((s) => s.display_name === 'Exclusiva B')).toBe(true);
    expect(body.some((s) => s.display_name === 'Exclusiva A')).toBe(false);
  });
});
