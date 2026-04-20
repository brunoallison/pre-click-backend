import 'reflect-metadata';
import { container, injectable, inject } from 'tsyringe';
import type { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import * as entities from '../entities/index.js';

export const Injectable = injectable;
export const Inject = inject;
export { container };

export function repositoryToken<T>(entity: EntityTarget<T>): string {
  const name =
    typeof entity === 'function'
      ? entity.name
      : typeof entity === 'string'
        ? entity
        : ((entity as { name?: string }).name ?? 'UnknownEntity');
  return `${name}Repository`;
}

export function registerRepositories(dataSource: DataSource): void {
  // Registra o DataSource para uso direto (ex: health check)
  container.register('DataSource', { useValue: dataSource });

  for (const entity of Object.values(entities)) {
    if (typeof entity !== 'function') continue;
    const token = `${entity.name}Repository`;
    const repo: Repository<ObjectLiteral> = dataSource.getRepository(
      entity as EntityTarget<ObjectLiteral>,
    );
    container.register(token, { useValue: repo });
  }
}
