import 'reflect-metadata';
import argon2 from 'argon2';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../../entities/collection.entity.js';
import { Grade } from '../../entities/grade.entity.js';
import { GradeSizeQty } from '../../entities/grade-size-qty.entity.js';
import { Product } from '../../entities/product.entity.js';
import { Store } from '../../entities/store.entity.js';
import { Tenant } from '../../entities/tenant.entity.js';
import { User } from '../../entities/user.entity.js';
import { logger } from '../../utils/logger.js';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const tenants = AppDataSource.getRepository(Tenant);
  const users = AppDataSource.getRepository(User);
  const collections = AppDataSource.getRepository(Collection);
  const stores = AppDataSource.getRepository(Store);
  const products = AppDataSource.getRepository(Product);

  let tenant = await tenants.findOne({ where: { slug: 'franquia-demo' } });
  if (!tenant) {
    tenant = await tenants.save({
      slug: 'franquia-demo',
      display_name: 'Franquia Demo',
      status: 'active',
    });
  }

  const superEmail = 'super@pedido.local';
  if (!(await users.findOne({ where: { email: superEmail } }))) {
    await users.save({
      email: superEmail,
      password_hash: await argon2.hash('pedido-super'),
      display_name: 'Super Admin',
      role: 'super_admin',
      tenant_id: null,
      is_active: true,
    });
  }

  const userEmail = 'operador@pedido.local';
  if (!(await users.findOne({ where: { email: userEmail } }))) {
    await users.save({
      email: userEmail,
      password_hash: await argon2.hash('pedido-operador'),
      display_name: 'Operador Demo',
      role: 'user',
      tenant_id: tenant.id,
      is_active: true,
    });
  }

  const logoutEmail = 'logout-user@pedido.local';
  if (!(await users.findOne({ where: { email: logoutEmail } }))) {
    await users.save({
      email: logoutEmail,
      password_hash: await argon2.hash('pedido-logout'),
      display_name: 'Logout User',
      role: 'user',
      tenant_id: tenant.id,
      is_active: true,
    });
  }

  for (const season of [
    { code: 'SS27', country: 'BR', name: 'Spring/Summer 2027 BR' },
    { code: 'FW26', country: 'BR', name: 'Fall/Winter 2026 BR' },
  ]) {
    const exists = await collections.findOne({
      where: { code: season.code, country: season.country },
    });
    if (!exists) {
      await collections.save({ ...season, status: 'open' });
    }
  }

  const ss27 = await collections.findOne({ where: { code: 'SS27', country: 'BR' } });
  if (!ss27) throw new Error('seed: collection SS27 ausente após upsert');

  const storeSeeds: Array<Partial<Store>> = [
    {
      legal_name: 'FRANQUIA DEMO COPACABANA LTDA',
      display_name: 'Copacabana',
      store_number: 1001,
      country: 'BR',
      store_concept: 'BCS',
      cluster: 'FR_BCS_TOP',
      city: 'Rio de Janeiro',
      state: 'RJ',
      status_comp: 'COMP',
      customer_id_sap: '100001',
      is_dummy: false,
      is_active: true,
      tenant_id: tenant.id,
    },
    {
      legal_name: 'FRANQUIA DEMO IPANEMA LTDA',
      display_name: 'Ipanema',
      store_number: 1002,
      country: 'BR',
      store_concept: 'OCS',
      cluster: null,
      city: 'Rio de Janeiro',
      state: 'RJ',
      status_comp: 'NEW_2026',
      customer_id_sap: null,
      is_dummy: false,
      is_active: true,
      tenant_id: tenant.id,
    },
    {
      legal_name: 'FRANQUIA DEMO PAULISTA LTDA',
      display_name: 'Paulista',
      store_number: 1003,
      country: 'BR',
      store_concept: 'BCS',
      cluster: 'FR_BCS_MID',
      city: 'São Paulo',
      state: 'SP',
      status_comp: 'COMP',
      customer_id_sap: '100003',
      is_dummy: false,
      is_active: true,
      tenant_id: tenant.id,
    },
  ];
  for (const s of storeSeeds) {
    const exists = await stores.findOne({
      where: { tenant_id: tenant.id, display_name: s.display_name! },
    });
    if (!exists) await stores.save(s);
  }

  const productSeeds: Array<Partial<Product>> = [
    {
      collection_id: ss27.id,
      article_sku: 'DEMO-APP-001',
      model: 'ADICOLOR CLASSICS',
      local_description: 'Camiseta Trefoil',
      key_category: 'ORIGINALS',
      category: 'T-SHIRT',
      prod_group: 'APPAREL TOPS',
      division: 'APP',
      gender: 'MALE',
      age_group: 'ADULT',
      color: 'BLACK',
      local_rid: '2026-12-01',
      local_red: '2027-05-31',
      rrp: '199.99',
      vol_minimo: 6,
      exclusive: false,
      raw: {},
    },
    {
      collection_id: ss27.id,
      article_sku: 'DEMO-FTW-002',
      model: 'SUPERSTAR',
      local_description: 'Tênis Superstar',
      key_category: 'ORIGINALS',
      category: 'FOOTWEAR',
      prod_group: 'FTW LIFESTYLE',
      division: 'FTW',
      gender: 'UNISEX',
      age_group: 'ADULT',
      color: 'WHITE',
      local_rid: '2026-12-01',
      local_red: '2027-05-31',
      rrp: '699.99',
      vol_minimo: 12,
      exclusive: false,
      raw: {},
    },
    {
      collection_id: ss27.id,
      article_sku: 'DEMO-ACC-003',
      model: 'TREFOIL CAP',
      local_description: 'Boné Trefoil',
      key_category: 'ORIGINALS',
      category: 'ACCESSORIES',
      prod_group: 'ACC HEADWEAR',
      division: 'ACC',
      gender: 'UNISEX',
      age_group: 'ADULT',
      color: 'BLACK',
      local_rid: '2026-12-01',
      local_red: '2027-05-31',
      rrp: '139.99',
      vol_minimo: 4,
      exclusive: false,
      raw: {},
    },
    {
      collection_id: ss27.id,
      article_sku: 'DEMO-APP-004',
      model: 'PREDATOR',
      local_description: 'Camisa Football Kids',
      key_category: 'FOOTBALL',
      category: 'T-SHIRT',
      prod_group: 'APPAREL TOPS',
      division: 'APP',
      gender: 'KIDS',
      age_group: 'KIDS',
      color: 'BLUE',
      local_rid: '2026-12-01',
      local_red: '2027-05-31',
      rrp: '149.99',
      vol_minimo: 6,
      exclusive: false,
      raw: {},
    },
    {
      collection_id: ss27.id,
      article_sku: 'DEMO-FTW-005',
      model: 'ULTRABOOST',
      local_description: 'Tênis Running Feminino',
      key_category: 'RUNNING',
      category: 'FOOTWEAR',
      prod_group: 'FTW RUNNING',
      division: 'FTW',
      gender: 'FEMALE',
      age_group: 'ADULT',
      color: 'PINK',
      local_rid: '2026-12-01',
      local_red: '2027-05-31',
      rrp: '899.99',
      vol_minimo: 12,
      exclusive: false,
      raw: {},
    },
  ];
  for (const p of productSeeds) {
    const exists = await products.findOne({
      where: { collection_id: p.collection_id!, article_sku: p.article_sku! },
    });
    if (!exists) await products.save(p);
  }

  const grades = AppDataSource.getRepository(Grade);
  const gradeSizes = AppDataSource.getRepository(GradeSizeQty);
  const gradeSeeds: Array<{ code: string; sizes: Array<{ size: string; qty: number }> }> = [
    {
      code: 'APP-6',
      sizes: [
        { size: 'P', qty: 1 },
        { size: 'M', qty: 2 },
        { size: 'G', qty: 2 },
        { size: 'GG', qty: 1 },
      ],
    },
    {
      code: 'FTW-12',
      sizes: [
        { size: '37', qty: 1 },
        { size: '38', qty: 2 },
        { size: '39', qty: 3 },
        { size: '40', qty: 3 },
        { size: '41', qty: 2 },
        { size: '42', qty: 1 },
      ],
    },
    {
      code: 'ACC-4',
      sizes: [{ size: 'UNICO', qty: 4 }],
    },
  ];
  for (const g of gradeSeeds) {
    const total = g.sizes.reduce((sum, s) => sum + s.qty, 0);
    const exists = await grades.findOne({
      where: { collection_id: ss27.id, tenant_id: IsNull(), code: g.code },
    });
    if (!exists) {
      const saved = await grades.save({
        collection_id: ss27.id,
        tenant_id: null,
        code: g.code,
        total_pieces: total,
        is_system: true,
      });
      await gradeSizes.save(g.sizes.map((s) => ({ grade_id: saved.id, size: s.size, qty: s.qty })));
    }
  }

  logger.info('seed: done');
  await AppDataSource.destroy();
}

main().catch((err) => {
  logger.error({ err }, 'seed: fatal');
  process.exit(1);
});
