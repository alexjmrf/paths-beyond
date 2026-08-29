# Handoff — P0, P1 e P2 fechados

> **Revisado em 2026-08-28 contra o código, não contra a versão anterior deste documento.**
> A versão anterior descrevia o projeto em **M8** (563 testes, 55 arquivos, 17 schemas). O
> repositório está em **M16**, e a maior parte das pendências que ela listava foi fechada entre
> M10 e M15 — ver "Verificado e fechado". Mantê-la como estava mandaria a próxima sessão
> reimplementar código que já passa em teste.
>
> Leia junto do `PROGRESS.md`, que é quem tem o detalhe por sub-sessão.

## Estado validado

Executado no repositório de verdade, nesta revisão:

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Suíte | `pnpm test` | 1397 testes, 104 arquivos, todos passando |
| Tipos | `pnpm typecheck` | 7 pacotes, todos limpos |
| Determinismo | `pnpm lint` | nenhum `Math.random` em `packages/core/src` |
| Conteúdo | `pnpm validate:data` | 23 schemas, 124 arquivos validados |
| Balanceamento | `pnpm balance -- --runs 10000` | **43,9%–60,8%; `spd` 15,5%; ZERO counters absolutos; 94,7% das batalhas com assistência** |
| Instalação | `pnpm install --frozen-lockfile` | exit 0 |

`RULES_VERSION` está em **`0.16.0`**. (A versão anterior deste documento dizia "não suba
`RULES_VERSION`" — instrução vencida: ela subiu legitimamente em M10, M11, M14 e M15, cada bump
com a justificativa no changelog de `packages/core/src/rulesVersion.ts`.)

---

## Verificado e fechado

Itens que a versão anterior listava como pendentes e que a verificação encontrou **implementados
e cobertos por teste**. A coluna de prova é o que dispensa a próxima sessão de reabrir o assunto.

| Item | Fechado em | Prova no código |
| --- | --- | --- |
| **P0.1** lockfile dessincronizado | esta revisão | Ver abaixo — a causa real era outra |
| **P1.1a** comps de balanceamento com 1 unidade | plano de comps de 3 heróis | os 9 arquivos de `packages/data/comps/` têm 3 unidades cada |
| **P2.2** dano/cura de assistência não chegam ao HP | M10 2/N (dano), M10 7/N (cura) | `applyAssistDamage` em `packages/core/src/duel/resolveDuel.ts:842`; cura de assistência em `:865`. Testes: `packages/core/tests/duel/assist.test.ts`, `heal.test.ts`, `healInDuel.test.ts` |
| **P2.2** `mapSkill` sem AOE | M11 2/N | `applyMapSkill` lê `cmd.target` e `SkillDef.areaRadius`; `packages/core/tests/battle/mapSkillArea.test.ts` |
| **P2.2** `useValor` não aplica efeito | M11 3/N + M15 1/N | os quatro `kind` resolvem, `summonReinforcement` incluído; `packages/core/tests/battle/valorSkills.test.ts`, `summon.test.ts` |
| **P2.2** só `rout` tem resolução | M11 1/N | `seize`, `surviveRounds`, `escort` e `defend` em `packages/core/src/battle/winCondition.ts`; `winConditions.test.ts` |
| **P2.2** DoT/regeneração não tickam | M10 3/N | tick em `packages/core/src/battle/round.ts`; `round.test.ts` |
| **P2.2** triggers de reação além de `onAttacked` | M10 5/N (`onDamaged`, `onDebuffed`), M10 8/N (`onLethal`) | `packages/core/tests/duel/lethalInDuel.test.ts` e os testes de reação em `resolveDuel.test.ts` |

### P0.1 — a causa real, e a correção aplicada

O sintoma descrito na versão anterior (`packages/core/package.json` ganhou `@vitest/browser` e
`playwright` sem regenerar o lockfile) **já estava corrigido**: o lockfile do `HEAD` tem os dois
no importer `packages/core`, com os specifiers batendo.

O que estava quebrado era outra coisa, e **só na árvore de trabalho**: o `pnpm-lock.yaml` local
tinha **perdido o importer `packages/content` inteiro**, além das entradas `@paths-beyond/content`
dos cinco pacotes que dependem dele (`apps/client`, `apps/server`, `packages/content`,
`packages/sim-cli`, `tools/balance`) — seis importers onde deveriam existir sete. Junto disso, o
arquivo local carregava sete bumps de dependência **transitiva** (`@inquirer/*`,
`@testing-library/user-event`, `tldts`, `ws`) que não estão declarados em nenhum `package.json` e
que chegaram por deriva de resolução em alguma sessão anterior.

**A correção foi `git checkout HEAD -- pnpm-lock.yaml`, e não regenerar.** Verificado antes de
decidir: partindo do lockfile do `HEAD`, `pnpm install` não precisa mudar **uma linha** — o
arquivo commitado sempre esteve completo. Regenerar por cima do arquivo degradado teria funcionado
também, mas arrastaria os sete bumps para dentro do commit, que é escopo que o P0.1 não pede.

**Nenhum commit foi necessário:** o lockfile voltou a ser byte a byte igual ao do `HEAD`, e
`git status` não o reporta mais como modificado. **Aceite cumprido:**
`pnpm install --frozen-lockfile` sai com exit 0.

Lição para a próxima vez que isto aparecer: **antes de regenerar, cheque se o `HEAD` já está
certo.** O sintoma ("`--frozen-lockfile` falha") é o mesmo nos dois casos, e as correções são
opostas — uma commita um arquivo novo, a outra descarta uma corrupção local.

---

## P0 — vazio

Nada bloqueia merge no momento.

---

