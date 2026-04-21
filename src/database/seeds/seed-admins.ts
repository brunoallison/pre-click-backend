import 'reflect-metadata';
import argon2 from 'argon2';
import { AppDataSource } from '../data-source.js';
import { User } from '../../entities/user.entity.js';
import { logger } from '../../utils/logger.js';

const ADMINS = [
  { email: 'bruno.allison@live.com', display_name: 'Bruno Allison' },
  { email: 'biatatibana@gmail.com', display_name: 'Bia Tatibana' },
  { email: 'andressa.raposo1@gmail.com', display_name: 'Andressa Raposo' },
];

const PASSWORD = 'Senha@2026';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const users = AppDataSource.getRepository(User);
  const password_hash = await argon2.hash(PASSWORD);

  for (const { email, display_name } of ADMINS) {
    const existing = await users.findOne({ where: { email } });
    if (existing) {
      await users.update(existing.id, { password_hash, is_active: true });
      logger.info({ email }, 'seed-admins: senha atualizada');
    } else {
      await users.save({ email, password_hash, display_name, role: 'super_admin', tenant_id: null, is_active: true });
      logger.info({ email }, 'seed-admins: usuário criado');
    }
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  logger.error({ err }, 'seed-admins: fatal');
  process.exit(1);
});
