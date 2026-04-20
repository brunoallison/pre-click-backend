import jwt from 'jsonwebtoken';
import type { Repository } from 'typeorm';
import { env } from '../../../config/env.js';
import { RefreshToken } from '../../../entities/refresh-token.entity.js';
import { User } from '../../../entities/user.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';

interface RefreshOutput {
  access_token: string;
}

@Injectable()
export class RefreshTask extends Task<RefreshOutput> {
  constructor(
    @Inject('RefreshTokenRepository') private readonly refresh: Repository<RefreshToken>,
    @Inject('UserRepository') private readonly users: Repository<User>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<RefreshOutput> {
    const headers = input.headers as { cookie?: string };
    const cookieHeader = headers.cookie ?? '';
    const match = cookieHeader.match(/refresh_token=([^;]+)/);
    if (!match) throw HttpError.Unauthorized('unauthorized', 'Refresh ausente');
    const jti = match[1];

    const token = await this.refresh.findOne({ where: { id: jti } });
    if (!token || token.revoked_at || token.expires_at < new Date()) {
      throw HttpError.Unauthorized('unauthorized', 'Refresh inválido');
    }
    const user = await this.users.findOne({ where: { id: token.user_id } });
    if (!user || !user.is_active) throw HttpError.Unauthorized('unauthorized');

    const access = jwt.sign(
      { sub: user.id, tid: user.tenant_id, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_ACCESS_TTL_SEC },
    );
    return { access_token: access };
  }
}
