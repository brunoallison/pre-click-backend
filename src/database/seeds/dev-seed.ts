import 'reflect-metadata';
import argon2 from 'argon2';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../../entities/collection.entity.js';
import { Tenant } from '../../entities/tenant.entity.js';
import { User } from '../../entities/user.entity.js';
import { logger } from '../../utils/logger.js';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const tenants = AppDataSource.getRepository(Tenant);
  const users = AppDataSource.getRepository(User);
  const collections = AppDataSource.getRepository(Collection);

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

  logger.info('seed: done');
  await AppDataSource.destroy();
}

main().catch((err) => {
  logger.error({ err }, 'seed: fatal');
  process.exit(1);
});
