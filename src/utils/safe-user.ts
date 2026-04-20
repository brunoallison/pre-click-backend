import type { User } from '../entities/user.entity.js';

export interface SafeUser {
  id: string;
  email: string;
  display_name: string;
  role: 'super_admin' | 'user';
  tenant_id: string | null;
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    tenant_id: user.tenant_id ?? null,
  };
}
