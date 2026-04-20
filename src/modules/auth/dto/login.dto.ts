import { IsEmail, IsString, Length } from 'class-validator';
import type { SafeUser } from '../../../utils/safe-user.js';

export class LoginInput {
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @IsString()
  @Length(8, 128, { message: 'Senha deve ter entre 8 e 128 caracteres' })
  password!: string;
}

export interface LoginOutput {
  access_token: string;
  user: SafeUser;
  tenant: { id: string; slug: string; display_name: string } | null;
}

export interface MeOutput {
  user: SafeUser;
  tenant: { id: string; slug: string; display_name: string } | null;
}
