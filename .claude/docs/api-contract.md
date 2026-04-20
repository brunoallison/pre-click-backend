---
name: api-contract
description: Resumo do contrato HTTP do pedido-backend — rotas, autenticação, formato de erro, convenções. Fonte canônica em ../../../.claude/docs/backend.md. Use antes de criar/alterar endpoints.
---
# Contrato HTTP — pedido-backend

> **Fonte canônica e completa:** [../../../.claude/docs/backend.md](../../../.claude/docs/backend.md) (orquestrador). DTOs detalhados, exemplos de payload e códigos de erro por endpoint vivem lá. Este arquivo é o **mapa** — qual rota, qual persona, qual guardião, sem repetir 800 linhas de schema.

---

## Prefixos e versão

- Base: `/api/v1`
- Health: `GET /api/v1/health` (sem auth)
- OpenAPI: `GET /api/v1/docs` — montada em `src/docs/openapi.ts`, **tem que ficar em sync com os DTOs**.

---

## Autenticação

- `POST /api/v1/auth/login` — `email + password` → `{ access_token, user }` + cookie `refresh_token` (httpOnly, SameSite=Lax).
- `POST /api/v1/auth/refresh` — rotaciona o refresh (lê cookie), emite novo `access_token` + novo cookie.
- `POST /api/v1/auth/logout` — revoga o refresh atual.
- `GET /api/v1/auth/me` — retorna usuário autenticado (sem `password_hash`).

Todas as rotas abaixo (exceto `/auth/*` e `/health`) exigem:
- Header `Authorization: Bearer <access_token>`.
- Middleware `auth.middleware.ts` preenche `req.userId`, `req.tenantId`, `req.role`.

---

## Grupos de rotas

### `/api/v1/admin/*` — exclusivo de `super_admin`
Middleware: `requireRole('super_admin')`. Usuário comum → 403.

| Endpoint | Descrição |
|----------|-----------|
| `POST   /admin/imports/base` | Envia BASE (`.xlsx`); enfileira import, retorna `202 { import_id }` |
| `GET    /admin/imports/:id` | Status do import (`queued | running | done | failed`) |
| `GET    /admin/tenants` | Lista franqueados |
| `POST   /admin/tenants` | Cria tenant manual (fora do fluxo de import) |
| `POST   /admin/tenant-mappings` | Confirma mapping Franquia-da-BASE → Tenant |
| `GET    /admin/seasons` | Lista coleções |
| `POST   /admin/seasons` | Cria coleção (`SS27`, janelas, status) |

### `/api/v1/*` — tenant-scoped (tenantId derivado do JWT)

| Domínio | Endpoints principais |
|---------|---------------------|
| `stores` | `GET / :id`, `POST /`, `PATCH /:id` (CUSTOMER imutável!), `GET /:id/profile`, `PATCH /:id/profile` |
| `collections` | `GET /` (lista as visíveis ao tenant), `GET /:id` |
| `catalog` | `GET /products` (filtros: cluster, division, search), `GET /products/:id`, `GET /grades`, `GET /rdds` |
| `orders` | `GET /`, `GET /:id`, `POST /`, `POST /:id/items` (upsert), `DELETE /:id/items/:itemId`, `POST /:id/copy-from`, `GET /:id/summary`, `POST /:id/export`, `POST /:id/close` |
| `exports` | `GET /` (aba "Exportados"), `GET /:id/download` |
| `click-errors` | `POST /imports`, `GET /`, `GET /:id`, `PATCH /:id` (triagem) |
| `dashboard` | `GET /summary`, `GET /charts/:name` |
| `insights` | `GET /` (SQL determinístico — Fase 7) |
| `ai` | `POST /ask` (Haiku 4.5 — Fase 8; rate-limited) |
| `tenant-budget` | `GET /`, `PATCH /` (budget mensal para controle do tenant) |

---

## Convenções de resposta

### Sucesso
```json
{ "data": { ... } }         // recurso único
{ "data": [ ... ], "meta": { "total": 42, "page": 1 } }  // coleção
```

### Erro
```json
{
  "error": {
    "code": "order_closed",
    "message": "Pedido já foi fechado e não aceita alterações.",
    "details": { "order_id": "..." }
  }
}
```

- `code` é **snake_case, estável** — clientes podem switchar. Lista em `utils/error-codes.ts`.
- `message` é em **português**, para UI exibir direto.
- `details` é opcional; usado para campo inválido em 422.

### Códigos HTTP usados
| Status | Quando |
|--------|--------|
| 200 | OK |
| 201 | Created |
| 202 | Accepted (jobs async: import, export com split grande) |
| 204 | No Content |
| 400 | Payload malformado (JSON inválido, header obrigatório ausente) |
| 401 | Sem token / token expirado |
| 403 | Token válido mas sem permissão (role errado, cross-tenant) |
| 404 | Recurso não encontrado **dentro do tenant do usuário** (nunca vaza existência cross-tenant) |
| 409 | Conflito (tentar exportar pedido `closed`, tentar alterar `customer_id` imutável) |
| 422 | Validação de DTO (class-validator) — sempre com `details: { field: "mensagem em PT" }` |
| 429 | Rate limit (login, AI) |
| 500 | Erro interno (logado com `trace_id`) |

---

## Headers padrão

### Entrada
- `Authorization: Bearer <token>` — obrigatório fora de `/auth/*` e `/health`.
- `Content-Type: application/json` — exceto uploads (multipart, ex.: import de BASE).
- `X-Request-ID` — opcional; se ausente, backend gera UUID v4.
- `If-None-Match` — usado em leituras cacheáveis (catálogo, coleções) com ETag.

### Saída
- `X-Request-ID` — ecoado.
- `ETag` — em GETs cacheáveis.
- `Cache-Control: private, max-age=...` — onde aplicável.

---

## Multi-tenancy no contrato

- **Nunca** existe header `x-tenant-id` enviado pelo cliente (diferente do taya-credit-engine). `tenant_id` vem **exclusivamente** do JWT.
- Rotas `super_admin` operam sem tenant específico; o backend aceita `?tenant_id=<uuid>` como query param em endpoints de listagem admin que precisam filtrar (explícito no OpenAPI).

---

## OpenAPI e sincronia

- `src/docs/openapi.ts` é **obrigatório manter em sync** com os DTOs reais a cada mudança.
- Ao mudar contrato: atualizar também [../../../.claude/docs/backend.md](../../../.claude/docs/backend.md) para o frontend enxergar.

---

## Referências cruzadas

- Regras de negócio por endpoint → [business-rules.md](business-rules.md)
- DTO patterns → [coding-standards.md](coding-standards.md)
- Testes de endpoint → [e2e-tests.md](e2e-tests.md)
