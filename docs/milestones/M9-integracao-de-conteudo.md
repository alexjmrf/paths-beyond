# M9 — Integração de conteúdo (briefing de implementação)

> Escrito pela auditoria de 2026-08-07. Complementa a entrada terse de
> `docs/spec/09-roadmap.md`. **Leia este arquivo inteiro antes de escrever qualquer código.**
> As decisões abaixo já estão tomadas — não reabra nenhuma delas com o usuário sem um motivo
> técnico novo. Se encontrar um, registre em `DECISIONS.md` e siga.

## 1. O problema que este milestone resolve

O projeto tem **três universos de conteúdo paralelos que não se conhecem**:

| Onde | O que é | Quem consome hoje |
|---|---|---|
| `apps/client/src/data/campaign/*.ts` | 580 linhas de conteúdo **hardcoded em TypeScript** (3 mapas, unidades, skills, talentos, itens de demonstração) | só o cliente |
| `packages/data/**/*.json` | 64 JSONs reais, validados por Zod, balanceados em M8 | só `tools/balance` |
| `apps/server/src/content/emptyCatalog.ts` | literalmente `{classes:{}, skills:{}, maps:{}}` | só o servidor |

Consequências verificadas:

- O servidor **não consegue rodar uma batalha real**. O comentário no próprio
  `emptyCatalog.ts` admite: *"nenhum mapa/classe/skill real, então nenhuma batalha de verdade
  roda ainda"*. O fuzz de 1000 partidas de M7 passou contra conteúdo sintético montado no
  próprio teste.
