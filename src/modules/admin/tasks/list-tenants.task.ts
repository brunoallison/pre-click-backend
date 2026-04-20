import type { Repository } from 'typeorm';
import { Tenant } from '../../../entities/tenant.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task } from '../../../utils/task.js';

interface TenantOut {
  id: string;
  slug: string;
  display_name: string;
  status: string;
}

@Injectable()
export class ListTenantsTask extends Task<TenantOut[]> {
  constructor(@Inject('TenantRepository') private readonly tenants: Repository<Tenant>) {
    super();
  }
  async execute(): Promise<TenantOut[]> {
    const rows = await this.tenants.find();
    return rows.map((t) => ({
      id: t.id,
      slug: t.slug,
      display_name: t.display_name,
      status: t.status,
    }));
  }
}
