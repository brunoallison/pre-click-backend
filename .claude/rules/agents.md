---
shortDescription: Output language and behavior rules for automated review agents.
scope: ci-agents
version: 0.1.0
lastUpdated: 2026-04-19
lastAuthor: bruno-allison
---

## Statement

Todos os agentes de revisão automatizados DEVEM produzir output em **português brasileiro** (`pt-br`).

Isso se aplica a:
- Agentes de security audit configurados no CI
- Qualquer agente futuro adicionado ao pipeline de CI

## Rationale

O time se comunica em português. Achados apenas em inglês criam atrito ao revisar, triar e agir sobre o feedback do CI. Linguagem consistente em todos os agentes reduz carga cognitiva.
