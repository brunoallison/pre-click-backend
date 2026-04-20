---
shortDescription: Git workflow rules for all coders.
scope: coding
version: 0.1.0
lastUpdated: 2026-04-19
lastAuthor: bruno-allison
---

## Statement

Todos os commits DEVEM usar prefixos de conventional commit: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `style:`.

Nomes de branch DEVEM seguir os mesmos prefixos: `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `chore/`.

Mensagens de commit DEVEM ser curtas — uma única frase. Se precisar descrever muito, deveria ter commitado antes.

Todos os novos branches DEVEM ser criados a partir de `main`. Sempre `git checkout main && git pull` antes de criar branch.

Todos os PRs DEVEM ter `main` como branch alvo — incluindo PRs criados automaticamente pelo Claude.

Nunca fazer push direto para `main` sem PR. Nunca usar `--force` em `main`.

## Rationale

Conventional commits permitem changelogs automatizados, versionamento semântico e tornam o histórico de git legível. Commits curtos com intenção clara são mais fáceis de revisar, reverter e bisectar.
