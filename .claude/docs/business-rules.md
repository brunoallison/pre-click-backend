---
name: business-rules
description: Regras de negócio do pedido-backend mapeadas para CHECK constraints, validações de DTO e guardas de uso. Use ao escrever Tasks, DTOs, migrations ou revisar lógica de domínio.
---
# Regras de Negócio — pedido-backend

> **Fonte canônica:** [../../../.claude/rules/negocio.md](../../../.claude/rules/negocio.md). Este arquivo é o mapeamento dessas regras para **onde e como** o backend enforca cada uma (CHECK, DTO, guard em Task, índice único, etc.). Se houver divergência: pai vence, este arquivo se ajusta.

---

## 1. BASE da Adidas

### 1.1 Importação
- **Quem**: exclusivamente `super_admin` (`user.tenant_id IS NULL`) via `POST /api/v1/admin/imports/base`.
- **Async**: enfileira em BullMQ (`import-base` queue); handler responde 202 com `import_id`.
- **Estrutura**: `.xlsx` com abas `AMD` (produtos) + `FRA_STORES` (lojas / franqueados). Abas `CAMPGN` e `DUMMY*` são ignoradas (redundância e placeholders).
- **Diff determinístico**: toda linha cai em `import_base_diff` com `action = 'create' | 'update' | 'skip'` + hash da versão anterior.

### 1.2 Mapeamento Franquia → Tenant
- Cada `FRANQUEADO` distinto em `FRA_STORES` vira (ou matcha) 1 linha em `tenant`.
- No primeiro import o `super_admin` confirma o mapping via `POST /api/v1/admin/tenant-mappings` (para evitar duplicata silenciosa de tenant).
- Lojas com `TYPE = 'DUMMY'` são descartadas no parser — não entram em `store`.

### 1.3 Granularidade de classificação por cluster
- Coluna `cluster_classification` em `product_cluster_availability` é string: `'0' | '1' | 'OP'`.
- Modificador opcional de escopo em `restriction_scope`: `'RJ'`, `'BH'`, `'IPA E OSCAR'`, `'SP RJ'`, `'IPA, FIESTA E OSCAR'`.
- Parsing e resolução vivem em `services/cluster-restriction.service.ts` — nunca inlinear no handler.

---

## 2. Coleção e calendário

- **2 pré-vendas/ano**: `SS<YY>` em maio (ship dez–mai), `FW<YY>` em novembro (ship jun–nov).
- `collection.code` é UNIQUE global (ex.: `SS27`, `FW26`).
- Coleção ativa é calculada pela data do sistema + `collection.window_open_at` / `window_close_at`; não armazenar "coleção corrente" como estado.

---

## 3. RDD (data de entrega)

- **Imutável**: derivado de `LOCAL RID` na BASE → coluna `rdd.serial_excel` na tabela global `rdd`.
- Operador **nunca** edita RDD — DTO de `order_item` não aceita o campo.
- Mesmo produto pode ter RDDs diferentes por loja (pedidos separados no Click) — chave de split no export.

---

## 4. Produto e grade

### 4.1 Volume mínimo por DIVISION
| DIVISION | Mínimo |
|----------|--------|
| ACC | 4 |
| APP | 6 |
| FTW | 12 |

Enforçado em `order-validation.service.ts` **no momento do export** (não bloqueia upsert — operador pode salvar rascunho abaixo do mínimo, mas não exporta).

### 4.2 Grade × N
- Única forma de calcular quantidade por tamanho no pedido.
- Grade padrão (`product.default_grade_id`) vem da BASE; operador pode trocar para qualquer grade compatível com `size_list` do produto.
- `order_item.multiplier` é o `N`; quantidade final por SKU é `grade_size_qty × multiplier`.

### 4.3 Override de grade
- Operador pode sobrescrever qty específica em `order_item_override`.
- Enforçado por CHECK: `CHECK (override_qty >= 0)` + validação em `UpsertOrderItemOverrideTask` de que o tamanho existe em `product_size_list`.

---

## 5. Loja e CUSTOMER

- `store.customer_id` é **imutável depois de atribuído** (trigger de update na entity ou guard em `UpdateStoreTask` comparando valor anterior).
- Para lojas `new_in_2026 = true`, começa `NULL` — SAP ainda não cadastrou. Guard de `ExportOrderTask` bloqueia export se loja sem `customer_id` (`HttpError.UnprocessableEntity('store_missing_customer_id')`).
- `customer_id` UNIQUE por coleção quando preenchido: `UNIQUE INDEX (collection_id, customer_id) WHERE customer_id IS NOT NULL`.
- **Nome da loja no export** = `store.name` sem normalização. Click é case-sensitive, então o nome cadastrado tem que bater com o SAP da Adidas — este é o contrato.

### 5.1 Cluster da loja
- Atribuído pela Adidas; franqueado apenas registra em `store.cluster_code`.
- Lista de 12 clusters em `cluster` (tabela global, seed): `FR_BCS_TOP`, `FR_BCS_MID`, `FR_BCS_LOW`, `FR_OCS_TOP`, `FR_OCS_MID`, `FR_OCS_LOW`, `FR_YACS_MID`, `SNEAKR_TOP`, `FR_BCS_ENTRY`, `FR_OCS_ENTRY`, `FR_SNKR_TOP`, `FR_SNKR_ENTRY`.

---

## 6. Pedido

