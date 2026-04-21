import type { RequestHandler } from 'express';
import { HttpError } from '../utils/error.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Exige contexto de tenant. Em rotas tenant-scoped, o `tenantId` vem do JWT
 * (claim `tid`). Super admin tem `tid = null` — se ele precisar acessar uma
 * rota tenant-scoped em nome de um tenant específico, pode enviar
 * `X-Tenant-Id: <uuid>` e o override é aplicado aqui.
 */
export const requireTenant: RequestHandler = (req, _res, next) => {
  const authed = req as { tenantId?: string | null; role?: 'super_admin' | 'user' };

  if (!authed.tenantId && authed.role === 'super_admin') {
    const override = req.header('x-tenant-id');
    if (override) {
      if (!UUID_RE.test(override)) {
        throw HttpError.Unprocessable(
          'invalid_tenant_override',
          'Header X-Tenant-Id deve ser um UUID válido',
        );
      }
      authed.tenantId = override;
    }
  }

  if (!authed.tenantId) {
    throw HttpError.Forbidden('forbidden', 'Esta rota exige contexto de tenant');
  }
  next();
};
