import type { Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import { RefreshToken } from '../../../entities/refresh-token.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';

@Injectable()
export class LogoutTask extends Task<null> {
  constructor(
    @Inject('RefreshTokenRepository') private readonly refresh: Repository<RefreshToken>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<null> {
    const userId = input.headers.userId as string | undefined;
    if (userId) {
      await this.refresh.update(
        { user_id: userId, revoked_at: IsNull() },
        { revoked_at: new Date() },
      );
    }
    return null;
  }
}
