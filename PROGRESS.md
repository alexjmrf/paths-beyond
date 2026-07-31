# Progresso

> Atualize este arquivo ao fim de cada sessão. Ele é o único jeito de a próxima sessão saber onde o projeto parou.

**Milestone atual:** M1 — Núcleo determinístico

## Estado

- [x] M0 — Fundação (monorepo, TS strict, Vitest, Zod, CI)
- [ ] M1 — Núcleo determinístico (ponto fixo, RNG, agregação de stats)
- [ ] M2 — Duelo headless
- [ ] M3 — Camada de grid
- [ ] M4 — Equipamento
- [ ] M5 — Classes e talentos
- [ ] M6 — Cliente jogável
- [ ] M7 — PvP assíncrono
- [ ] M8 — Conteúdo e balanceamento

## Log de sessões

<!-- Formato: data — milestone — o que foi feito — o que ficou pendente -->

- **2026-07-31 — M0 — Fundação.** Scaffold completo do monorepo: `git init`, pnpm workspaces (`packages/core`, `packages/data`, `packages/sim-cli`), TypeScript strict (`tsconfig.base.json` compartilhado, `noUncheckedIndexedAccess`, sem project references por ora), Vitest via `vitest.workspace.ts`, `packages/data/validate.ts` com descoberta dinâmica de schemas Zod (hoje 0 schemas — provado honesto via `packages/data/test-fixtures/`), `scripts/check-no-random.mjs` (checagem de `Math.random` em `core`, testada com diretórios temporários) e CI em `.github/workflows/ci.yml` (Node 22, corepack, typecheck/lint/test/validate:data). Ambiente local foi atualizado de Node 18.18.0 para Node 22 LTS (via winget) para satisfazer `engines.node >= 22` com `engine-strict=true`. Todos os critérios de aceite do M0 confirmados rodando os comandos reais: `pnpm typecheck`, `pnpm lint`, `pnpm test` (13 testes, 4 arquivos) e `pnpm validate:data` — todos verdes. `apps/client`, `apps/server`, `packages/ui` e `tools/balance` foram deliberadamente deixados de fora (sem critério de aceite em M0). Nada ficou pendente do M0.
