import type { FindManyOptions, FindOneOptions, ObjectLiteral, Repository } from 'typeorm';

export function tenantScoped<T extends ObjectLiteral>(repo: Repository<T>, tenantId: string) {
  return {
    find: (opts: FindManyOptions<T> = {}) =>
      repo.find({
        ...opts,
        where: { ...(opts.where ?? {}), tenant_id: tenantId } as FindManyOptions<T>['where'],
      }),

    findOne: (opts: FindOneOptions<T>) =>
      repo.findOne({
        ...opts,
        where: { ...(opts.where ?? {}), tenant_id: tenantId } as FindOneOptions<T>['where'],
      }),

    count: (opts: FindManyOptions<T> = {}) =>
      repo.count({
        ...opts,
        where: { ...(opts.where ?? {}), tenant_id: tenantId } as FindManyOptions<T>['where'],
      }),
  };
}
