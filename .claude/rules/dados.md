---
paths:
  - "packages/data/**"
---

# Regras de `packages/data`

- Todo JSON tem schema Zod correspondente em `packages/data/schemas/`. Sem schema, o arquivo não entra.
- `pnpm validate:data` precisa passar antes de qualquer commit.
- Números de balanceamento vivem **aqui**, nunca em código. Se você precisou de um número mágico no core, ele está no lugar errado.
- Não invente conteúdo novo (classes, skills, sets) para "testar". Use `packages/data/test-fixtures/`.
- Ao alterar qualquer número que afete combate: rode `pnpm balance` e cole o relatório na resposta.
