import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
import { env } from '../../../config/env.js';
import { RefreshToken } from '../../../entities/refresh-token.entity.js';
import { Tenant } from '../../../entities/tenant.entity.js';
import { User } from '../../../entities/user.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { toSafeUser } from '../../../utils/safe-user.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { LoginInput, type LoginOutput } from '../dto/login.dto.js';

@Injectable()
export class LoginTask extends Task<LoginOutput> {
  protected validations = [verifyBody(LoginInput, true)];

  constructor(
    @Inject('UserRepository') private readonly users: Repository<User>,
    @Inject('TenantRepository') private readonly tenants: Repository<Tenant>,
    @Inject('RefreshTokenRepository') private readonly refresh: Repository<RefreshToken>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<LoginOutput> {
    const { email, password } = input.body as LoginInput;
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (!user || !user.is_active) {
      throw HttpError.Unauthorized('unauthorized', 'Usuário ou senha inválidos');
    }
    const ok = await argon2.verify(user.password_hash, password);
    if (!ok) throw HttpError.Unauthorized('unauthorized', 'Usuário ou senha inválidos');

    const accessToken = jwt.sign(
      { sub: user.id, tid: user.tenant_id, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_ACCESS_TTL_SEC },
    );
    const jti = randomUUID();
    await this.refresh.save({
      id: jti,
      user_id: user.id,
      tenant_id: user.tenant_id,
      expires_at: new Date(Date.now() + env.JWT_REFRESH_TTL_SEC * 1000),
    });

    user.last_login_at = new Date();
    await this.users.save(user);

    let tenantOut: LoginOutput['tenant'] = null;
    if (user.tenant_id) {
      const tenant = await this.tenants.findOne({ where: { id: user.tenant_id } });
      if (tenant) {
        tenantOut = { id: tenant.id, slug: tenant.slug, display_name: tenant.display_name };
      }
    }

    return { access_token: accessToken, user: toSafeUser(user), tenant: tenantOut };
  }
}
