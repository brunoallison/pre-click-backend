---
name: architecture
description: Arquitetura do pedido-backend (Express + tsyringe + Task, TypeORM, multi-tenant, fases de entrega). Use em tarefas de arquitetura, novos módulos ou dúvidas sobre organização do código.
---
# Arquitetura — pedido-backend

> **Fonte canônica:** [../../../.claude/docs/arquitetura.md](../../../.claude/docs/arquitetura.md) (no orquestrador). Este arquivo condensa o slice relevante ao backend. Se divergir: pai vence.

## Visão geral

API REST que substitui a planilha `BASE PEDIDO` + macro VBA. Três capacidades principais:

1. **Importar** a BASE da Adidas (`.xlsx` com abas `AMD` + `FRA_STORES`) — operação de plataforma, exclusiva do `super_admin`.
2. **Gerenciar** pedidos multi-tenant (franqueado = tenant; loja ∈ tenant; pedido = loja × coleção).
3. **Exportar** para o Click no formato `CLICK` (sheet `CLICK`, 24 colunas A-X) — contrato descrito em [../../../.claude/docs/click-export.md](../../../.claude/docs/click-export.md).

**Stack**: Node.js ≥ 22, Express 5, TypeScript 5.7+, TypeORM 0.3, PostgreSQL 16, Redis, BullMQ, tsyringe (DI), Pino, class-validator, exceljs, Argon2id, JWT.

**Decisões deliberadas**:
- **Sem NestJS** — padrão `Express + tsyringe + Task` do `taya-credit-engine` entrega o mesmo ganho (DI, validação, modularização) sem magia de decorators encadeados.
- **Auth própria, sem gateway** — diferente do taya (que roda atrás do Apigee). Aqui o backend implementa `/auth/login` + rotação de refresh + revogação via Redis. `tenant_id` é derivado do JWT, não de header injetado.
- **Multi-tenant explícito no código** — `WHERE tenant_id = :tenantId` em toda query; RLS Postgres é backlog (não MVP).
- **Export síncrono no handler** — xlsx de 400 linhas gera em < 2s com exceljs; BullMQ só pra import de BASE (minutos).
- **Cookie `SameSite=Lax` + proxy Vercel** — o Chrome bloqueia cookies `SameSite=None` cross-site. Solução MVP: o frontend proxeia `/api/*` para o Cloud Run via `vercel.json`, tornando tudo same-origin. `COOKIE_SECURE=false` → `SameSite=Lax`. Solução definitiva: domínio próprio com subdomínio `api.*` same-site (ver `infra.md` no orquestrador).

## Deploy e infra

Ver [`../../../.claude/docs/infra.md`](../../../.claude/docs/infra.md) para todos os detalhes de Cloud SQL, Cloud Run, Redis, Vercel, Datadog e procedimentos de operação (seed de admins, criação de tenant/coleção via SQL).

---

## Estrutura de módulos

