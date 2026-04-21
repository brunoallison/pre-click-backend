import 'reflect-metadata';
import argon2 from 'argon2';
import { AppDataSource } from '../data-source.js';
import { User } from '../../entities/user.entity.js';
import { logger } from '../../utils/logger.js';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const users = AppDataSource.getRepository(User);

  const email = 'bruno.allison@live.com';
  const password = 'ak1209119';

  const existing = await users.findOne({ where: { email } });
  const password_hash = await argon2.hash(password);

  if (existing) {
    await users.update(existing.id, { password_hash, is_active: true });
    logger.info({ email }, 'seed-bruno: senha atualizada');
  } else {
    await users.save({
      email,
      password_hash,
      display_name: 'Bruno Allison',
      role: 'super_admin',
      tenant_id: null,
      is_active: true,
    });
    logger.info({ email }, 'seed-bruno: usuário criado');
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  logger.error({ err }, 'seed-bruno: fatal');
  process.exit(1);
});