- O cliente **viola a regra 4 do `CLAUDE.md`** ("nada de conteúdo hardcoded... vive em
  `packages/data` como JSON validado por Zod"). Foi decisão consciente e aprovada na
  sub-sessão 1 de M6, quando não existia conteúdo real. Hoje existe. A justificativa expirou.
- `grep -rn "fetch(" apps/client/src` retorna **zero** — o cliente nunca falou com o servidor.

**M9 não adiciona mecânica nenhuma.** Transforma três demos isolados em um jogo só.

## 2. O achado que muda o custo do milestone

**O loader já existe em ~90%:** `tools/balance/src/loadContent.ts` (150 linhas, 4 testes
verdes). Ele já carrega classes, skills, itens, sets e `weaponDuelRanges`, e — crucialmente —
**já resolve a fusão `maps.schema.ts` (layout) + `terrains.schema.ts` (terreno) → `GridMap`**,
exatamente o trabalho que `apps/server/src/content/types.ts:15-20` descreve como *"trabalho de
integração novo e sem precedente no projeto"*. O servidor não sabia que o `tools/balance` já
tinha resolvido isso.

M9 é **promoção e distribuição de código que já funciona e já é testado**, não construção do
zero. Trate qualquer reescrita from-scratch do loader como erro de abordagem.

Sintoma correlato a corrigir: a interface `ArenaMap` está duplicada **verbatim** em
`tools/balance/src/loadContent.ts:28` e `apps/server/src/content/types.ts:7`.

## 3. Decisões já tomadas pela auditoria

**D1 — O loader NÃO pode morar em `packages/data`.** Aquele pacote nunca importa
`@paths-beyond/core` (regra desde M1, registrada em `DECISIONS.md`; um erro exatamente desse
tipo foi pego e corrigido na sub-sessão 1 de M6). O loader importa os dois lados. Vai para um
pacote novo, `packages/content` (`@paths-beyond/content`), que depende de `core` **e** de
`data`.

**D2 — O loader é dividido em núcleo isomórfico + adaptadores.** Esta é a decisão de design
central da milestone e sem ela a sub-sessão 3 é impossível:

- `buildCatalog(parsed)` — **puro, sem `node:fs`, roda em browser**. Recebe JSON já parseado e
  devolve `ContentCatalog`. É aqui que mora toda a lógica (indexação por id, fusão
  maps+terrains → `GridMap`, derivação de `baselineReactionSkillIds`).
- `loadCatalogFromDisk(rootDir)` — adaptador Node (`fs` + `Zod.parse`), para servidor,
  `sim-cli` e `tools/balance`.
- Adaptador de browser via `import.meta.glob(..., { eager: true })` do Vite, dentro de
  `apps/client` (sub-sessão 3).

Motivo: **o cliente roda em browser e `node:fs` não existe lá.** Um loader monolítico com `fs`
funciona nas sub-sessões 1 e 2 e morre na 3.

**D3 — Os 3 layouts de campanha do cliente são portados para JSON real, marcados como
provisórios.** Existe só 1 mapa real (`packages/data/maps/map-arena-coliseu.json`) e a
campanha precisa de 3. Alternativas descartadas: (a) autorar 2+ mapas de verdade dentro do M9
— é trabalho de *conteúdo* dentro de um milestone de *integração*, exatamente o que a regra
"um milestone por sessão" existe para impedir; (b) rodar a mesma arena 3 vezes — mata o
critério de aceite de M6 (campanha jogável ponta a ponta) durante a migração. Portar preserva
a campanha viva sem fingir que é design de fase. Autoria de mapa de verdade é **M12**, e
depende de M11 (sem condições de vitória além de `rout`, todo mapa autorado seria "mate todo
mundo"). Marque os arquivos portados com um campo/comentário deixando o caráter provisório
explícito.

**D4 — `RULES_VERSION` é bumpado nesta milestone.** Está em `'0.0.0'`, nunca incrementado em 8
milestones, apesar da regra 11 do `CLAUDE.md`. O servidor usa esse campo para validar replay e
anti-cheat — hoje é uma constante que nunca invalida um replay obsoleto. M9 muda a fonte de
conteúdo de todos os consumidores, então é o momento correto e honesto de exercer a regra pela
primeira vez.

**D5 — O fuzz de 1000 partidas de M7 continua com conteúdo sintético.** É teste de *motor*, e
deve permanecer independente de conteúdo. O teste de conteúdo real entra **ao lado** dele, não
no lugar.

## 4. Parte 0 — Git, antes de qualquer código

`git log` tem **um único commit** (`chore: scaffold M0`) e `git status` tem 93 caminhos
modificados/não rastreados. **Todo o trabalho de M1 a M8 está não-commitado, em `master`, sem
remote.** Oito milestones estão a um `git checkout .` acidental de virar pó.

Reconstruir o histórico em ~9 commits, usando `PROGRESS.md` como guia (cada sessão documenta
seus arquivos), via `git add` seletivo por caminho:

`m1` (math, rng, stats, schemas) → `m2` (duel, tactics) → `m3` (grid, battle) → `m4` (items) →
`m5` (talents) → `m6` (apps/client) → `m7` (apps/server, hero/) → `m8` (tools/balance,
conteúdo de packages/data) → `chore` (docs).

Nada é deletado em nenhum momento; se as fronteiras ficarem ruins, refaz. Mostre
`git log --stat` ao usuário. **Não crie remote nem faça push sem instrução explícita dele.**

## 5. Sub-sessões

### Sub-sessão 1 — `packages/content`, o loader único

Criar `packages/content` conforme D1/D2. Mover a lógica de `tools/balance/src/loadContent.ts`
para lá e generalizar:

- `maps` vira `Record<Id, ArenaMap>` (hoje `loadFirstValid` devolve exatamente um mapa).
- Derivar `baselineReactionSkillIds` a partir do catálogo (ids de Contra-atacar/Defender — hoje
  o servidor recebe a lista pronta; ver `content/types.ts:27-29`).
- `ArenaMap` passa a ter **uma** definição, importada pelos dois consumidores atuais.
- Manter `items` e `comps` no catálogo — `tools/balance` precisa dos dois.

`tools/balance` migra para o pacote novo. Seus 4 testes existentes
(`tools/balance/tests/loadContent.test.ts`) são a rede de regressão: eles devem continuar
passando sem alteração de expectativa.

### Sub-sessão 2 — servidor com catálogo real

Deletar `apps/server/src/content/emptyCatalog.ts`; bootar com `loadCatalogFromDisk()`. Fecha o
único corte consciente registrado em M7. Adicionar teste que roda uma batalha real ponta a
ponta com conteúdo de `packages/data` (ao lado do fuzz, ver D5).

### Sub-sessão 3 — cliente com conteúdo real

Adicionar as dependências `@paths-beyond/data` e `@paths-beyond/content` a
`apps/client/package.json` (hoje o cliente só depende de `core`). Adaptador de browser
conforme D2.

Apagar `apps/client/src/data/campaign/` inteiro. **A ponte já existe e está testada:**
`buildBattleSetupFromHeroes` (`packages/core/src/battle/assemble.ts`, exportada em
`packages/core/src/index.ts:88`) faz `Hero[] → BattleSetup`, encadeando `resolveHeroStatSheet`
(M7 sub-1) e `resolveHeroCombatProfile` (M7 sub-4). Não escreva um caminho novo de resolução.

Bônus automático: as árvores de talento reais (11 nós por classe, já dentro de cada
`packages/data/classes/class-*.json`) substituem as 165 linhas de árvores de demonstração do
cliente.

### Sub-sessão 4 — `sim-cli`, `rulesVersion`, aceite

`sim-cli` passa a poder carregar do catálogo (hoje lê um `BattleSetup` já resolvido). Bump de
`RULES_VERSION` (D4). Atualizar `PROGRESS.md` e `DECISIONS.md`.

## 6. Critério de aceite (o mesmo de `09-roadmap.md`, com o método)

1. **Um loader só.** `apps/client/src/data/campaign/` não existe mais; `grep` não acha
   conteúdo de jogo hardcoded em `apps/`.
2. **`pnpm balance` produz matriz idêntica à de antes da migração.** Gere e guarde o relatório
   **antes** de começar a sub-sessão 1 — sem essa linha de base, o critério é inverificável.
   Prova que a migração preservou comportamento.
3. **Servidor resolve batalha real** com conteúdo de `packages/data`, com teste.
4. **O mesmo `Hero` produz o mesmo hash de `StatSheet` no cliente, no servidor e no
   `sim-cli`.** É o análogo de §3.3 para a camada de conteúdo e a prova de que os três
   universos viraram um.

Como em todo milestone anterior: **cole a saída real dos testes** provando cada critério. Não
afirme que passou sem mostrar.

## 7. Armadilhas conhecidas (já custaram tempo neste projeto)

- **`import.meta.resolve` quebra sob Vitest.** O loader SSR (vite-node) não o implementa;
  funciona via `tsx` e falha em `pnpm test`. `loadContent.ts:60-65` já documenta e contorna com
  caminho relativo ao arquivo. Mantenha o contorno.
- **Espaço no caminho do repo ("Paths Beyond").** Já quebrou `validate.ts` duas vezes (M1). Use
  `fileURLToPath`, nunca `new URL(...).pathname`.
- **Tipos Zod-inferidos ≠ tipos escritos à mão no core** em dois pontos: a variante recursiva
  `not` de `Condition`, e `enhance` (`0..15` no schema vs. os 6 marcos literais de
  `EnhanceLevel`). `loadContent.ts:98-102` e `:113-117` já resolvem com cast documentado após
  o `parse` real. Reaproveite a solução, não redescubra o problema.
- **`packages/data` não pode importar `@paths-beyond/core`** (D1). Se o typecheck reclamar de
  ciclo, o arquivo está no pacote errado.

## 8. O que NÃO fazer nesta milestone

Nenhuma mecânica nova. Especificamente, **não** ligue `skill.effects` no duelo, **não** aplique
dano de assistência a HP, **não** implemente condições de vitória além de `rout`, **não**
autore mapas ou skills novas, **não** construa tela de PvP nem de replay. Tudo isso está
agendado (M10, M11, M12, M13) e antecipar viola a regra "um milestone por sessão" do
`CLAUDE.md`.

Se durante a integração ficar óbvio que um desses bloqueia o aceite de M9, **pare e registre**
em vez de implementar em silêncio.
