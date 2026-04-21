import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildTestApp, type TestContext } from './helpers/app.helper.js';

interface AiContextOut {
  id: string;
  tenant_id: string;
  source: 'sales_history' | 'fw26_portfolio';
  collection_ref: string | null;
  row_count: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

describe('Admin AI Contexts E2E', () => {
  let ctx: TestContext;
  let server: http.Server;
  let baseUrl: string;
  let superToken: string;
  let userToken: string;
  let tenantAId: string;
  let tenantBId: string;
  let ctxAId: string;
  let ctxBId: string;

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
      [`aictx-a-${Date.now()}`, 'Tenant A'],
    );
    tenantAId = tA[0].id;
    const tB = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO tenant (slug, display_name) VALUES ($1, $2) RETURNING id`,
      [`aictx-b-${Date.now()}`, 'Tenant B'],
    );
    tenantBId = tB[0].id;

    const userA = await ctx.seedUser({ tenantId: tenantAId, role: 'user' });
    userToken = ctx.makeToken({ userId: userA.id, tenantId: tenantAId, role: 'user' });

    const insertedA = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO ai_context (tenant_id, source, collection_ref, payload, row_count, uploaded_by)
       VALUES ($1, 'sales_history', 'SS27', '{}'::jsonb, 42, $2) RETURNING id`,
      [tenantAId, superUser.id],
    );
    ctxAId = insertedA[0].id;

    const insertedB = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO ai_context (tenant_id, source, collection_ref, payload, row_count, uploaded_by)
       VALUES ($1, 'fw26_portfolio', NULL, '{}'::jsonb, 100, $2) RETURNING id`,
      [tenantBId, superUser.id],
    );
    ctxBId = insertedB[0].id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await ctx.teardown();
  });

  it('GET /admin/ai/contexts lista contextos de todos os tenants', async () => {
    const res = await fetch(`${baseUrl}/admin/ai/contexts`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiContextOut[];

    const ids = body.map((c) => c.id);
    expect(ids).toContain(ctxAId);
    expect(ids).toContain(ctxBId);

    const a = body.find((c) => c.id === ctxAId)!;
    expect(a.tenant_id).toBe(tenantAId);
    expect(a.source).toBe('sales_history');
    expect(a.collection_ref).toBe('SS27');
    expect(a.row_count).toBe(42);
  });

  it('GET /admin/ai/contexts?tenant_id=X filtra por tenant', async () => {
    const res = await fetch(`${baseUrl}/admin/ai/contexts?tenant_id=${tenantBId}`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiContextOut[];
    expect(body.every((c) => c.tenant_id === tenantBId)).toBe(true);
    expect(body.map((c) => c.id)).toContain(ctxBId);
    expect(body.map((c) => c.id)).not.toContain(ctxAId);
  });

  it('GET /admin/ai/contexts bloqueia user comum com 403', async () => {
    const res = await fetch(`${baseUrl}/admin/ai/contexts`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('DELETE /admin/ai/contexts/:id remove independente de tenant', async () => {
    const res = await fetch(`${baseUrl}/admin/ai/contexts/${ctxAId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(res.status).toBe(204);

    const rows = await ctx.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM ai_context WHERE id = $1`,
      [ctxAId],
    );
    expect(rows).toHaveLength(0);
  });

  it('DELETE /admin/ai/contexts/:id retorna 404 para id inexistente', async () => {
    const res = await fetch(
      `${baseUrl}/admin/ai/contexts/00000000-0000-0000-0000-000000000000`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${superToken}` },
      },
    );
    expect(res.status).toBe(404);
  });
});