```
src/
├── main.ts                          # bootstrap: DI + DataSource + Express + listen
├── config/
│   ├── env.ts                       # validação central de env (app) — class-validator ou Zod
│   └── migration-env.ts             # env para CLI de migrations (NODE_ENV + Postgres)
├── database/
│   ├── data-source.ts               # TypeORM DataSource
│   └── seeds/                       # seeds de dev (super_admin, tenant demo, coleção SS27)
├── entities/                        # entidades TypeORM — 1 arquivo por entity
├── migrations/                      # nunca editar existentes; toda correção é nova migration
├── middlewares/
│   ├── auth.middleware.ts           # valida JWT → req.userId, req.tenantId, req.role
│   ├── require-tenant.middleware.ts # 403 em rota tenant-scoped sem tenantId
│   ├── require-role.middleware.ts   # factory requireRole('super_admin')
│   ├── rate-limit.middleware.ts     # token-bucket por (tenant, user) ou IP
│   ├── ai-rate-limit.middleware.ts  # bucket específico do LLM (60/h por tenant)
│   ├── etag.middleware.ts
│   ├── error-handler.middleware.ts
│   └── request-logger.middleware.ts
├── modules/                         # 1 diretório por domínio → routes + tasks + dto
│   ├── auth/                        # login, logout, refresh, me
│   ├── admin/                       # super_admin only — import de BASE, tenants, seasons
│   ├── stores/
│   ├── collections/
│   ├── catalog/                     # leitura de produtos, imagens, grades, RDDs
│   ├── orders/                      # upsert de célula, copy-from, summary
│   ├── exports/                     # geração Click + aba Exportados
│   ├── click-errors/
│   ├── dashboard/
│   ├── insights/                    # camada 1 (SQL determinístico)
│   ├── ai/                          # camada 2 (LLM on-demand com Haiku 4.5)
│   ├── tenant-budget/
│   └── health/
├── services/                        # lógica transversal entre módulos
│   ├── order-expansion.service.ts   # expande order_item × grade_size_qty
│   ├── order-validation.service.ts  # validações pré-export
│   ├── export-builder.service.ts    # monta arquivos Click (exceljs)
│   ├── click-error-parser.service.ts
│   ├── insight-runner.service.ts
│   ├── cluster-restriction.service.ts  # resolve restriction_scope (RJ, BH, IPA E OSCAR…)
│   ├── ai-cache.service.ts          # Redis 24h
│   └── etag.service.ts
├── providers/                       # integrações externas com interface tipada
│   ├── anthropic/                   # Haiku 4.5 + JSON mode
│   ├── s3/                          # S3-compatível (Hetzner / R2)
│   └── excel/                       # base-parser, click-writer, error-parser (exceljs)
├── workers/                         # BullMQ processors
│   ├── import-base.worker.ts
│   └── callback.worker.ts
├── decorators/                      # @FakeProvider etc.
├── docs/
│   └── openapi.ts                   # spec mantida em sync com DTOs
└── utils/
    ├── di.ts                        # @Injectable, @Inject, registros do container
    ├── task.ts                      # Task abstract class + runAsJobBase
    ├── schema.ts                    # verifyBody, verifyQuery, verifyParams
    ├── error.ts                     # HttpError.*
    ├── logger.ts                    # pino wrapper com tags + trace_id
    ├── safe-user.ts                 # remove password_hash, etc.
    └── tenant-scoped.ts             # helper: tenantScoped(repo, tenantId).find(...)
```

**Notas:**
- `entities/index.ts` é fonte única para registro automático de `Repository<Entity>` no `utils/di.ts` (loop sobre `Object.values(entities)`).
- DTOs ficam dentro de `modules/<dom>/dto/` — nunca compartilhados entre módulos. Se precisar compartilhar, promover para `types/`.
- `workers/` reusa DI via `task.runAsJobBase({ body: job.data })` — mesmo ciclo de validações + execute sem Express Response.

---

## Padrão Task

Cada endpoint é uma classe `@Injectable()` estendendo `Task<Output>`:

```
Task<Output>
  ├── protected validations[]   → verifyBody / verifyQuery / verifyParams
  ├── protected middlewares[]   → middlewares Express adicionais
  ├── protected status          → HTTP status de sucesso (default 200)
  └── execute(input): Output    → lógica de negócio
```

`Task.handler()` resolve a instância via DI, executa `validations` + `middlewares`, chama `execute()`, serializa a resposta. **Nunca** usar `container.resolve()` dentro de `execute()` — injetar via construtor.

Rotas são finas:

```typescript
// src/modules/orders/orders.routes.ts
export const ordersRouter = Router({ mergeParams: true });
ordersRouter.post('/:orderId/items', UpsertOrderItemTask.handler());
ordersRouter.post('/:orderId/export', ExportOrderTask.handler());
ordersRouter.post('/:orderId/copy-from', CopyOrderTask.handler());
```

Exemplo aplicado ao upsert de célula:

```typescript
@Injectable()
export class UpsertOrderItemTask extends Task<OrderItemOutput> {
  protected validations = [
    verifyParams(OrderIdParamSchema),
    verifyBody(UpsertOrderItemInput, true),
  ];

  constructor(
    @Inject('OrderRepository')     private readonly orderRepo: Repository<Order>,
    @Inject('OrderItemRepository') private readonly itemRepo: Repository<OrderItem>,
    @Inject('ProductRepository')   private readonly productRepo: Repository<Product>,
  ) { super(); }

  async execute(input: BaseInput): Promise<OrderItemOutput> {
    const { orderId } = input.params as { orderId: string };
    const dto      = input.body   as UpsertOrderItemInput;
    const tenantId = input.tenantId!;

    const order = await this.orderRepo.findOne({ where: { id: orderId, tenant_id: tenantId } });
    if (!order) throw new HttpError.NotFound('order_not_found');
    if (order.status === 'closed') throw new HttpError.Conflict('order_closed');

    // … validações de product/grade/override …

    return this.itemRepo.save({ tenant_id: tenantId, order_id: orderId, /* … */ });
  }
}
```