## P1 — FECHADO em 2026-08-28

O harness deixou de medir um jogo mais simples que o real.

**1.1 — a assimetria de alcance de §6.1 está LIGADA.** `weaponDuelRanges` voltou aos valores reais
(`bow`/`arcane`/`nature`/`holy` = 2), as 9 comps da arena viraram mistas (2 da própria classe + 1
apoio que cobre o lado que falta) e o `atk` das quatro classes de alcance caiu 33% no nível 10.
A contagem de assistências entrou no relatório.

| | baseline histórico | agora |
| --- | --- | --- |
| Faixa de winrate | 42,5 – 59,9% | **43,9 – 60,8%** |
| **Counters absolutos** | **10 de 72** | **0 de 72** |
| `spd` acima da mediana | 20,0% | 15,5% |
| Batalhas com assistência | não medido | **94,7%** (2,91/batalha) |
| Assimetria de §6.1 | desligada | **ligada** |

O aceite pedia counters abaixo de 10% dos confrontos. Deu **zero**.

Três correções de conteúdo foram necessárias, e as três são a mesma classe de defeito — posição
escolhida quando `bow` valia 1: os arqueiros dos capítulos 2 e 4 reposicionados, e os guardas do
covil do tirano um nível abaixo. Seis configurações foram medidas antes de chegar aqui, incluindo
duas hipóteses que caíram (comps de proporção igual, e tabela de alcance por modo). Detalhe
completo em `DECISIONS.md`.

**1.2 — o critério do M8 na spec** passou a exigir a faixa 40–60%.

## P2 — FECHADO em 2026-08-28

**2.1 — as sete constantes de balanceamento ficam em `packages/core`.** A decisão não saiu de
opinião: o P1.1 rebalanceou o jogo inteiro (faixa de 26,5–79,6% para 43,9–60,8%, counters de 16
a zero, um sistema de combate inteiro ligado) e **nenhuma delas precisou ser tocada**. O que moveu
o balanceamento foi tudo dado — `weapon-duel-ranges`, o `atk` das classes, a composição das comps
e o posicionamento dos encounters. A regra 4 existe para que ajustar balanceamento não exija mexer
em código, e um rebalanceamento de escala máxima acabou de acontecer sem isso.

Reabre se um dia `spd` dominar e a correção passar por `PREEMPT_THRESHOLD_PCT` ou pelo cap de
evasão (§6.7 nomeia os dois como primeiras alavancas). Hoje `spd` está em 15,5% das builds
vencedoras contra um alerta em 60%, e caiu sem ninguém tocar nessas constantes.

**2.2 —** todos os itens já estavam fechados entre M10 e M11; ver "Verificado e fechado".

## O que este documento não sabia: o milestone atual

A versão anterior tinha um "P3 — M9, shell desktop (Electron + steamworks.js)". Esse escopo **não
é o do roadmap deste projeto**: o M9 real é "Integração de conteúdo", e o roadmap
(`docs/spec/09-roadmap.md`) vai até M16. Removido para não desviar a próxima sessão.

**O estado real do milestone corrente, de `PROGRESS.md`:**

**M16 — Linguagem visual programática, EM ANDAMENTO (4/N feita).** Os critérios de aceite 1, 3 e 4
batem por teste. **O critério 2 ("o grid, as unidades e o estado de batalha são legíveis sem hover
e sem legenda, validado pelo usuário no browser") é a única coisa que trava o milestone, e só fecha
com a palavra do usuário** — o §3 do briefing (`docs/milestones/M16-linguagem-visual-programatica.md`)
proíbe o agente de autocertificar estética. A passagem de imagens foi entregue ao fim de 2/N, 3/N e
4/N sem julgamento de volta.

Pendências registradas, nenhuma delas critério de aceite:

- o primeiro turno de IA (o que `buildInitialState` drena antes do primeiro clique) não é animado;
- a tela de replay não anima nada, como desde M13 1/N;
- `lifesteal` está vivo no motor e **nenhum item, set ou classe do catálogo o concede** — o set
  "Vampiro" de §7.4 nunca foi autorado (M15 4/N);
- nenhum nó do catálogo declara `minAwakening`, herdado de M14;
- masmorra não tem tela de replay.

Fora do código: **112 entradas não commitadas** na árvore (55 modificadas, 57 não rastreadas, sem
contar este arquivo), cobrindo M13 a M16 — incluindo diretórios inteiros de `packages/data`
(`dungeons/`, `materials/`, `economy-rules/`, `summon-blueprints/`, as tabelas de substat) e a
suíte `apps/client/tests/`. O último commit é o de M12.

---

## Ordem sugerida

Este documento não tem mais pendência própria: P0, P1 e P2 estão fechados e o M16 também. O que
resta são decisões de rumo do usuário, registradas em `DECISIONS.md`, seção "Em aberto (levantadas
pelo usuário em 2026-08-28)":

1. **Personagens no lugar de classes, e a árvore de talentos em duas colunas.** A maior mudança
   proposta. Quatro perguntas de design precisam de resposta antes de escrever spec, e a mudança
   sobe `RULES_VERSION` e invalida replays.
2. **A direção de arte.** Se o critério 1 do M16 ("nenhum arquivo de imagem entra no repositório")
   é regra permanente ou vale só até a camada de sprite 2.5D/3D entrar. Alguém vai ler
   "definitivo" no briefing do M16 ao pé da letra numa sessão futura.
3. **Pendências menores, nenhuma bloqueante:** o primeiro turno de IA não é animado; a tela de
   replay não anima; `lifesteal` não tem conteúdo que o conceda; nenhum nó declara `minAwakening`;
   masmorra não tem tela de replay.
