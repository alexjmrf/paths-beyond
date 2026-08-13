# Paths Beyond

Leia `CLAUDE.md` — ele é a fonte da verdade das regras, arquitetura e fluxo de trabalho do projeto. Este arquivo só aponta para ele e para os agentes.

## Regras rápidas

- `packages/core` é puro e determinístico: sem `Math.random`, sem `Date`, sem ponto flutuante em regra (helpers de `math/fixed.ts`). Nunca adicione IA "esperta" ao duelo.
- Dados vivem em `packages/data` como JSON validado por Zod. Números de balanceamento nunca em código.
- O cliente só renderiza o resultado do core. Nenhuma regra no cliente.
- Testes antes da implementação em `core` e `data`. Cole a saída real dos testes ao terminar.
- Um milestone por sessão. Plano aprovado antes de codar.
- Decisão fora da spec: pergunte ou registre em `DECISIONS.md`.

## Comandos

```bash
pnpm test
pnpm validate:data
pnpm lint
pnpm sim -- duel A.json B.json --seed 42
pnpm balance -- --runs 10000
```

## Subagentes

- `core` — regras de jogo em `packages/core`
- `content` — dados em `packages/data` / `packages/content`
- `client` — UI em `apps/client`
- `server` — PvP em `apps/server`
- `balance` — `pnpm balance` e ajustes de balanceamento em dados
- `docs` — `PROGRESS.md` / `DECISIONS.md`

Cada agente opera apenas na fronteira do pacote dele. Orquestração e decisões de design ficam com você.
