---
paths:
  - "packages/core/**/*.ts"
---

# Regras de `packages/core`

Este pacote é a simulação. Ele roda no browser, no Node e no servidor de PvP, e os três **precisam** produzir bytes idênticos.

- **Proibido:** `Math.random`, `Date`, `performance.now`, `fetch`, qualquer acesso a DOM, qualquer dependência externa.
- **Proibido:** `+`, `-`, `*`, `/` em cálculo de regra fora dos helpers de `math/fixed.ts`. Soma e subtração de inteiros já em escala são aceitáveis; multiplicação e divisão nunca.
- Todo número de regra é **inteiro em escala 1000**. 45,7% é `457`. Truncar sempre com `Math.trunc`, nunca `Math.round`.
- RNG vem de `rngFor(battleSeed, round, unitId, purpose)`. Nunca reaproveite um stream entre sistemas diferentes — adicionar uma rolagem em um sistema não pode deslocar as rolagens de outro.
- Funções são puras: recebem estado, devolvem estado novo. Sem mutação in-place fora de um reducer explícito.
- Toda função pública nova precisa de um teste que rode duas vezes com a mesma seed e compare o hash do resultado.

Detalhes normativos em `docs/spec/01-fundacoes-tecnicas.md`.
