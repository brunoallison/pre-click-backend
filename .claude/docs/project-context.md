---
name: project-context
description: Visão de produto do Pedido Adidas, fluxo de importação da BASE, fluxo de export Click. Use antes de tarefas complexas ou quando precisar de visão geral do sistema.
---
# Contexto do projeto — pedido-backend

> Domínio canônico em [../../.claude/](../../.claude/). Este arquivo foca no ângulo do backend — o que implementa, como se integra, scripts e infraestrutura.

## O que é

**pedido-backend** — API REST que substitui a planilha `BASE PEDIDO` + macro VBA para franquias Adidas. Três capacidades principais:

1. **Import** da BASE entregue pela Adidas (`.xlsx`, abas `AMD` + `FRA_STORES FW26`).
2. **Gerência** de pedidos multi-tenant (1 franqueado = 1 tenant; 1 tenant = N lojas; 1 pedido = 1 loja × 1 coleção).
3. **Export** no formato Click (sheet `CLICK`, 24 colunas A-X) pronto para upload na interface web da Adidas.

Para a estrutura real da BASE e campos de cada aba, ver [../../.claude/docs/base-adidas.md](../../.claude/docs/base-adidas.md).
Para o contrato exato do export, ver [../../.claude/docs/click-export.md](../../.claude/docs/click-export.md).

## Stack

- **Runtime**: Node.js ≥ 22
- **Framework**: Express 5 (não NestJS — decisão deliberada, ver [docs/architecture.md](architecture.md))
- **Linguagem**: TypeScript 5.7+ (strict)
- **Banco**: PostgreSQL 16 + TypeORM 0.3 (migrations em `src/migrations/`)
- **DI**: tsyringe (tokens explícitos)
- **Auth**: JWT 15min (access) + UUID 7d (refresh, httpOnly cookie), Argon2id para password, Redis para revogação fast-path
- **Background**: BullMQ + Redis (import de BASE, async pesado)
- **Excel**: exceljs (parse streaming de `.xlsx`; escrita da sheet CLICK)
- **Logs**: Pino
- **Testes**: Vitest + supertest + @testcontainers/postgresql

## Diferença crítica vs taya-credit-engine

| Aspecto | taya-credit-engine | pedido-backend |
|---------|-------------------|----------------|
| Auth | Apigee injeta `x-tenant-id` | JWT próprio → `tenant_id` derivado do token |
| Tenant no request | Header `x-tenant-id` | `req.tenantId` extraído pelo `auth.middleware.ts` |
| `super_admin` | N/A | `user.tenant_id IS NULL` + rotas `/admin/*` |
| Background jobs | NATS (opcional) | BullMQ + Redis (obrigatório para import) |
| Auth endpoint | N/A | `POST /api/v1/auth/login` + refresh + logout |

## Fluxo de importação da BASE

```
super_admin faz upload de AMD_FW26_FRAs.xlsx
  ↓ POST /api/v1/admin/imports/base (multipart)
  ↓ handler valida, salva no S3, enfileira job BullMQ
  ↓ retorna 202 { import_id, job_id }
  ↓ worker import-base.worker.ts:
      1. parser lê aba AMD (~3000 linhas, header na linha 2)
      2. parser lê aba FRA_STORES (128 lojas, 9 franqueados)
      3. grava product + product_size_list + product_cluster_availability + rdd
      4. grava store (filtra DUMMY) por franqueado
      5. registra import_base_diff (create | update | skip)
      6. aguarda super_admin confirmar FRANQUEADO → tenant mapping
  ↓ GET /api/v1/admin/imports/:id — polling de status
  ↓ POST /api/v1/admin/tenant-mappings — confirma mapping
```

## Fluxo de export Click

```
operador clica "Exportar pedido"
  ↓ POST /api/v1/orders/:id/export
  ↓ order-validation.service.ts: valida customer_id, vol mínimo, cluster, qty > 0
  ↓ order-expansion.service.ts: expande order_item × grade_size_qty
  ↓ export-builder.service.ts: monta sheet CLICK (24 cols A-X), split 400 linhas
  ↓ providers/s3: salva .xlsx no S3
  ↓ grava export_log
  ↓ retorna 200 { export_id, files: [{ download_url }] }
```

## Fases de entrega

| Fase | Escopo | Status |
|------|--------|--------|
| 0 | Fundação: auth, tenant, user, store | a implementar |
| 1 | Catálogo: collection, product, grade, RDD, import BASE | a implementar |
| 2 | Store enriquecida: profile, cluster, status_comp | a implementar |
| 3 | Pedido: order, order_item, cluster availability, copy-from | a implementar |
| 4 | Dashboard: KPIs, charts, resumo de pedido | a implementar |
| 5 | Export Click: gerador 24 cols, split 400, validações, Exportados | a implementar |
| 6 | Erros do Click: parser, triagem, re-export parcial | a implementar |
| 7 | Insights determinísticos (SQL) | a implementar |
| 8 | IA on-demand com Claude Haiku 4.5 | a implementar |

## Scripts principais (package.json)

- `npm run dev` — desenvolvimento com ts-node-dev/watch
- `npm run build` — tsc + tsc-alias
- `npm run start` — `node dist/main.js`
- `npm run lint` / `npm run lint:fix` — ESLint em `src/**/*.ts`
- `npm run format` — Prettier em `src/**/*.ts`
- `npm run test:e2e` — E2E (Vitest, config `vitest.e2e.config.ts`)
- `npm run test:unit` — unitários (Vitest, config `vitest.unit.config.ts`)
- `npm run typeorm` / `migration:generate` / `migration:run` / `migration:revert` — TypeORM CLI

## Infraestrutura

- PostgreSQL 16 + Redis 7 via Docker Compose em dev.
- S3-compatível (Hetzner Object Storage ou R2) para upload de BASE e exports.
- Deploy previsto: Cloud Run ou VPS (não decidido no MVP).
- Não tem Apigee nem API Gateway — auth é responsabilidade deste serviço.

## Variáveis de ambiente principais

Todas declaradas em `src/config/env.ts`. Referência:

| Variável | Descrição |
|----------|-----------|
| `NODE_ENV` | `local` \| `dev` \| `prod` |
| `PORT` | Porta HTTP (default 3000) |
| `POSTGRES_*` | Conexão PostgreSQL |
| `REDIS_URL` | URL do Redis (auth + BullMQ) |
| `JWT_SECRET` | Segredo para assinar access tokens |
| `REFRESH_TOKEN_SECRET` | Segredo para refresh tokens |
| `ARGON2_PEPPER` | Pepper do Argon2id (adicional ao salt) |
| `S3_*` | Credenciais e bucket S3 |
| `ANTHROPIC_API_KEY` | Chave da API Claude (Fase 8) |
