# Project Vanguard

Tactical RPG: grid tipo Fire Emblem, duelos automáticos 1v1 com economia de recursos tipo Unicorn Overlord, iniciativa tipo Dofus, equipamento tipo Epic Seven, talentos tipo WoW, PvP assíncrono.

## Conceitos que você não pode confundir

- **1 herói = 1 tile.** Não existe esquadrão nem formação interna. Adjacência no grid é a formação.
- **Duelo** = confronto 1v1 automático de até 3 trocas, aberto pelo comando `engage`.
- **Troca** = rodada dentro do duelo. **Round** = uma volta completa na lista de iniciativa do mapa.
- **AP/PP** = pools da batalha inteira, nunca do duelo. Cooldowns contam em rounds de mapa.

## Regras Invioláveis

1. `packages/core` não importa nada além de si mesmo. Sem DOM, `fetch`, `Date`, `Math.random`, nem dependências externas.
2. Nenhum ponto flutuante em cálculo de regra. Use os helpers de `packages/core/src/math/fixed.ts` (escala 1000).
3. Nenhuma regra no cliente. O cliente só renderiza o resultado do core.
4. Nada de conteúdo hardcoded: classes, skills, itens, mapas, inimigos e números vivem em `packages/data` como JSON validado por Zod.
5. Todo sistema entra com teste de determinismo (mesma seed → mesmo hash) antes de entrar com UI.
6. Não adicione IA "esperta" ao duelo. O algoritmo de decisão da spec é literal; previsibilidade é o produto.
7. AP e PP nunca regeneram passivamente. Toda fonte de recuperação é explícita e declarada em dados.
8. `spd` concede exatamente três benefícios (iniciativa, preempção no duelo, evasão com cap). Nenhum outro.
9. A lista de iniciativa não é recalculada durante a batalha. Buff de `spd` não reordena nada.
10. Não mude fórmula nem número de balanceamento sem rodar `pnpm balance` e mostrar o relatório.
11. Toda mudança de regra incrementa `rulesVersion`.
12. Funções do core são puras. Sem mutação in-place fora de um reducer explícito.
13. Decisão de design fora da spec: pergunte ou registre em `DECISIONS.md`. Não invente em silêncio.

## Onde está a especificação

A spec é normativa e está dividida por assunto. **Leia apenas o arquivo relevante para a tarefa atual** — não carregue todos.

| Arquivo | Conteúdo |
| --- | --- |
| `docs/spec/00-visao-e-pilares.md` | Pilares de design; use para desempatar decisões ambíguas |
| `docs/spec/01-fundacoes-tecnicas.md` | Stack, monorepo, ponto fixo, RNG, comandos e replay |
| `docs/spec/02-modelo-de-dados.md` | Stats e a ordem de agregação (normativa) |
| `docs/spec/03-camada-grid.md` | Mapa, movimento, iniciativa, ações de turno |
| `docs/spec/04-duelo.md` | **Núcleo do jogo.** Trocas, AP/PP, scripts táticos, assistências, dano, papel do `spd` |
| `docs/spec/05-equipamento.md` | Slots, substats, enhance, sets, CP |
| `docs/spec/06-classes-e-talentos.md` | Classes, promoção, árvores, skills |
| `docs/spec/07-pvp.md` | Modos, segurança, balanceamento |
| `docs/spec/08-progressao-e-ui.md` | Economia PvE e requisitos duros de UI |
| `docs/spec/09-roadmap.md` | Milestones e critérios de aceite |

`PROGRESS.md` diz em que milestone o projeto está. **Leia antes de começar qualquer coisa.**
`DECISIONS.md` registra decisões tomadas fora da spec.

## Fluxo de trabalho

- **Um milestone por sessão.** Não antecipe trabalho de milestones futuros nem "aproveite para já deixar pronto".
- Comece pelo plano: descreva o que vai fazer e espere aprovação antes de escrever código.
- Testes antes da implementação em `packages/core` e `packages/data`.
- Ao terminar: rode os testes, liste os critérios de aceite do milestone e **mostre a saída real dos testes** provando cada um. Não afirme que passou sem colar a saída.
- Atualize `PROGRESS.md` ao fim de cada sessão com o que foi feito e o que ficou pendente.

## Comandos

```bash
pnpm test            # Vitest em todos os pacotes
pnpm validate:data   # Zod contra todo JSON de packages/data
pnpm lint            # inclui checagem de Math.random / float em core
pnpm sim -- duel A.json B.json --seed 42     # duelo headless, troca a troca
pnpm sim -- battle map.json --replay r.json  # batalha headless
pnpm balance -- --runs 10000                 # matriz de winrate + distribuição de stats
```
