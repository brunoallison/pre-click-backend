import { DataSource } from 'typeorm';
import { migrationEnv } from '../config/migration-env.js';
import * as entities from '../entities/index.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: migrationEnv.POSTGRES_HOST,
  port: migrationEnv.POSTGRES_PORT,
  username: migrationEnv.POSTGRES_USERNAME,
  password: migrationEnv.POSTGRES_PASSWORD,
  database: migrationEnv.POSTGRES_DATABASE,
  schema: migrationEnv.POSTGRES_SCHEMA,
  entities: Object.values(entities).filter((e) => typeof e === 'function') as unknown[] as never[],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: migrationEnv.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export default AppDataSource;