### 6.1 Identidade
- `order = store × collection`, UNIQUE: `UNIQUE INDEX (tenant_id, store_id, collection_id)`.
- `order.status`: `draft | submitted | exporting | exported | closed`.
- Status `closed` bloqueia qualquer mutation (`HttpError.Conflict('order_closed')`).

### 6.2 Item
- `order_item = order × product`, UNIQUE: `UNIQUE INDEX (order_id, product_id)` (escopado por `tenant_id` no índice composto).
- **Qty zero nunca exporta** — `order-validation.service.ts` filtra `multiplier = 0 AND sum(overrides) = 0` antes de montar o CLICK.
- Grade do item tem que estar em `product.compatible_grade_ids` (validação no upsert).

### 6.3 Copy-from
- `POST /api/v1/orders/:id/copy-from` copia items de **outro** pedido (mesmo tenant, loja diferente OU coleção diferente).
- Guard: produtos inválidos no contexto destino (cluster não permitido, produto retirado da coleção nova) são descartados com log — não falha a operação inteira.

---

## 7. Export Click

### 7.1 Formato
- Sheet `CLICK`, 24 colunas A-X, coluna X = `Qty`. Contrato completo em [../../../.claude/docs/click-export.md](../../../.claude/docs/click-export.md).
- **Não é o formato PEDIDO legado** (7 cols + macro VBA) — esse foi deprecado.

### 7.2 Split 400 linhas
- Cada arquivo `.xlsx` tem no máximo 400 linhas (limite do Click).
- Split por `(store_id, rdd)`; se ultrapassar 400, gera múltiplos arquivos com sufixo `_pt1`, `_pt2` etc.
- Cabeçalho (linha 1) sempre presente em cada arquivo.

### 7.3 Pré-export (validações bloqueantes)
Rodadas em sequência em `order-validation.service.ts`:
1. Loja tem `customer_id` (ou é `new_in_2026 = true` com override explícito do operador).
2. Todo produto do pedido respeita volume mínimo da sua DIVISION.
3. Todo produto está permitido no cluster da loja (`product_cluster_availability.cluster_classification != '0'`).
4. Nenhum produto tem qty total zero.
5. Coleção está na janela de pré-venda (`collection.window_open_at <= now() <= window_close_at`).

Qualquer falha retorna 422 com lista de erros (PT-BR).

### 7.4 Aba Exportados
- Cada export gera 1 linha em `export_log` (ou N se houve split) com snapshot do payload.
- Coluna A da sheet PEDIDO legado era vazia — na sheet CLICK não existe esse comportamento; A é `Brand`.

---

## 8. Erros do Click (re-import)

- `POST /api/v1/click-errors/imports` aceita o `.xlsx` que o Click devolveu com erros.
- Parser em `providers/excel/error-parser.ts` cria linhas em `click_error`.
- UI lista; operador triaga; re-export parcial via `POST /api/v1/orders/:id/export?only-errors=true`.

---

## 9. Multi-tenancy (enforcement)

- `tenant_id uuid NOT NULL REFERENCES tenant(id)` em toda tabela tenant-scoped.
- Todo índice composto: `(tenant_id, <chave>)`.
- Todo service: `WHERE tenant_id = :tenantId` explícito.
- `super_admin` (`user.tenant_id IS NULL`) só entra via `/api/v1/admin/*` (middleware `requireRole('super_admin')`).
- CHECK em `user`: `CHECK (role = 'super_admin' OR tenant_id IS NOT NULL)` — usuário comum sempre tem tenant.
- RLS Postgres: **backlog**. MVP confia em `WHERE tenant_id` + testes E2E cobrindo cross-tenant.

---

## 10. Auth

- Login: `email + password` → Argon2id → JWT 15min (`access_token`) + refresh UUID 7d (httpOnly cookie, persistido em `refresh_token` + fast-path Redis).
- Refresh: rotaciona `jti`, revoga o anterior em `refresh:<jti>=revoked` no Redis + `revoked_at` na tabela.
- Rate limit no `/auth/login`: 10/min por IP (token bucket em Redis).
- Política de senha: mínimo 10 chars, obrigatório 1 maiúscula + 1 número + 1 especial; validado no `CreateUserTask` e `ChangePasswordTask`.

---

## 11. LLM (Claude Haiku 4.5)

- Apenas na Fase 8 (insights on-demand).
- Rate limit específico: 60 chamadas/hora por tenant (`middlewares/ai-rate-limit.middleware.ts`).
- Cache de resposta em Redis por 24h (`services/ai-cache.service.ts`).
- Nunca mandar PII para o LLM — `providers/anthropic` tem sanitizer que remove CPF, CNPJ, email antes do prompt.

---

## 12. Constantes e limites

| Regra | Valor | Onde |
|---|---|---|
| Refresh token TTL | 7d | `env.REFRESH_TOKEN_TTL_DAYS` |
| Access token TTL | 15min | `env.ACCESS_TOKEN_TTL_SECONDS` |
| Max linhas por sheet CLICK | 400 | `export-builder.service.ts` |
| Max items por pedido | sem limite (backlog se virar problema) | — |
| Max tentativas de login | 5 antes de lock de 15min | `services/login-attempts.service.ts` |
| Rate limit AI por tenant | 60/h | `ai-rate-limit.middleware.ts` |
| Password mínimo | 10 chars | DTO validator |
| Argon2id params | `memoryCost=19456, timeCost=2, parallelism=1` | `utils/password.ts` |
