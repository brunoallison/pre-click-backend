import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildTestApp, type TestContext } from './helpers/app.helper.js';

interface SeasonBody {
  collection_id: string;
  code: string;
  country: string;
  status: 'next' | 'open' | 'delivery' | 'closed';
  order_window: { start: string | null; end: string | null };
  delivery_window: { start: string | null; end: string | null };
  latest_version: { tag: string; date: string; by: string } | null;
  counts: { versions: number; tenants_with_orders: number; open_orders: number };
}

describe('Admin Seasons E2E', () => {
  let ctx: TestContext;
  let server: http.Server;
  let baseUrl: string;
  let superToken: string;
  let userToken: string;

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

    const tenant = await ctx.seedTenant();
    const user = await ctx.seedUser({ tenantId: tenant.id, role: 'user' });
    userToken = ctx.makeToken({ userId: user.id, tenantId: tenant.id, role: 'user' });

    // Coleção 'open' com janelas preenchidas
    const now = new Date();
    const orderStart = new Date(now.getTime() - 10 * 86400000).toISOString();
    const orderEnd = new Date(now.getTime() + 10 * 86400000).toISOString();
    const deliveryStart = new Date(now.getTime() + 40 * 86400000).toISOString();
    const deliveryEnd = new Date(now.getTime() + 200 * 86400000).toISOString();
    const coll = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO collection (code, country, name, status, order_start_at, order_end_at, delivery_start_at, delivery_end_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      ['SS27', 'BR', 'Spring/Summer 2027', 'open', orderStart, orderEnd, deliveryStart, deliveryEnd],
    );

    // Import completed → vira latest_version
    await ctx.dataSource.query(
      `INSERT INTO import_base (collection_id, country, version_tag, is_initial, file_name, gcs_key, status, uploaded_by, completed_at)
       VALUES ($1, $2, $3, true, $4, $5, 'completed', $6, now())`,
      [coll[0].id, 'BR', 'V1704', 'base-ss27.xlsx', 'imports/base-ss27.xlsx', superUser.id],
    );

    // Store + order em draft para popular counts.open_orders e tenants_with_orders
    const store = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO store (tenant_id, customer_id_sap, legal_name, display_name, store_concept, status_comp)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tenant.id, '7000099999', 'Loja Seasons LTDA', 'Loja Seasons', 'BCS', 'COMP'],
    );
    await ctx.seedBatch({
      tenantId: tenant.id,
      collectionId: coll[0].id,
      userId: user.id,
      storeIds: [store[0].id],
    });

    // Coleção 'closed' para cobrir o path closed
    await ctx.dataSource.query(
      `INSERT INTO collection (code, country, name, status, order_start_at, order_end_at, delivery_start_at, delivery_end_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'SS26',
        'BR',
        'Spring/Summer 2026',
        'closed',
        new Date(now.getTime() - 400 * 86400000).toISOString(),
        new Date(now.getTime() - 300 * 86400000).toISOString(),
        new Date(now.getTime() - 300 * 86400000).toISOString(),
        new Date(now.getTime() - 100 * 86400000).toISOString(),
      ],
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await ctx.teardown();
  });

  it('GET /admin/seasons retorna timeline com status derivado e contadores', async () => {
    const res = await fetch(`${baseUrl}/admin/seasons`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as SeasonBody[];

    const ss27 = body.find((s) => s.code === 'SS27');
    expect(ss27).toBeDefined();
    expect(ss27!.status).toBe('open');
    expect(ss27!.order_window.start).not.toBeNull();
    expect(ss27!.latest_version).not.toBeNull();
    expect(ss27!.latest_version!.tag).toBe('V1704');
    expect(ss27!.counts.versions).toBe(1);
    expect(ss27!.counts.open_orders).toBe(1);
    expect(ss27!.counts.tenants_with_orders).toBe(1);

    const ss26 = body.find((s) => s.code === 'SS26');
    expect(ss26).toBeDefined();
    expect(ss26!.status).toBe('closed');
    expect(ss26!.latest_version).toBeNull();
    expect(ss26!.counts.versions).toBe(0);
    expect(ss26!.counts.open_orders).toBe(0);
  });

  it('GET /admin/seasons bloqueia user comum com 403', async () => {
    const res = await fetch(`${baseUrl}/admin/seasons`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(res.status).toBe(403);
  });
});
