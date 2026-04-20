import type { Repository } from 'typeorm';
import { Tenant } from '../../../entities/tenant.entity.js';
import { User } from '../../../entities/user.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { toSafeUser } from '../../../utils/safe-user.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import type { MeOutput } from '../dto/login.dto.js';

@Injectable()
export class MeTask extends Task<MeOutput> {
  constructor(
    @Inject('UserRepository') private readonly users: Repository<User>,
    @Inject('TenantRepository') private readonly tenants: Repository<Tenant>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<MeOutput> {
    const userId = input.headers.userId as string | undefined;
    if (!userId) throw HttpError.Unauthorized('unauthorized');
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw HttpError.Unauthorized('unauthorized');
    let tenant: MeOutput['tenant'] = null;
    if (user.tenant_id) {
      const t = await this.tenants.findOne({ where: { id: user.tenant_id } });
      if (t) tenant = { id: t.id, slug: t.slug, display_name: t.display_name };
    }
    return { user: toSafeUser(user), tenant };
  }
}
