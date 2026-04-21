import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildTestApp, type TestContext } from './helpers/app.helper.js';

interface GradeBody {
  id: string;
  collection_id: string;
  code: string;
  tenant_id: string | null;
  is_system: boolean;
  total_pieces: number;
  sizes: Array<{ size: string; qty: number }>;
}

describe('Catalog Grades E2E', () => {
  let ctx: TestContext;
  let server: http.Server;
  let baseUrl: string;
  let token: string;
  let tokenOther: string;
  let collectionId: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
    server = http.createServer(ctx.app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;

    const tenant = await ctx.seedTenant();
    const user = await ctx.seedUser({ tenantId: tenant.id, role: 'user' });
    token = ctx.makeToken({ userId: user.id, tenantId: tenant.id, role: 'user' });

    const otherTenant = await ctx.seedTenant();
    const otherUser = await ctx.seedUser({ tenantId: otherTenant.id, role: 'user' });
    tokenOther = ctx.makeToken({
      userId: otherUser.id,
      tenantId: otherTenant.id,
      role: 'user',
    });

    const collResult = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO collection (code, country, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['SS27', 'BR', 'Spring/Summer 2027', 'open'],
    );
    collectionId = collResult[0].id;

    // grade global da Adidas (is_system=true, tenant_id=NULL)
    const sysGrade = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO grade (collection_id, tenant_id, code, is_system, total_pieces)
       VALUES ($1, NULL, $2, true, $3) RETURNING id`,
      [collectionId, 'SYS-12', 12],
    );
    await ctx.dataSource.query(
      `INSERT INTO grade_size_qty (grade_id, size, qty) VALUES ($1, 'M', 6), ($1, 'L', 6)`,
      [sysGrade[0].id],
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await ctx.teardown();
  });

  describe('POST /catalog/grades', () => {
    it('cria grade custom com total_pieces somado', async () => {
      const res = await fetch(`${baseUrl}/catalog/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          collection_id: collectionId,
          code: 'CUSTOM-A',
          sizes: [
            { size: 'P', qty: 2 },
            { size: 'M', qty: 4 },
            { size: 'G', qty: 2 },
          ],
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as GradeBody;
      expect(body.code).toBe('CUSTOM-A');
      expect(body.is_system).toBe(false);
      expect(body.total_pieces).toBe(8);
      expect(body.sizes).toHaveLength(3);
      expect(body.tenant_id).toBeTruthy();
    });

    it('rejeita code duplicado para o mesmo tenant (409)', async () => {
      const res = await fetch(`${baseUrl}/catalog/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          collection_id: collectionId,
          code: 'CUSTOM-A',
          sizes: [{ size: 'M', qty: 4 }],
        }),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('grade_code_conflict');
    });

    it('rejeita code que colide com grade global (409)', async () => {
      const res = await fetch(`${baseUrl}/catalog/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          collection_id: collectionId,
          code: 'SYS-12',
          sizes: [{ size: 'M', qty: 4 }],
        }),
      });

      expect(res.status).toBe(409);
    });

    it('rejeita tamanhos duplicados (400)', async () => {
      const res = await fetch(`${baseUrl}/catalog/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          collection_id: collectionId,
          code: 'CUSTOM-DUP',
          sizes: [
            { size: 'M', qty: 2 },
            { size: 'M', qty: 3 },
          ],
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('size_duplicated');
    });

    it('rejeita sizes vazio (400 via class-validator)', async () => {
      const res = await fetch(`${baseUrl}/catalog/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          collection_id: collectionId,
          code: 'CUSTOM-EMPTY',
          sizes: [],
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /catalog/grades', () => {
    it('retorna globais + custom do tenant, excluindo custom de outro tenant', async () => {
      // tenant atual já tem CUSTOM-A criado acima
      // cria uma custom em outro tenant para confirmar isolamento
      await fetch(`${baseUrl}/catalog/grades`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenOther}`,
        },
        body: JSON.stringify({
          collection_id: collectionId,
          code: 'OTHER-TENANT',
          sizes: [{ size: 'U', qty: 6 }],
        }),
      });

      const res = await fetch(
        `${baseUrl}/catalog/grades?collection_id=${collectionId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as GradeBody[];
      const codes = body.map((g) => g.code);
      expect(codes).toContain('SYS-12');
      expect(codes).toContain('CUSTOM-A');
      expect(codes).not.toContain('OTHER-TENANT');

      const sys = body.find((g) => g.code === 'SYS-12')!;
      expect(sys.is_system).toBe(true);
      expect(sys.tenant_id).toBeNull();
      expect(sys.sizes).toHaveLength(2);
    });

    it('exige collection_id (400)', async () => {
      const res = await fetch(`${baseUrl}/catalog/grades`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('collection_id_required');
    });
  });
});