---

## Auth própria

Ver [business-rules.md §Auth](business-rules.md) para detalhes. Resumo do fluxo:

- **Login** (`POST /api/v1/auth/login`): `email + password` → Argon2id compara → emite `access_token` (JWT 15min) + `refresh_token` (UUID com `jti`, persistido em `refresh_token` + cache de revogação em Redis).
- **Refresh** (`POST /api/v1/auth/refresh`): valida cookie httpOnly, rotaciona `jti`, emite novo par.
- **Logout** (`POST /api/v1/auth/logout`): marca `refresh:<jti>=revoked` no Redis (TTL = validade restante) + atualiza `revoked_at` na tabela.
- **Middleware `auth.middleware.ts`**: decodifica JWT, popula `req.userId`, `req.tenantId`, `req.role`. Lança 401 se expirado/inválido.
- **Rotas `/api/v1/admin/*`**: aplicam `requireRole('super_admin')` antes do handler. `super_admin` tem `tenant_id = NULL`.

`refresh_token` na DB é source of truth (histórico + revogação em massa); Redis é fast-path O(1) — pode cair sem perder estado.

---

## Multi-tenancy

- Todo registro tenant-scoped tem `tenant_id uuid NOT NULL REFERENCES tenant(id)`.
- Todo índice composto começa com `tenant_id`: `(tenant_id, <chave>)`.
- Toda query de serviço tem `WHERE tenant_id = :tenantId` **explícito**. Helper `tenantScoped(repo, tenantId).find(...)` envolve casos comuns.
- Tabelas globais (sem `tenant_id`): `collection`, `product`, `product_size_list`, `product_cluster_availability`, `rdd`, `import_base`, `import_base_diff`, grades com `tenant_id IS NULL`.
- `super_admin` (`user.tenant_id IS NULL`) só atua via rotas `/api/v1/admin/*`. O `CHECK` em `user` garante que `role = 'user'` SEMPRE tem `tenant_id`.
- **RLS (Row-Level Security) está no backlog** — MVP confia em `WHERE tenant_id` + testes E2E cobrindo cross-tenant. Não é negociável adicionar RLS sem discussão.

---

## DI (tsyringe)

Registrado em `src/utils/di.ts` (importado em `main.ts` antes das rotas):

- `Repository<Entity>` auto-registrado para toda entidade em `entities/index.ts` (loop).
- Providers externos (`AnthropicProvider`, `S3Provider`, parsers de Excel) por token, permitindo fakes em teste via `@FakeProvider`.
- Services de negócio (`ExportBuilderService`, `InsightRunnerService`, etc.).

---

## Fases de entrega

Ver [../../../.claude/docs/arquitetura.md#fases-de-entrega](../../../.claude/docs/arquitetura.md) para detalhes. Resumo:

| Fase | Escopo |
|------|--------|
| 0 | Fundação: auth + tenant + user + store (sem profile) + deploy mínimo |
| 1 | Catálogo: collection + product + sizes + grade + RDD + import BASE (super_admin) |
| 2 | Cadastro enriquecido: `store_profile` + permissões admin vs franqueado |
| 3 | Pedido: `order` + `order_item` + cluster availability + overrides + copy-order |
| 4 | Dashboard: queries agregadas + 4 charts + filtros |
| 5 | Export Click: gerador 24 cols + split 400 + validações + aba Exportados |
| 6 | Erros do Click: parser de retorno + triagem + re-export parcial |
| 7 | Insights determinísticos (SQL) |
| 8 | IA on-demand com Claude Haiku 4.5 |

---

## Convenções (inegociáveis)

- **Migrations**: TypeORM. Toda correção de schema é **nova** migration. Jamais editar existente.
- **`@Column` sempre com `comment`** descrevendo o campo; `@Entity` com `comment` na tabela. Migrations incluem `COMMENT ON COLUMN` / `COMMENT ON TABLE`.
- **Validação**: class-validator + class-transformer. Mensagens de erro em **português**.
- **Env**: `src/config/env.ts` + `src/config/migration-env.ts` — nunca `process.env` direto fora desses dois arquivos.
- **OpenAPI**: `src/docs/openapi.ts` sincronizado com os DTOs a cada mudança.
- **Commits**: Conventional Commits.
- **Testes**: Vitest + Testcontainers (Postgres real, sem mock do banco). Ver [testing.md](testing.md) e [e2e-tests.md](e2e-tests.md).
