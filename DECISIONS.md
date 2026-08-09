# Decisões

Registro de decisões de design tomadas fora da spec. Uma entrada por decisão.

> Formato: **Data — Decisão — Contexto — Alternativas descartadas — Consequência para a spec**

## Em aberto (da spec, seção 15)

- `MAX_TROCAS = 3` é chute inicial. Testar antes de mexer.
- Limite de 2 AP por duelo: se ninguém chegar perto, reduzir pools em vez de subir o limite.
- Alcance de assistência: começar em 2 tiles. Se disparar em >70% dos duelos, encarecer o custo em PP.
- Duelo ranged unilateral é forte de propósito. Se arqueiros dominarem, reduzir dano — não permitir contra-ataque.
- Permadeath: sugestão de `classic` como padrão.

## Decididas

- **2026-07-31 — `TalentAllocation = Record<TalentNodeId, rank>`** (ausência de chave = rank 0) — Contexto: `Hero.talents` (§4.2) referencia o tipo `TalentAllocation`, mas a spec nunca define seu shape. — Alternativas descartadas: árvores separadas (`{class: Record<Id,rank>, spec: Record<Id,rank>}`) — desnecessário porque `TalentNode.id` já é globalmente único e cada nó já carrega seu próprio `tree`. — Consequência: `packages/data/schemas/heroes.schema.ts` valida `talents` como `Record<string,int>=0`.

- **2026-07-31 — Modificadores de stat (equipamento, imprint, promoção, set) reusam o shape `{ stat: StatKey; flat?: number; pct?: number }` que `TalentEffect{t:'stat'}` já define em §8.2** — Contexto: a tabela de equipamento (§7.1) usa notação informal "atk%" ao lado de stats já percentuais como `chc`; não havia definição formal de como representar "flat de atk" vs "% de atk" fora de talentos. — Alternativas descartadas: `StatKey` própria por variante (`'atk'` vs `'atk%'`) — rejeitada por duplicar a chave do stat sem necessidade, já que o par flat/pct já resolve a ambiguidade. — Consequência: `StatModifier` em `packages/core/src/stats/types.ts` e `statModifierSchema` em `packages/data/schemas/shared.ts` são o único vocabulário de modificador de stat no projeto.

- **2026-07-31 — Passo 7 (bônus de set, §4.1) tratado como delta aditivo sobre o valor corrente, aceitando `flat` e/ou `pct`** — Contexto: a fórmula lista o passo como "+" (soma), mas os sets de §7.4 são descritos como percentuais (ex.: "+35% atk"), o que sugeria multiplicação. — Resolução: `pct` neste passo soma `fpMul(valorCorrente, pct)` — matematicamente equivalente a multiplicar só ali, sem recompor a cadeia inteira nem comprimir com o passo 6. — Consequência: `applySetBonus` em `packages/core/src/stats/aggregate.ts`; testado no snapshot do herói fixo.

- **2026-07-31 — Curva de stat da classe e tabela de imprint são tabelas explícitas por nível/tier no JSON, não fórmulas** — Contexto: §4.1 diz "curva no JSON da classe" mas não especifica o formato. — Motivo: número mágico não pode morar no core (regra 4/CLAUDE.md); uma fórmula geradora ainda seria um número mágico, só que escondido. — Consequência: `classes.schema.ts` exige `statCurve` com exatamente 60 entradas (nível 1..60) e `imprintFlat` com exatamente 6 (imprint 0..5).

- **2026-07-31 — `tacticsScript` (Hero) e `effects`/`trigger` (Skill) ficam como estrutura permissiva não validada em M1** — Contexto: `TacticsScript`, `EffectApplication` e `ReactionTrigger` são definidos em `docs/spec/04-duelo.md`, escopo de M2. — Consequência: `heroes.schema.ts` usa `z.unknown()` e `skills.schema.ts` usa `z.record(z.string(), z.unknown())`; M2 deve substituir por schemas normativos sem quebrar os demais campos.

- **2026-07-31 — `moveType` e `allowedWeapons` (ClassDef) ficam como string livre em M1** — Contexto: valores válidos pertencem a `docs/spec/03-camada-grid.md`, escopo de M3, não lido nesta sessão (regra do projeto: ler só o arquivo relevante ao milestone atual). — Consequência: `classes.schema.ts` valida presença e não-vazio, não a enumeração; M3 deve apertar para um enum real.

- **2026-07-31 — Conteúdo de item se divide em `items/` (ItemInstance, §7.2) e `item-sets/` (bônus de set, §7.4)** — Contexto: a estrutura de pastas em §2.1 só lista `items/`; sets de equipamento são conteúdo estático distinto de uma instância rolada de item e precisavam de schema próprio para o passo 7 da agregação. — Consequência: `packages/data/schemas/items.schema.ts` + `item-sets.schema.ts`, ambos com fixtures em `test-fixtures/`.

- **2026-07-31 — Bug de path corrigido em `validate.ts`: `main()` usava `new URL(...).pathname` (não decodifica `%20`) em vez de `fileURLToPath`** — Contexto: quebrava `pnpm validate:data` neste projeto porque o diretório do repo contém espaço ("Paths Beyond"); nunca foi pego em M0 porque não havia schemas para carregar. Também ajustado `loadContentSchema` para não repassar `%20` ao `import()` dinâmico, porque o SSR loader do Vitest (vite-node) não decodifica e falha a resolver o arquivo (Node nativo tolera as duas formas). — Consequência: `pnpm test` e `pnpm validate:data` agora concordam no número de schemas encontrados.

### M2 — Duelo headless

- **2026-07-31 — `sim-cli duel A.json B.json` lê um `DuelParticipant` self-contained (stat sheet já resolvido, pools atuais, scripts, skills conhecidas), não um `Hero` cru** — Decidido com o usuário (pergunta direta, não silenciosa). Contexto: resolver Hero+Class+Item+Talento → stat sheet puxaria geração de equipamento (M4) e árvore de talentos (M5) para dentro de M2. — Consequência: schema novo `packages/data/schemas/duel-participants.schema.ts`; a costura Hero→Duel fica para quando M3-M5 existirem de verdade.

- **2026-07-31 — `acc` (acurácia base) não é stat de personagem: baseline fixo `ACC_BASELINE = 1000` (100%), só desviado por triângulo de arma (±100) e terreno/altura (externo, M3)** — Decidido com o usuário. Contexto: §6.6 usa `acc_atacante` na fórmula de acerto, mas §4.1 (M1, já fechado) não lista nenhum stat de acurácia entre os 13 — só define `eva` como derivado de `spd`. — Consequência: `packages/core/src/duel/accuracy.ts`; M1 não foi alterado.

- **2026-07-31 — `UnitType`/`WeaponType` são enums fechados**: `UnitType = infantry|cavalry|flying|armored|caster` (exatamente os 5 citados no comentário de `targetIsType`, §6.3); `WeaponType = sword|axe|spear|bow|arcane|nature|holy` (dois ciclos de triângulo de §6.8 + `bow` fora dos dois, só com bônus fixo vs `flying`). — Consequência: `packages/core/src/tactics/types.ts` (fonte) + `unitTypeSchema`/`weaponTypeSchema` em `packages/data/schemas/shared.ts` (cópia, mesma razão de `STAT_KEYS` duplicado em M1).

- **2026-07-31 — `EffectDef` é schema novo (`packages/data/schemas/effects.schema.ts`)** — Contexto: `ActiveEffect` (§6.9) só descreve o estado da instância (id/duração/stacks); o payload — o que o efeito FAZ (`statMods` para o passo 8 de §4.1; `damageDealtPct`/`damageTakenReductionPct` para o passo 8 de §6.6) — não tinha lugar. — Consequência: `packages/core/src/duel/types.ts` tem a cópia de tipo; `packages/core/src/duel/effects.ts` reusa `addFlat`/`multiplyByPctSum` de `stats/aggregate.ts` (agora exportadas) em vez de duplicar a lógica de agregação.

- **2026-07-31 — `reactionScript` é 100% explícito por `DuelParticipant`, inclusive Contra-atacar/Defender** — Contexto: §6.4 diz "toda unidade tem" essas duas reações, mas hardcodar isso no core violaria a regra 4 (nada de conteúdo hardcoded fora de `packages/data`). — Consequência: a "universalidade" das duas reações padrão é convenção de autoria de dado (todo fixture de M2 as inclui explicitamente), não comportamento implícito do motor.

- **2026-07-31 — Diferenciação Contra-ataque vs Defender por `skill.multiplier === 0 && skill.flat === 0` (não por `effectId`)** — Contexto: dado o corte de escopo abaixo (skill.effects não é aplicado em M2), não havia como uma reação "Defender" apontar para um `EffectDef` de redução de dano. — Resolução: skill de reação sem dano próprio (`multiplier`/`flat` zerados) é tratada como mitigação e reduz o dano recebido nesta troca em `DEFEND_DAMAGE_REDUCTION_PCT = 400` (-40%, número dado literalmente na prosa de §6.4 para as duas reações padrão — não é balanceamento arbitrário por skill); skill de reação com dano é tratada como contra-ataque, resolvido após o dano recebido, só se o reator sobreviver. — Consequência: `DEFEND_DAMAGE_REDUCTION_PCT` é constante do motor em `resolveDuel.ts`, não dado; reações de mitigação customizadas com % diferente de -40% não são suportadas ainda (precisariam da wiring de `effects[]` cortada abaixo).

- **2026-07-31 — Cortes de escopo explícitos em M2** (documentados para não serem confundidos com esquecimento):
  - `skill.effects` (`EffectApplication[]`) de uma skill escolhida pelo tactics/reaction NÃO é aplicado a `activeEffects` dentro de `resolveDuel` — só efeitos já ativos ao entrar no duelo alimentam `damageDealtPct`/`damageTakenReductionPct`/stat sheet. A máquina (`computeEffectApplicationChance`, `applyActiveEffectsToStats`) existe e está testada isoladamente, pronta para ser ligada.
  - Só o gatilho de reação `onAttacked` é resolvido em `resolveDuel`; `onDamaged`, `onDebuffed` e `onLethal` não são verificados (o parâmetro `trigger` de `selectReaction` já é genérico — extensão é só passar a chamar com outro trigger no ponto certo).
  - `resolveAssists` decide **quem** assiste (testado, inclui o teto de 2); a aplicação do dano/cura da assistência em HP real NÃO está ligada em `resolveDuel` — `ASSIST_DAMAGE_MULTIPLIER` (50%, §6.5.3) existe e está testado isoladamente.
  - Contra-ataques sempre acertam (sem rolagem de acerto própria) — simplificação para não recursar todo o pipeline de acerto numa reação.
  - `alliesAdjacentAtLeast` (Condition) sempre recebe `0` em M2 — contagem real de adjacência é grid, M3.

- **2026-07-31 — Assimetria ranged (§6.1) usa `engagementDistance` como input externo explícito**, não uma distância real de grid — Contexto: a regra compara `duelRange` dos dois lados contra a distância real do engajamento, mas não existe grid em M2. — Consequência: `DuelEngagementContext.engagementDistance` em `packages/core/src/duel/types.ts`; M3 passa a calcular o valor real a partir do mapa.

- **2026-07-31 — Passo 5 da fórmula de dano ("triangulo", §6.6) agrupa os dois ciclos de triângulo + bônus arco-vs-flying + modificador armored numa única multiplicação** — Contexto: §6.8 descreve os três como aspectos de "Triângulo de armas e tipos", nenhum dos três tem passo numerado próprio na lista de 10 passos de §6.6. — Consequência: `combinedTypeDamageMultiplier` em `packages/core/src/duel/triangle.ts`.

- **2026-07-31 — Corrigido `pnpm sim` (estava com stub "não implementado") para `tsx packages/sim-cli/src/cli.ts`, e `parseArgs` passou a ignorar um `"--"` literal isolado no início do argv** — Contexto: `pnpm <script> -- <args>` repassa o `--` literal para CLIs que não são o parser nativo do Node (tsx não o consome como `node -e ... --` faria), então o comando documentado no CLAUDE.md (`pnpm sim -- duel A.json B.json --seed 42`) falhava com "comando desconhecido: --". — Consequência: comando confirmado funcionando de ponta a ponta, hash idêntico em duas execuções separadas do processo.

### M3 — Camada de grid

- **2026-07-31 — `Coord = {x,y}`, `Side = 'player'|'enemy'`** — Contexto: `Coord` é referenciado (`BattleCommand.path`, `Tile`) mas nunca definido; a spec também nunca nomeia formalmente os "dois lados" da lista de iniciativa (§5.3: "todas as unidades, dos dois lados"). — Consequência: `packages/core/src/grid/types.ts` e `packages/core/src/battle/types.ts`.

- **2026-07-31 — `BattleUnit` estende `UnitOnMap` (§4.2) com o perfil de combate já resolvido (stats, weaponType, unitType, duelRange, scripts, skills)** — mesma decisão de M2 (`DuelParticipant` self-contained), pela mesma razão: a resolução Hero+Class+Item+Talento → stat sheet ainda não existe (M4/M5). `UnitOnMap` continua tendo `heroId`, mas nada em M3 resolve a partir dele. — Consequência: `sim-cli battle` consome unidades já prontas para duelo, não Heroes crus.

- **2026-07-31 — `mapSkill` só afeta a própria unidade em M3 (sem alvo em área)** — Contexto: AOE precisaria de um sistema de raio/alcance em tile que não é o foco deste milestone; a spec cita "cura em área, artilharia" mas o critério de aceite ("batalha jogável via comandos") não exige AOE. — Consequência: `applyMapSkill` em `packages/core/src/battle/commands.ts` ignora `EffectApplication` com `target !== 'self'`.

- **2026-07-31 — `useValor` só valida saldo e gasta um custo fixo (`VALOR_COMMAND_COST = 1`); nenhum efeito de `data/valor-skills/*.json` é aplicado** — Contexto: o catálogo de valor skills (restaurar AP/PP, invocar reforço, artilharia, buff global) é conteúdo de balanceamento ainda não desenhado; schema estrutural existe (`valor-skills.schema.ts`) mas o motor não resolve `kind`/`payload`. — Consequência: `applyUseValor` em `commands.ts`; qualquer efeito real de Valor fica para quando o catálogo for desenhado.

- **2026-07-31 — Só a condição de vitória `rout` é resolvida pelo motor** (`checkWinCondition`); `seize`, `surviveRounds`, `escort`, `defend` têm schema (`WinCondition` em `battle/types.ts`, `winConditionSchema` em `maps.schema.ts`) mas nenhuma checagem — Contexto: `rout` é suficiente para provar "batalha completa jogável via comandos" (critério de aceite); os outros dependem de conceitos que M3 não cobre (captura de objetivo, unidades escoltadas). — Consequência: um mapa com `winCondition.t !== 'rout'` nunca termina por conta própria via `checkWinCondition`.

- **2026-07-31 — `resolveDuel` (M2) estendido três vezes, sempre de forma aditiva/opcional, para a integração com o grid:** `ppLockedForTroca1?: readonly Id[]` (Flanco, §5.5: "defensor não pode gastar PP na primeira troca"); `DuelEngagementContext.defenderEvasionModifier` (terreno `evaBonus` + penalidade de Cerco, sem equivalente em M2); `DuelResult.finalApAttacker/finalPpAttacker/finalApDefender/finalPpDefender` (M2 só devolvia HP final — a batalha precisa persistir o AP/PP gasto de volta no `BattleUnit`, já que são pools de batalha inteira). — Consequência: nenhum teste de M2 mudou de comportamento (testado); `resolveDuel.test.ts` ganhou um teste explícito provando que omitir `ppLockedForTroca1` é idêntico ao comportamento antigo.

- **2026-07-31 — Vantagem de altura (§5.5) só beneficia quem está mais alto; o lado mais baixo não sofre penalidade nem o mais alto perde bônus se a diferença for zero** — Contexto: a spec diz "diferença de height" sem especificar direção. — Consequência: `computePositionalModifiers` em `packages/core/src/battle/positional.ts` só soma o bônus quando `attackerHeight > defenderHeight`.

- **2026-07-31 — Modificadores de acurácia/evasão do engage (altura, terreno, Cerco) são aplicados ao duelo inteiro, nos dois sentidos da troca, não só do atacante original para o defensor original** — Contexto: `DuelEngagementContext` (M2) é global ao duelo, não por participante/direção; corrigir isso exigiria mais uma extensão de `resolveDuel` para carregar o modificador por ator. — Consequência: quando o defensor original contra-ataca dentro do mesmo duelo, ele também se beneficia levemente do bônus de altura/terreno do atacante — simplificação documentada, não o comportamento mais fiel possível a §5.5.

- **2026-07-31 — `simulate()` não exige que os comandos sigam estritamente a ordem da lista de iniciativa** — Contexto: cada `BattleCommand` já especifica seu próprio `unitId` e é validado independentemente (unidade viva, não agiu, etc.); exigir ordem estrita de submissão adicionaria uma validação extra sem mudar o resultado de uma sequência de comandos já válida. — Consequência: uma UI/IA real vai naturalmente gerar comandos na ordem da lista, mas o motor em si não rejeita uma sequência fora de ordem se cada comando for individualmente válido.

- **2026-07-31 — Efeitos concedidos por `mapSkill` usam `duration: 'battle'` como padrão** — Contexto: `EffectApplication` (§8.3) não declara duração nenhuma — só `effectId`, `target`, `chance`, `stacks`; não há campo normativo pra saber por quantos rounds um efeito de skill deveria durar. — Consequência: `applyMapSkill` em `commands.ts`; quando a spec normatizar um campo de duração em `EffectApplication`, isso deixa de ser hardcoded.

- **2026-07-31 — Só cooldown e duração numérica de efeitos tickam no fim do round; DoT/regeneração (§6.9: "DoT → tick de duração → regeneração → ação") não são aplicados** — Contexto: §5.3 descreve um tick mais simples no fim do round ("cooldowns de mapa decrementam, e efeitos com duração em rounds tickam"), enquanto §6.9 descreve uma ordem por turno de unidade que exigiria `EffectDef` declarar dano de DoT/cura de regen — campos que não existem. — Consequência: `endRound` em `packages/core/src/battle/round.ts` implementa a versão de §5.3; DoT/regen ficam pendentes de um campo normativo em `EffectDef`.

- **2026-07-31 — `sim-cli battle map.json --replay r.json`: `map.json` traz `{rulesVersion, seed, initialState}` e `--replay r.json` traz só `{commands}`** — Contexto: `map.json` (posicional) sozinho não faria sentido como só o terreno estático, já que `Replay.initialState` (§3.3) precisa das unidades também; nenhum schema Zod dedicado existe para esse par (é maior que `maps.schema.ts`, que só cobre terreno). — Consequência: `packages/sim-cli/src/battle.ts`; comando confirmado funcionando de ponta a ponta (`pnpm sim -- battle map.json --replay r.json`).

- **2026-07-31 — Divisão inteira sem operador `/` cru em `battle/`** (regra 2/CLAUDE.md, que proíbe `+,-,*,/` fora dos helpers de `math/fixed.ts` em `duel/`, `stats/` e `battle/`): metade do `moveRange` (`rest`) usa `>> 1`; terço da lista de iniciativa (bônus de PP tardio, §5.3) usa um loop de subtração repetida (`integerDivideBy3`) — Contexto: nenhum dos dois é uma conta de porcentagem fp-scale (são contagens inteiras pequenas), mas a letra da regra não abre exceção. — Consequência: `packages/core/src/battle/commands.ts` e `packages/core/src/battle/simulate.ts`.

### M4 — Equipamento

- **2026-07-31 — Enhance só tem 6 marcos (0/3/6/9/12/15); não existem níveis +1/+2/+4... individuais** — Decidido com o usuário (pergunta direta). Contexto: §7.3 dá comportamento e chance de sucesso só para as 5 transições nomeadas (+0→+3, +3→+6, +6→+9, +9→+12, +12→+15); nenhum outro nível é mencionado. — Consequência: `EnhanceLevel` em `packages/core/src/items/types.ts` é a união literal `0|3|6|9|12|15`; `attemptEnhance` pula um marco inteiro por tentativa, nunca +1.

- **2026-07-31 — `data/items/substat-weights.json` (citado literalmente em §7.3) vira tipo de conteúdo próprio `substat-weights/`, não um arquivo dentro de `items/`; o mesmo para um novo `mainstat-weights/` (não nomeado pela spec)** — Contexto: `validateDataset()` varre `<tipo>/**/*.json` inteiro contra um schema só; um arquivo de pesos dentro de `items/` seria validado (errado) contra `ItemInstance`. Mesmo padrão do split `items/`+`item-sets/` de M1. — Consequência: `packages/data/schemas/substat-weights.schema.ts` e `mainstat-weights.schema.ts`, cada um com sua própria pasta de fixtures.

- **2026-07-31 — As 5 chances de sucesso do enhance são 100% dado, nunca hardcoded** — Contexto: §7.3 só dá 3 dos 5 números (+0→+3: 100%, +9→+12: 65%, +12→+15: 40%); os do meio (+3→+6, +6→+9) não são dados na spec e são número de balanceamento por definição (regra de `dados.md`). — Consequência: `EnhanceRates` é sempre um parâmetro de entrada de `attemptEnhance`, nunca uma constante em `core`; a fixture de teste em `packages/data/test-fixtures/enhance-rates/` usa valores plausíveis (85%/75%) só para exercitar a mecânica, não são a palavra final de balanceamento (isso é `pnpm balance`, M8).

- **2026-07-31 — Faixas de valor de mainstat/substat são fixas por stat, não escalam por `ilvl`** — Contexto: §7.3 menciona "tabela do stat naquele ilvl" mas não dá a tabela nem a curva; escalar por ilvl exigiria inventar uma fórmula. `ilvl` continua armazenado e validado (58-100) em `ItemInstance`, só não influencia o valor sorteado em M4. — Consequência: `generateItem`/`attemptEnhance` ignoram `item.ilvl` ao rolar valores; uma curva real por ilvl é trabalho de balanceamento futuro (M8).

- **2026-07-31 — Pool de substats de um item exclui o stat que já é o mainstat dele** — Contexto: não especificado pela spec, mas evita redundância óbvia (item com `atk` de mainstat e `atk` de substat ao mesmo tempo). — Consequência: `generateItem` filtra `substatWeights` por `stat !== mainstat.stat` antes de sortear.

- **2026-07-31 — Bônus do reforge (§7.3: "bônus fixo garantido em todos os substats") é um % garantido aplicado ao valor atual de cada substat, não um flat somado** — Contexto: "fixo" no texto contrasta com "aleatório" (as rolagens de enhance são aleatórias; o reforge é garantido/determinístico), não necessariamente com "percentual". — Consequência: `SubstatWeightEntry.reforgeBonusPct` (fp-scale) em vez de um valor flat; `applyReforge` usa `fpMul`. Reversível se a leitura "flat" se provar mais correta depois.

- **2026-07-31 — Quando um item já tem 4 substats, qual deles sobe no enhance é escolhido uniformemente ao acaso (não é o de maior nem menor valor)** — Contexto: §7.3 diz só "rola um substat existente para cima", sem critério de escolha. — Consequência: `applySuccessfulEnhance` em `packages/core/src/items/enhance.ts` usa um roll uniforme sobre o índice.

- **2026-07-31 — `resolveSetBonuses` só resolve efeitos `t:'stat'` (viram `StatModifier` pro passo 7 de `aggregateStatSheet`, M1); efeitos `t:'special'` dos sets Duelista/Reserva/Sentinela/Imunidade (§7.4) não são resolvidos** — Contexto: esses efeitos mexem com economia de AP/PP e turno de duelo (contra-atacar de graça, `rest` melhor, assistir de graça), não com o stat sheet — resolvê-los tocaria `resolveDuel`/`commands.ts` de novo, fora do escopo de "geração, enhance, substats, sets, reforge, CP" de M4. — Consequência: o schema (`SetEffect`, M1/M2) já modela `special` com `effectId` opaco, pronto pra um milestone futuro interpretar.

- **2026-07-31 — CP (§7.5) continua usando `fpMul`/`fpDiv` apesar de "nunca usada dentro da simulação"** — Contexto: a regra 2 do CLAUDE.md não abre exceção explícita pra métricas fora de simulação, e não há motivo pra ponto flutuante aqui já que os helpers já existem. — Consequência: `computeCombatPower` em `packages/core/src/items/cp.ts`, testado com cálculo à mão.

- **2026-07-31 — Novo diretório `packages/core/src/items/`** (não dentro de `stats/`, apesar do comentário de §2.1 dizer "`stats/` # agregação de stats, equipamento, talentos") — Contexto: geração/enhance/reforge/sets/CP é bastante coisa pra misturar com a agregação de stat sheet; a divisão em `01-fundacoes-tecnicas.md` é descritiva, não uma lista fechada de pastas. — Consequência: `packages/core/src/items/{types,generate,enhance,reforge,sets,cp}.ts`.

### M5 — Classes e talentos

- **2026-07-31 — Gate de linha: `row N` exige `N-1` pontos já gastos na mesma árvore (fora do próprio nó) antes de permitir alocação** — Contexto: §8.2 diz "row: 1..8; gate por pontos gastos na árvore" sem dar o limiar exato. — Resolução: convenção clássica de árvore de talentos (a seção cita "World of Warcraft" no título), e casa exatamente com "8 pontos / 8 linhas" (row 8 exige os 7 pontos anteriores todos gastos). — Consequência: `validateAllocation` em `packages/core/src/talents/allocate.ts`; fácil de trocar depois se o número certo aparecer.

- **2026-07-31 — Efeitos numéricos de talento (`stat.flat/pct`, `maxAp.n`, `maxPp.n`, `apRefund.n`, `duelApCap.n`, `assistRangeBonus.n`) escalam pelo rank alocado; efeitos não-numéricos (`grantSkill`, `grantReaction`, `passive`, `modifySkill`, `extraTacticsSlot/Condition`) aplicam uma vez, independente do rank** — Contexto: `TalentNode.maxRank` pode ser 1/2/3, mas a spec não diz se rank multiplica o efeito. — Consequência: `resolveTalentEffects` em `packages/core/src/talents/resolve.ts`.

- **2026-07-31 — Orçamento de pontos por árvore é parâmetro externo (`maxPointsPerTree`) validado contra o teto estrutural de 8, não derivado do nível do herói** — Contexto: §8.2 diz "1 ponto por nível a partir do 5, alternando... ~16 pontos no nível 60", mas isso não fecha matematicamente (57 níveis de 5 a 60 dariam bem mais que 16 pontos se fosse literal). Em vez de inventar uma fórmula pra reconciliar o texto, `validateAllocation` só valida contra o teto de 8 dado direto pela spec ("Classe (8 pontos...) e Especialização (8 pontos)"). — Consequência: "quantos pontos este herói já ganhou no nível atual" fica de fora de M5, é responsabilidade de uma camada futura (progressão/UI, M8).

- **2026-07-31 — Promoção usa `hasRequiredItem: boolean` como input externo em vez de checar inventário de verdade** — Contexto: não existe sistema de inventário/item consumível no projeto ainda. — Consequência: `canPromote` em `packages/core/src/talents/promotion.ts` recebe o resultado já resolvido; `promote` troca `classId` e reseta só a árvore de especialização (`resetTree`), mantendo a árvore de classe (§8.2: "compartilhada entre specs").

- **2026-07-31 — `builds.schema.ts` novo e mínimo para "builds compartilháveis"**: `{ id, name, classId, talents }`, sem formato de compartilhamento especial (código compactado/URL) — Contexto: a spec só cita "builds compartilháveis" na lista de escopo de M5 (§09-roadmap.md), sem detalhar formato. — Consequência: uma build é só um registro serializável; compressão/encoding para compartilhar por link fica para quando a UI (M6+) precisar.

- **2026-07-31 — `moveType`/`allowedWeapons` em `classes.schema.ts` apertados de string livre para os enums reais** (`moveTypeSchema`/`weaponTypeSchema`, resolvidos em M3/M2) — Contexto: M1 deixou como string livre porque nenhum dos dois enums existia ainda; ambos existem desde M2 (`WeaponType`) e M3 (`MoveType`), então a limpeza fecha um TODO que eu mesmo deixei registrado no M1. — Consequência: a fixture `classes/valid/soldado.json` tinha `moveType: "infantry"`, que nunca foi um valor válido de `MoveType` (`foot|cavalry|flying|heavy|aquatic`) — corrigido para `"foot"`.

### M6 — Cliente jogável (sub-sessão 1: scaffold + mapa + movimento)

- **2026-07-31 — Conteúdo de campanha (mapa, unidades, terrenos, skills) só existe em fixtures dedicadas (`apps/client/src/data/campaign/`), não é conteúdo real** — Decidido com o usuário (pergunta direta). Contexto: "3 mapas de campanha jogável" é o critério de aceite de M6, mas conteúdo real balanceado é formalmente M8. — Consequência: por ora só o mapa 1 dos 3 existe; os outros dois entram numa sub-sessão futura, e M8 eventualmente substitui tudo isso por conteúdo de verdade.

- **2026-07-31 — Esse conteúdo de campanha foi colocado primeiro em `packages/data/test-fixtures/campaign/`, mas movido para `apps/client/src/data/campaign/` ao perceber que ele importa tipos de `@paths-beyond/core` para checagem de tipo** — Contexto: `packages/data` nunca depende de `@paths-beyond/core` (regra estabelecida desde M1: "core não importa de data, nem vice-versa"); um arquivo em `packages/data` importando `@paths-beyond/core` quebraria essa independência. `apps/client` já depende de `core` naturalmente. — Consequência: erro percebido e corrigido antes de rodar qualquer teste; nenhum código chegou a depender do local errado.

- **M6 é fatiado em sub-sessões dentro do próprio milestone** (decidido com o usuário) — esta sessão cobriu só scaffold (Vite+React+PixiJS v8+Zustand) + renderização de mapa/unidades + movimento interativo. `PROGRESS.md` marca M6 como **em andamento**, não `[x]`, até as fatias restantes (preview de duelo, painel de recursos, editor de táticas, inventário, árvore de talentos, e os outros 2 mapas) serem feitas.

- **`computeReachableTiles` (M3) ganhou um campo `path` (caminho completo do início ao tile)** — Contexto: o comando `move` exige o caminho inteiro (`path: Coord[]`), mas M3 só devolvia `{coord, cost}`; o cliente interativo precisa desse caminho pra montar o comando a partir de um clique no overlay de alcance. — Consequência: rastreamento de predecessor no Dijkstra existente; campo aditivo, nenhum teste de M3 quebrou.

- **`packages/core` ganhou `buildInitialState` (exportada) e `applyCommandAndAdvance` (nova)** — Contexto: `simulate()` (M3) só roda um `Replay` inteiro em lote; um cliente interativo precisa montar o `BattleState` inicial uma vez e aplicar um `BattleCommand` por vez (um clique = um comando), com o mesmo bookkeeping de fim de round/vitória que `simulate` já fazia por iteração. — Consequência: `simulate` foi refatorada por cima de `applyCommandAndAdvance` (mesma lógica, sem duplicação); testado com determinismo antes de qualquer código de UI usar (regra 5/CLAUDE.md).

- **Overlay de ameaça (§11, "requisito duro") usa uma aproximação simples**: para cada inimigo vivo, `moveRange` (via `computeReachableTiles`) + `duelRange` a partir de cada tile alcançável, sem considerar ocupação de OUTROS inimigos ao redor. — Contexto: um cálculo exato precisaria simular o alcance de cada inimigo levando em conta todos os outros simultaneamente, complexidade desproporcional pra esta fatia. — Consequência: pode superestimar levemente a área de ameaça em mapas com muitos inimigos agrupados; refinamento fica para uma fatia de polish.

- **Seed de batalha fixa (`BATTLE_SEED = 42`) hardcoded no cliente** — Contexto: não existe tela de configuração de partida nem sistema de save ainda. — Consequência: toda sessão do cliente joga a mesma sequência de rolagens; seed real por partida é trabalho de uma fatia futura (persistência).

- **Não consegui testar visualmente no browser** — esta sessão roda em background, sem extensão de browser conectada. Validei o que deu pra validar sem um browser real: `tsc --noEmit` limpo, todos os módulos de entrada transformam sem erro no servidor Vite (verificado via `curl` em cada um), e a API do Pixi.js v8.19.0 usada (`Graphics.fill/stroke`, `Text`) confere com as definições de tipo instaladas. Isso **não confirma** renderização nem interação de verdade — falta o usuário abrir `http://localhost:5173` e confirmar.

### M6 — sub-sessão 2: preview de duelo

- **Preview e confirmação usam o MESMO objeto já computado por `applyCommandAndAdvance`, nunca duas chamadas separadas** — Contexto: §11 exige que o preview rode "com a seed real" e mostre o resultado que realmente vai acontecer; embora `applyCommandAndAdvance` já seja determinística (então rodar duas vezes daria o mesmo resultado de qualquer forma), guardar o resultado da primeira chamada e só aplicá-lo no "Confirmar" garante "idêntico" por construção, não por uma segunda rodada que *deveria* coincidir. — Consequência: `previewEngage` no `battleStore.ts` guarda `{nextState, duelResult}`; `confirmEngage` só faz `battleState = duelPreview.nextState`, nunca recalcula. Nenhuma mudança em `packages/core`/`packages/data` foi necessária.

- **Alvo engajável = inimigo dentro do `duelRange` da unidade selecionada, medido pela posição ATUAL (sem contar movimento pendente no mesmo turno)** — Contexto: não especificado pela spec como a UI deveria compor "mover depois engajar" numa única interação. — Consequência: pra engajar depois de mover, o jogador primeiro confirma o movimento (clique no tile) e só depois clica no inimigo agora dentro de alcance — duas interações, não uma só; simplificação razoável pra esta fatia, pode virar um fluxo "mover-e-engajar" combinado depois se for importante.

### M6 — sub-sessão 4: mapas 2/3 + progressão de campanha

- **Sem persistência entre mapas ainda**: o herói do jogador começa cada mapa (inclusive ao reiniciar por derrota) com stats/AP/PP cheios de novo, não carrega o estado do mapa anterior — Contexto: persistência/save é trabalho de uma fatia futura (ou de M8); o critério de aceite de M6 é só "campanha... jogável ponta a ponta", não exige progressão de estado do herói entre mapas. — Consequência: `createPlayerHero(pos)` em `apps/client/src/data/campaign/units.ts` é uma função (não um objeto fixo) chamada de novo a cada `buildMapState`.
- **Mapas 2 e 3 são conteúdo de demonstração novo, não conteúdo real** — mesma decisão já registrada na sub-sessão 1 (aprovada com o usuário): fixtures em `apps/client/src/data/campaign/`, layouts e inimigos inventados só pra exercitar o cliente, sem balanceamento.

### M6 — sub-sessão 5: editor de táticas

- **`Condition{t:'not'}` é editado como um checkbox "NÃO" que envolve a condição interna, não mais uma opção no dropdown de tipo** — Contexto: `Condition` (§6.3) tem 18 variantes, uma das quais é a negação recursiva de outra condition; um dropdown de tipo com `not` como opção exigiria decidir o que preencher dentro dele (uma segunda condition aninhada, editada onde?). — Resolução: `ConditionEditor.tsx` trata `not` fora do dropdown — um checkbox liga/desliga o wrapper `{t:'not', c: inner}` em torno da condition de base escolhida no dropdown (que só lista as 17 variantes restantes, tipadas como `BaseConditionType = Exclude<Condition['t'],'not'>`). — Consequência: `apps/client/src/data/conditionSpecs.ts` (`CONDITION_TYPES`/`CONDITION_LABELS`/`createDefaultCondition`) e `ConditionEditor.tsx`; nenhuma mudança em `packages/core` — `Condition` continua podendo aninhar `not` em qualquer profundidade, a UI só não expõe edição recursiva além de um nível (suficiente pro caso de uso real: negar uma condition simples).

- **"Testar contra manequim" reusa `selectTacticsAction` do core direto, sem nenhuma mudança em `packages/core`** — Contexto: §11 pede um botão de teste configurável (HP/PP/tipo/arma do manequim) contra o script sendo editado. — Resolução: `apps/client/src/logic/testTactics.ts` monta um `ConditionContext` sintético a partir de um `DummyConfig` (HP%, PP, unitType, weaponType, isSelfAttacker, hasPositionalBonus, trocaNumber) e chama `selectTacticsAction` já existente — o "manequim" nunca é uma unidade real de batalha, só um contexto de condição fabricado pra fins de teste na UI. — Consequência: `alliesAdjacentCount` e `battleRound` do manequim ficam fixos (0 e 1) — não configuráveis nesta fatia, já que não são citados no requisito duro de §11 ("HP, tipo, arma, PP").

- **Editor mantém um rascunho local do script (`useState`) e só grava no `battleStore` ao clicar "Salvar"** — Contexto: editar um `TacticsScript` inteiro (até 6 linhas, cada uma com condições e prioridade) em tempo real no store criaria updates parciais inválidos a cada tecla. — Consequência: `updateUnitTacticsScript` no `battleStore.ts` só é chamado uma vez, no `save()`; "Cancelar" descarta o rascunho sem tocar no store.

- **CSS do editor de táticas (`tactics-editor-overlay`, `tactics-line`, `condition-editor`, etc.) ficou faltando em `style.css` na sub-sessão 5** — apareceu só ao revisar `style.css` de ponta a ponta no início da sub-sessão 6, buscando pelas classes usadas em `TacticsEditor.tsx`/`ConditionEditor.tsx` e não encontrando nenhuma. O componente funcionava (confirmado pelo usuário) mas sem estilo algum. — Consequência: CSS adicionado retroativamente nesta sub-sessão, junto com o CSS novo do inventário — nenhuma mudança de comportamento, só aparência.

### M6 — sub-sessão 6: inventário

- **Item entra como delta flat sobre os stats já resolvidos da unidade, não recompondo `aggregateStatSheet` do zero** — Contexto: mesma limitação já registrada em M2/M3/M6-sub1 (`BattleUnit` é self-contained, sem pipeline Hero→Class→Item→Talento); `mainstat`/`substats` de `ItemInstance` são sempre valores flat (nunca %), então `addFlat` (já exportado do core, já reusado por `duel/effects.ts` pro mesmo padrão) é suficiente. — Consequência: `apps/client/src/logic/itemPreview.ts`; equipar/desequipar não recalcula stat base de classe/talento/set — só soma/troca o delta dos itens equipados.

- **"Ganho de dano real" (§11) é um ataque básico (`BASIC_ATTACK_SKILL`, já exportado do core) contra um alvo-manequim neutro fixo** (`def=300`, sem crítico, sem variância — `varianceRoll=1000` neutro —, sem triângulo/posicional) — Contexto: nenhum outro contexto de dano (duelo real, alvo real) faz sentido pra comparar builds fora de combate. — Consequência: número comparável entre antes/depois de equipar, não uma previsão de dano real contra um inimigo específico; mesma natureza do "manequim" já usado no teste do editor de táticas (sub-sessão 5).

- **Comparação ao selecionar um item troca o item do MESMO slot, nunca soma em cima do que já está equipado** — Contexto: sem essa regra, equipar uma segunda arma "empilharia" com a primeira em vez de substituí-la. — Consequência: `previewEquip` filtra `currentlyEquipped` por `item.slot !== candidate.slot` antes de recalcular.

- **Um item só pode estar equipado por uma unidade por vez — `equipItem` remove o item de qualquer outra unidade antes de equipá-lo na nova** — Contexto: não especificado pela spec pra esta fatia, mas evita o estado inconsistente óbvio de dois heróis "vestindo" o mesmo `ItemInstance`. — Consequência: `battleStore.ts`, função `equipItem`.

- **Itens de demonstração (`apps/client/src/data/campaign/items.ts`) e dois `ItemSet` de demonstração** — mesma decisão já registrada na sub-sessão 1 (aprovada com o usuário): conteúdo não-real, só pra exercitar filtro por set/slot/substat e a comparação lado a lado; M8 substitui.

### M6 — sub-sessão 7: árvore de talentos

- **`PositionedTalentNode { node: TalentNode; col: 0|1|2 }` é um tipo só do cliente** — Contexto: `TalentNode` (core, §8.2) não tem nenhuma noção de posição visual (só `row`, que já é semântico — gate de linha); desenhar um "grafo" (requisito duro de §11) precisa de uma coordenada X além do Y implícito de `row`. — Consequência: `apps/client/src/data/campaign/talents.ts` decide a coluna de cada nó (3 colunas fixas); `packages/core` não ganhou nenhum campo novo em `TalentNode` — layout é dado de apresentação, não de regra.
- **Árvores de talento de demonstração (classe + especialização, 8 linhas cada) seguem a mesma decisão já aprovada na sub-sessão 1**: conteúdo não balanceado, só pra exercitar o grafo. Ambas cumprem a exigência de §8.2 ("ao menos 2 nós por árvore DEVEM tocar a economia de AP/PP ou o sistema de assistência"): classe toca `maxAp`/`maxPp`/`assistRangeBonus` (3 nós), especialização toca `duelApCap`/`apRefund` (2 nós).
- **Toda mudança de alocação (+1, -1, reset, carregar código) recomputa a alocação inteira e revalida com `validateAllocation` (core, já existente, sem mudança) antes de aplicar — nunca só checa a regra local do nó tocado** — Contexto: decrementar um nó pode invalidar o gate de linha de outro nó mais alto que dependia daqueles pontos totais da árvore; validar só "não excede maxRank" no nó que mudou não pegaria essa quebra em cascata. — Consequência: `deallocateTalent`/`allocateTalent`/`loadBuildCode` em `battleStore.ts` sempre chamam `validateAllocation` sobre o resultado hipotético completo; se inválido, a ação é rejeitada e `lastTalentReason` mostra o primeiro motivo.
- **"Efeito total da build" (não é requisito duro de §11, mas reusa o mesmo padrão de "ganho real" das sub-sessões de item/tática) mostra o delta de stats agregados de TODOS os nós alocados nas duas árvores, aplicado sobre `unit.stats` via `addFlat`+`multiplyByPctSum`** — mesma limitação de `itemPreview.ts` (sem pipeline Hero→stats completo no cliente): os efeitos não-numéricos (`grantSkill`, `modifySkill`, `passive`, etc.) aparecem só como texto na descrição do nó selecionado, não mudam de fato o comportamento da unidade em batalha nesta fatia — aplicar de verdade exigiria integrar `resolveTalentEffects` em `applyCommandAndAdvance`, fora do escopo desta fatia (o objetivo aqui é a UI da árvore, não recablear o motor de batalha do cliente).
- **"String de build compartilhável" (§11) é local, não um serviço** — `apps/client/src/logic/buildCode.ts` faz só `base64(JSON.stringify({classId, talents}))`/decode; não existe backend (isso é M7+), então "compartilhar" significa colar o texto em outro lugar (chat, etc.), não um link com round-trip de rede. `classId` usa uma constante fixa de demonstração (`DEMO_CLASS_ID`), já que não existe sistema de classe real selecionável no cliente ainda.

### M7 — PvP assíncrono (kickoff)

- **Autenticação de M7 é uma identidade stub (token/UUID de jogador, sem senha/cadastro), não um sistema de login real** — Decidido com o usuário (pergunta direta). Contexto: nenhum arquivo de spec define sistema de conta; §9.4 exige "servidor autoritativo" e "estado de conta recalculado a partir do inventário no banco", que só precisam de uma identidade estável pra localizar o herói do jogador no banco, não de login de verdade. — Consequência: `apps/server` aceita um identificador de jogador simples (cabeçalho/token) como autoritativo pra esta milestone; cadastro/login real fica pra uma fatia futura fora do roadmap explícito de M7.
- **M7 é fatiado em sub-sessões dentro do próprio milestone** (decidido com o usuário) — mesma decisão já tomada em M6, pelo mesmo motivo de tamanho. Ordem proposta: resolver Hero→StatSheet no core; IA de mapa declarativa no core; scaffold do servidor; endpoint de batalha PvP + anti-cheat; matchmaking/ELO; replays; fuzz test de 1000 partidas (critério de aceite raiz).

### M7 — sub-sessão 1: resolução Hero→StatSheet

- **`equipmentPct` é sempre `[]` nesta milestone: itens só têm valor flat, nunca percentual** — Decidido com o usuário (pergunta direta). Contexto: a decisão de M1 (`TalentAllocation`/`StatModifier`, entrada #2 do log) previu equipamento com `flat` e `pct` por causa da notação informal "atk%" em §7.1, mas `ItemInstance` (M4) só implementou um `value` único por mainstat/substat — a distinção nunca foi de fato construída, e nada exercitou o passo 4 de `aggregateStatSheet` com itens reais até agora. — Consequência: `resolveHeroStatSheet` sempre passa `equipmentPct: []`; suportar substat percentual de verdade (ex.: "ATK%") ficaria pra uma fatia futura de M8, expandindo `ItemInstance`/`generate.ts`/`enhance.ts` — não é retrofit deste milestone.
- **`Hero`/`ClassDef` ganham cópias próprias em `packages/core/src/hero/types.ts`**, mesmo padrão de `SkillDef`/`TalentNode`/`ItemInstance` — mirror de `packages/data/schemas/heroes.schema.ts`/`classes.schema.ts` (regra 1: core não importa de `packages/data`). `PromotionRequirement` foi reaproveitado de `talents/promotion.ts` (M5, mesmo shape exato: `{minLevel, itemId?}`) em vez de duplicado — encontrado como colisão de nome ao rodar `pnpm typecheck` pela primeira vez, corrigido antes de qualquer teste rodar.
- **`resolveHeroStatSheet` recebe `equippedItems: ItemInstance[]` já resolvidos, não ids de `hero.equipment`** — Contexto: mesmo padrão já usado por `resolveSetBonuses` (M4), que também recebe a lista pronta; buscar os `ItemInstance` a partir dos ids do banco (Postgres) é responsabilidade de quem chama (o servidor, numa fatia futura de M7), não desta função pura. — Consequência: a função nunca faz I/O nem lookup, só agregação.
- **`talentFlat`/`talentPct` recebem o MESMO array (`resolvedTalents.statMods`), sem filtrar por campo presente** — Contexto: `addFlat` só olha `m.flat`, `multiplyByPctSum` só olha `m.pct`, cada um ignorando o outro campo do mesmo objeto; filtrar em dois arrays separados seria trabalho redundante. Mesmo padrão já usado em `apps/client/src/logic/talentPreview.ts` (M6, sub-sessão 7). — Consequência: nenhuma lógica nova, só reuso direto dos helpers de `stats/aggregate.ts` (M1).

### M7 — sub-sessão 2: IA de mapa declarativa

- **Algoritmo literal dos 5 arquétipos (`aggressive`/`hold-position`/`guard-tile`/`flank`/`support-nearest`) desenhado e aprovado com o usuário antes de codar** — Contexto: §9.1 só nomeia os arquétipos, sem passo a passo (diferente do algoritmo de táticas de duelo, §6.3, que a spec já dá literal). — Resolução, por arquétipo: `aggressive` persegue e engaja o de menor HP% no `duelRange`; `hold-position` nunca emite `move`; `guard-tile` é `aggressive` com o movimento limitado a `GUARD_LEASH_TILES` (constante nova do motor, `= 2`, mesmo padrão de `DEFEND_DAMAGE_REDUCTION_PCT`/`ASSIST_DAMAGE_MULTIPLIER` — não é conteúdo de `packages/data`); `flank` prioriza alvos que já têm aliado adjacente (mesma contagem de Flanco/Cerco de `positional.ts`, M3), tanto pra escolher entre vários já em alcance quanto pra decidir rumo a quem se mover; `support-nearest` prioriza ficar dentro do `assistRange` do aliado mais perto de um inimigo em vez de brigar por conta própria (mas ainda revida se for atacado). — Consequência: `packages/core/src/battle/mapAi.ts`, `decideMapAiCommand({state, unitId, archetype}) → BattleCommand` — decide UM comando por chamada (o chamador repete a chamada pra mesma unidade se o comando devolvido não encerrar o turno, mesmo modelo de um jogador humano clicando).
- **Desempates são sempre por prioridade fixa, nunca aleatórios**: entre unidades candidatas, menor `unitId` (ordem alfabética); entre tiles alcançáveis com a mesma distância ao alvo, menor `y` depois menor `x`. Nenhuma rolagem de RNG entra na decisão — mesmo espírito de rule 6/CLAUDE.md ("nada de IA esperta"), estendido da IA de duelo pra IA de mapa por analogia, já que a spec não distingue os dois quanto a isso.
- **Refinamento feito durante a implementação (não durante o planejamento aprovado)**: a proposta original de `flank` incluía escolher, entre os tiles alcançáveis, um que "já tivesse aliado adjacente ao alvo" como critério de seleção de TILE. Ao implementar, percebi que essa condição não depende do tile candidato — só das posições atuais dos aliados — então vira um critério de PRIORIZAÇÃO DE ALVO (que inimigo perseguir), não de escolha de rota. A versão implementada prioriza o alvo com mais aliados adjacentes (mesmo sem estar em alcance ainda) e usa a mesma rota "mais direta" de `aggressive` até ele — comportamento equivalente ao pretendido, só sem a checagem de tile redundante. Sinalizado aqui porque é uma mudança de design em relação ao que foi aprovado em texto, mesmo não mudando o resultado esperado.
- **IA de mapa decide só `move`/`engage`/`wait` nesta milestone** — `rest`/`mapSkill`/`useValor` não são escolhidos por nenhum arquétipo (corte de escopo). — Consequência: um time de defesa nunca descansa, usa skill de mapa ou gasta Valor sozinho; isso é suficiente pro Modo 1 (Arena Tática) funcionar, mas times de defesa "otimizados" ficariam mais fracos que um jogador humano — aceitável pra uma primeira fatia, candidato a expandir se o balanceamento de M8 mostrar que times de defesa perdem sistematicamente.

### M6 — sub-sessão 8: animação

- **Animação é só apresentação por cima de um estado que o core já calculou — nunca atrasa nem muda o resultado.** Movimento: `MapCanvas.tsx` desenha um "fantasma" (`Graphics` avulso) deslizando tile a tile pelo `path` via `app.ticker`; `moveSelectedUnitTo` (que de fato aplica o `BattleCommand` no core) só é chamado quando a animação termina — mas nada é recalculado nesse meio-tempo, é o mesmo comando que seria aplicado instantaneamente. Preview de duelo: `DuelPreviewPanel.tsx` revela `duelResult.trocas` uma a uma com `setTimeout`; `duelResult` inteiro já existe desde o primeiro render (resultado de `applyCommandAndAdvance`, sub-sessão 2), revelar aos poucos é só filtrar quantas entradas do array já mostrado — nenhuma segunda chamada ao core. — Consequência: nenhuma mudança em `packages/core`/`packages/data`; a distinção entre "quando o core decide o resultado" (na hora do clique) e "quando o jogador termina de ver" (no fim da animação) fica inteiramente no cliente.
- **`instantResultMode` (§11, acessibilidade — "modo resultado instantâneo... essencial pra farm") é uma flag simples no `battleStore`, sem persistência entre sessões** — Contexto: não existe sistema de configurações/preferências do jogador ainda. — Consequência: liga/desliga via checkbox no header; reseta pra `false` a cada reload da página. Persistência de preferências é candidata pra uma fatia futura (mesma categoria de "sem save" já registrada nas sub-sessões 1/4).
- **Botão "Confirmar" do preview de duelo fica desabilitado até a última troca ser revelada** — Contexto: deixar confirmar antes de ver o resultado completo esvaziaria o propósito de revelar aos poucos (o jogador clicaria antes de ler). "Cancelar" continua sempre disponível, mesmo durante a revelação.
- **Enquanto uma animação de movimento está em andamento, novos cliques no mapa são ignorados** (`animatingUnitIdRef.current` guarda contra ações concorrentes) — evita uma segunda animação/comando disparar sobre um `battleState` que a primeira animação ainda não commitou.

### M7 — sub-sessão 3: scaffold do servidor

> **Nota de correção (2026-08-01):** esta seção continha decisões de um scaffold de servidor que nunca chegou a ser escrito em código (não existe `apps/server` no disco; `git stash list` confere vazio, então não é um caso de trabalho perdido) e um bloco de decisões de animação (M6) colado por engano sob este cabeçalho. O bloco de animação foi movido para a seção "M6 — sub-sessão 8" logo acima; as decisões órfãs de servidor (pg cru sem ORM, interface `Repository` em memória + Postgres) foram removidas por não corresponderem a nenhum código real. A sub-sessão 3 de M7 recomeça do zero nesta sessão.

- **2026-08-01 — Acesso a dados via `pg` (node-postgres) cru + migrations SQL escritas à mão, sem ORM** — Decidido com o usuário (pergunta direta), reafirmando a decisão originalmente registrada aqui antes da correção acima. Contexto: nenhuma spec define camada de acesso a dados; mesmo espírito de RNG/ponto fixo escritos à mão no core — zero mágica, SQL visível e auditável em arquivos `.sql`, sem depender de geração de código. — Consequência: `apps/server/migrations/*.sql` + `apps/server/src/migrate.ts`, um runner pequeno que cria `schema_migrations` e aplica migrations pendentes em ordem, cada uma dentro de uma transação.
- **2026-08-01 — Acesso a dados fica atrás de uma interface `Repository`, com implementação em memória (usada nos testes) e implementação real em Postgres (código presente, mas só verificado estruturalmente/`typecheck` nesta sessão)** — Decidido com o usuário (pergunta direta). Contexto: este ambiente não tem Postgres rodando agora (Docker Desktop parado, sem `psql` no PATH) — não dá pra "colar a saída real" de um teste que roda contra infraestrutura que não existe aqui. — Consequência: todo teste automatizado desta fatia (e das próximas que tocarem o servidor) roda contra a implementação em memória via `app.inject()` do Fastify, sem precisar de rede nem de Postgres de verdade; a implementação Postgres real só será exercitada de fato quando o usuário tiver um Postgres disponível (fora desta sessão).
- **2026-08-01 — Plugin de auth precisa de `fp()` (`fastify-plugin`) para o hook `onRequest` valer fora do próprio contexto encapsulado** — Contexto: não é uma decisão de design da spec, é uma peculiaridade do Fastify descoberta ao implementar — cada `fastify.register()` cria um novo contexto encapsulado; um hook adicionado dentro de um plugin só se aplica às rotas registradas dentro *dele mesmo*, nunca a rotas irmãs registradas no escopo pai (`/me`, registrada ao lado de `protectedRoutes.register(authPlugin, ...)`, nunca via auth sem isso). Reproduzido isolado com um script mínimo antes do fix, confirmando que `/health` (rota pública, fora do escopo do plugin de auth) continua não afetada mesmo com `fp()`, porque a encapsulação só se rompe até o escopo pai imediato, não além. — Consequência: `apps/server/src/auth.ts` exporta `authPlugin = fp(authPluginImpl)`; qualquer plugin futuro do servidor que precise decorar/adicionar hook visível às rotas irmãs precisa do mesmo padrão.

### M7 — sub-sessão 4: Hero → perfil de combate completo

Antes de codar o endpoint de batalha PvP, descobri que não existe caminho de `Hero` real até `BattleUnit` — `resolveHeroStatSheet` (sub-sessão 1) só monta o `StatSheet`; `unitType`, `weaponType`, `duelRange`, `assistRange` e `reactionScript` nunca foram modelados em `Hero`/`ClassDef`, só existiam nos formatos self-contained (`DuelParticipant`/`BattleUnit`) usados desde M2/M3. Quatro decisões tomadas com o usuário antes de codar (pergunta direta em cada uma):

- **`unitType` é campo novo, obrigatório, em `ClassDef`** (não em `Hero`) — traço inerente da classe (Cavaleiro=cavalry, Mago=caster), não do herói individual. Consequência: `classes.schema.ts` e `packages/core/src/hero/types.ts` (`ClassDef.unitType: UnitType`); fixtures `cavaleiro.json`/`soldado.json` atualizadas.
- **`weaponType` é campo novo, obrigatório, em `Hero`** (não derivado do item equipado) — `classDef.allowedWeapons` é uma lista (uma classe pode usar vários tipos de arma), mas o duelo precisa de UM só; o herói escolhe explicitamente, mesmo padrão de `tacticsScript` já ser dado direto no Hero. Não validado contra `classDef.allowedWeapons` por este schema (validação cruzada fica pra quem resolve o herói, se algum dia for necessária). Consequência: `heroes.schema.ts` e `Hero.weaponType: WeaponType`; fixture `heroi-teste.json` atualizada.
- **`duelRange` por `WeaponType` é tabela nova em `packages/data`, não constante no motor** — correção sobre uma primeira proposta minha (engine constant) que o usuário apontou contrariar `.claude/rules/dados.md` ("números de balanceamento vivem em packages/data, nunca em código"); a spec deixa o valor ranged como faixa "2-3", não um número literal, o que é balanceamento por definição — diferente de `DEFEND_DAMAGE_REDUCTION_PCT`/`GUARD_LEASH_TILES` (constantes já aceitas no motor porque são valores literais da prosa da spec ou parâmetros estruturais únicos, não uma tabela por enum). Consequência: novo tipo de conteúdo `weapon-duel-ranges` (schema + fixtures), `resolveHeroCombatProfile` recebe `weaponDuelRanges: Record<WeaponType,number>` como parâmetro externo — mesmo padrão já usado por `EnhanceRates` em `attemptEnhance` (M4).
- **`reactionScript` de um Hero real é sintetizado: baseline (ids canônicos passados pelo chamador) + `grantedReactionIds` de `resolveTalentEffects` (M5, sem mudança)** — `Hero` não ganha campo próprio; M2 já tinha decidido que Contra-atacar/Defender são convenção de autoria de dado, não comportamento implícito do motor — esta decisão estende isso: o SERVIDOR (não o core) decide quais ids são "baseline" a partir do seu próprio catálogo de skills, e `resolveHeroCombatProfile` só monta a `ReactionLine[]` (`{enabled:true, conditions:[]}` por id, ignorando ids ausentes do catálogo). Consequência: `ResolveHeroCombatProfileInput.baselineReactionSkillIds: readonly Id[]`.

Implementação: `packages/core/src/hero/combatProfile.ts` (`resolveHeroCombatProfile`) — chama `resolveHeroStatSheet` (M7 sub-sessão 1) por dentro pros stats, monta o resto (unitType/weaponType/duelRange/assistRange/moveType/moveRange/tacticsScript/reactionScript/knownSkills) a partir de `Hero`+`ClassDef`+`resolveTalentEffects`+os inputs externos acima. `assistRange` reusa a categorização física/mágica já existente em `duel/triangle.ts` (`PHYSICAL_CYCLE`/`MAGIC_CYCLE`, agora exportadas) pra decidir melee vs ranged — `MELEE_ASSIST_RANGE = 2` continua como constante do motor (não uma tabela por arma; é o valor único já dado literalmente pela seção de decisões em aberto da spec, §15, cuja alavanca de ajuste citada é o custo em PP, não este número). `knownSkills` junta `duelSkills`+`mapSkills`+`grantedSkillIds`, aplica `skillPatches` de talento, ignora ids ausentes do catálogo (mesmo precedente de `resolveTalentEffects` com nós desconhecidos). 9 testes novos (`packages/core/tests/hero/combatProfile.test.ts`), escritos antes da implementação, cobrindo cada uma das quatro decisões acima. Nenhuma mudança em `resolveHeroStatSheet`/`resolveTalentEffects`/`resolveDuel` — só aditivo.

### M7 — sub-sessão 5: HeroCombatProfile → BattleUnit completo

Continuação direta da sub-sessão 4, sem decisão nova de design (extensão mecânica do que já existia, não levada ao usuário por não ter ambiguidade): faltavam dois pedaços pra fechar de vez o caminho Hero→BattleUnit.

- **`HeroCombatProfile` ganhou `startingAp`/`startingPp`** (`classDef.basePools.ap/pp` + `resolvedTalents.maxApBonus/maxPpBonus`, soma inteira crua — permitida em `hero/` pelo mesmo precedente já usado em `talents/resolve.ts`, que não está na lista restrita de `duel/`/`stats/`/`battle/` de `core-determinismo.md`) — sem isso não havia como saber o AP/PP inicial de um `BattleUnit` real. Nome deliberadamente "starting", não "max": o motor nunca clampa `rest` (`battle/commands.ts` soma sem teto), então "max" sugeriria um comportamento de runtime que não existe.
- **`packages/core/src/battle/assemble.ts` (`buildBattleUnit`)** — última etapa: combina um `HeroCombatProfile` com o que só o chamador sabe (unitId/heroId/side/pos/height) pra produzir um `BattleUnit` completo. `hp` começa cheio (`profile.stats.hp`), `effects`/`cooldowns` vazios, `hasActedThisRound: false` — unidade nova entrando numa batalha nova, sem estado herdado (§5.3, sem persistência de recurso entre batalhas).

7 testes novos no total (2 em `combatProfile.test.ts` pro bônus de talento em AP/PP, mais `battle/assemble.test.ts`, 4 testes — montagem completa, side/pos/height/ids vindo do input e não do profile, determinismo, pureza). `packages/core` agora tem a cadeia inteira Hero→BattleUnit pronta para o servidor consumir.

### M7 — sub-sessão 6: orquestração de IA de mapa (aiArchetype)

Antes de codar o endpoint de batalha, percebi que `decideMapAiCommand` (M7 sub-sessão 2) nunca tinha sido ligado a nenhum loop de batalha — nem em `packages/core`, nem no cliente de M6. Toda fixture/replay até agora sempre trazia o comando de CADA unidade escrito à mão, inclusive "inimiga". Como o defensor da Arena Tática (§9.1) é 100% controlado por IA, o endpoint não tinha como funcionar sem essa peça — e como o cliente só "simula pra animar" enquanto o servidor é quem decide de verdade (§9.1: "divergência = bug crítico"), essa orquestração TINHA que morar em `packages/core`, nunca ser reimplementada por cliente e servidor separadamente. Levei o desenho ao usuário antes de codar (pergunta direta, 1 questão): **automático dentro de `applyCommandAndAdvance`/`simulate`** (opção recomendada, aprovada) em vez de uma função separada que cada chamador precisaria lembrar de invocar no momento certo.

- **`BattleUnit` ganha campo opcional `aiArchetype?: MapAiArchetype`** — ausente (o padrão de toda fixture M2-M6) preserva o comportamento de sempre: comportamento 100% aditivo, nenhum teste existente quebrou. `MapAiArchetype` foi movido de `mapAi.ts` pra `battle/types.ts` (reexportado de `mapAi.ts` por compatibilidade) pra `BattleUnit` poder referenciá-lo sem criar import circular types.ts↔mapAi.ts.
- **`packages/core/src/battle/aiTurn.ts` (`resolveAiTurns`)** — drena, na ordem FIXA de `initiativeOrder` (nunca aleatória — determinismo exige que múltiplas IAs pendentes ao mesmo tempo resolvam sempre na mesma sequência), todo turno de unidade com `aiArchetype` pronta pra agir, chamando `decideMapAiCommand` de novo pra mesma unidade quando o comando não encerra o turno (`move`), até não sobrar nenhuma IA pendente no round atual (devolve controle — é a vez de uma unidade humana) ou a batalha terminar. Cruza fronteira de round livremente quando só resta IA (Modo 2/Coliseu, M8) — o único freio é `isRoundComplete` exigir TODAS as unidades vivas, IA ou não, o que automaticamente segura o avanço enquanto sobrar unidade humana pendente no round.
- **Wiring**: `buildInitialState` e `applyCommandAndAdvance` (`battle/simulate.ts`) passam o estado por `resolveAiTurns` antes de devolver — nenhum chamador (cliente, servidor, `sim-cli`, `tools/balance` futuro) precisa saber que uma unidade é IA.

7 testes novos (`packages/core/tests/battle/aiTurn.test.ts`): unidade de IA fora de alcance já resolve (wait) sozinha em `buildInitialState`; IA engaja e resolve duelo completo sozinha quando o alvo já está em alcance no início; sem nenhuma unidade com `aiArchetype`, comportamento idêntico a antes (regressão); IA não avança pro próximo round sozinha enquanto restar humano pendente no round atual; `resolveAiTurns` para imediatamente se `outcome` já não é `'ongoing'`; determinismo; pureza. Nenhum teste de M2-M6 mudou de comportamento — confirmado rodando a suíte inteira (392 testes, 42 arquivos) sem alteração fora dos novos.

### M7 — sub-sessão 7: endpoint de batalha PvP + anti-cheat

Com o core conseguindo montar `Hero → BattleUnit` e resolver IA sozinha, esta sub-sessão fecha a peça que faltava: o endpoint que roda uma batalha de PvP de verdade, autoritativo, com o servidor nunca confiando em stats vindos do cliente. Duas peças novas de core, mecânicas/sem ambiguidade (não levadas ao usuário):

- **`RULES_VERSION` (novo, `packages/core/src/rulesVersion.ts`)** — constante string simples. Contexto: regra 11/CLAUDE.md exige versionar toda mudança de regra, e §9.4 exige "recusar replays de versão diferente", mas não existia nenhuma fonte única de verdade pra "qual é a versão atual" (`rulesVersion` sempre foi só um campo livre em `Replay`, nunca validado contra nada). Vive em `packages/core`, não em `package.json` (ilegível em runtime no browser) — cliente, `sim-cli` e servidor todos importam a mesma constante.
- **`buildBattleSetupFromHeroes` (novo, `packages/core/src/battle/assemble.ts`)** — compõe `resolveHeroCombatProfile` (sub-sessão 4) + `buildBattleUnit` (sub-sessão 5) pra montar um `BattleSetup` inteiro a partir de uma lista de heróis reais + posições. Mesmo raciocínio de `resolveAiTurns` (sub-sessão 6): fica em `packages/core`, não no servidor, porque o cliente vai precisar do mesmo cabo um dia (hoje ainda usa unidades self-contained, M6) e reimplementar separadamente arriscaria divergência (§9.1: "divergência = bug crítico").

`apps/server` ganhou a persistência e as rotas de verdade:

- **`HeroRepository`/`ArenaDefenseRepository` (novos, mesmo padrão de `PlayerRepository`)** — `StoredHero` guarda `Hero`+`ItemInstance[]` já validados pelos tipos de `@paths-beyond/core`; `ArenaDefense` guarda o time de até 5 heróis do defensor (§9.1) com posição/altura/`aiArchetype` por unidade. Implementação em memória (testes) + Postgres (só `typecheck`, mesma decisão já tomada pra `PlayerRepository` na sub-sessão 3) — decidido por precedente, não repergunta ao usuário. Herói/defesa guardados como JSONB inteiro no Postgres (`heroes.hero`, `heroes.equipped_items`, `arena_defenses.units`), não normalizados em colunas — dado profundamente aninhado (talentos, scripts, substats) sem ganho real em normalizar; a linha em si é só o índice de posse.
- **`ContentCatalog` (novo, `apps/server/src/content/types.ts`)** — classes/skills/sets/mapas/tabela de duelRange por arma, injetado em `buildApp` (mesmo padrão de `repository`). **Corte de escopo explícito**: nenhum loader real a partir de `packages/data` existe ainda — mesclar `maps.schema.ts` (layout) + `terrains.schema.ts` (terreno) num `GridMap` de verdade é integração nova sem precedente no projeto (`sim-cli battle` sempre leu um `BattleSetup` já resolvido, nunca montou um a partir de conteúdo bruto), e `packages/data` não tem conteúdo real pra carregar de qualquer forma (conteúdo é M8). Testes injetam um catálogo construído à mão; o boot real (`src/index.ts`) usa `EMPTY_CATALOG` (novo) até o loader existir — nenhuma batalha real roda em produção ainda, só a infraestrutura.
- **`PUT /me/defense`** (autenticado) — salva a defesa do próprio jogador; rejeita heroId que não pertence ao chamador (403), time fora de 1-5 unidades ou mapId desconhecido (400).
- **`POST /battles`** (autenticado = atacante) — corpo só tem `attackerHeroIds`/`defenderPlayerId`/`commands`/`rulesVersion`, NUNCA stats; anti-cheat: `rulesVersion` != `RULES_VERSION` → 409; heroId do atacante que não pertence a ele → 403; defensor sem defesa configurada → 404. Servidor resolve `HeroRepository`+`ContentCatalog` → `buildBattleSetupFromHeroes` → gera seed com `crypto.randomInt` (não `Math.random` — a proibição da regra 1/CLAUDE.md é escopada a `packages/core`, isto é infraestrutura em `apps/server`) → `simulate()` (o mesmo pacote `core`, §9.1) → devolve `{seed, result}`. `unitId` de cada unidade é o próprio `heroId` (convenção nova, documentada no corpo do teste): previsível pro cliente montar `BattleCommand` sem perguntar ao servidor "qual é meu unitId" antes.
- **Posicionamento do time atacante é um corte de escopo**: mapas não têm pontos de spawn declarados ainda, então o atacante entra pela borda esquerda (`x=0`), uma unidade por linha — suficiente pra provar o endpoint, não uma decisão de level design.
- **`battleRoutes` não chama `authPlugin` de novo** — registrado como filho do MESMO escopo protegido que `/me` já usa em `app.ts`; o hook de `fp(authPlugin)`, uma vez vazado pro escopo pai, já vale automaticamente pra qualquer plugin filho registrado dentro dele (só o vazamento pra CIMA precisa de `fp()`; encapsulação flui pra baixo livremente) — mesmo bug de encapsulação já documentado na sub-sessão 3, desta vez evitado de propósito.

Testes: 6 novos em `packages/core/tests/battle/assemble.test.ts` (montagem completa, determinismo) + `RULES_VERSION` coberta em `index.test.ts`; `apps/server/tests/battles.test.ts` (9 testes novos, via `app.inject()`): `/me/defense` sem auth/com herói alheio/sucesso; `/battles` sem auth, rulesVersion incompatível, herói alheio, defensor sem defesa, e o caminho feliz — atacante forte vs. defensor fraco (hp=1), um `engage` já mata o defensor, prova que o servidor resolveu os stats reais sozinho (o corpo da requisição não carrega nenhum stat). `pnpm test` (404 testes, 43 arquivos — 15 novos), `pnpm typecheck` (5 pacotes, limpo), `pnpm lint` e `pnpm validate:data` (15 schemas) sem alteração.

### M7 — sub-sessão 8: matchmaking/ELO

Última peça do roadmap antes de replays/fuzz test. Nenhuma decisão levada ao usuário — os únicos números "inventados" (K-factor, faixa de busca de ELO, ELO inicial) são defaults clássicos e bem conhecidos do sistema Elo, não escolhas de balanceamento de combate (`dados.md` é sobre conteúdo de simulação em `packages/core`/`packages/data`; matchmaking é infraestrutura de servidor, categoria diferente).

- **`Player.elo` (novo campo, default `DEFAULT_ELO = 1200`)** — ponto de partida clássico do Elo (xadrez). `PlayerRepository` ganhou `getPlayerById`, `updateElo`, `findOpponentsNearElo({excludePlayerId, eloMin, eloMax})`. `findOpponentsNearElo` fica no `PlayerRepository` só com o filtro de ELO — "quem tem defesa configurada" é cruzado depois, na rota, contra `ArenaDefenseRepository`, pra não acoplar os dois repositórios entre si.
- **`apps/server/src/matchmaking/elo.ts` (`computeEloUpdate`)** — fórmula clássica do Elo, `DEFAULT_K_FACTOR = 32` (padrão clássico, não dado pela spec — §9.1 só nomeia "ELO", sem fórmula). Ponto flutuante aceito aqui (`Math.round` no final) — não é `packages/core`, não precisa reproduzir bytes idênticos entre plataformas, é só ajuste de rating.
- **`GET /matchmaking/opponent`** (autenticado) — busca candidatos dentro de `ELO_SEARCH_RANGE = ±200` (constante nova, corte de escopo: sem alargamento progressivo se não achar ninguém — suficiente pra provar o endpoint, não a política de matchmaking final), filtra só quem tem uma `ArenaDefense` configurada, escolhe o mais próximo em ELO com desempate determinístico por `id` (nunca aleatório — mesmo espírito de toda decisão de desempate já tomada em `mapAi.ts`/M7 sub-sessão 2). Devolve `{playerId, displayName, elo, mapId}` — não expõe composição/posições do time de defesa (isso só é resolvido dentro de `POST /battles`, que já teria acesso de qualquer forma).
- **`POST /battles` atualiza ELO automaticamente** quando `result.outcome !== 'ongoing'` (uma batalha que não terminou — comandos insuficientes pro engajamento — não deveria mexer em rating de ninguém). Vencedor ganha, perdedor perde, ambos persistidos via `updateElo`; resposta ganhou o campo `elo: {attacker, defender}` com os valores novos.
- **`matchmakingRoutes` também não chama `authPlugin` de novo** — mesmo raciocínio de `battleRoutes` (sub-sessão 7): registrado como filho do mesmo escopo protegido em `app.ts`, o vazamento de `fp()` já cobre qualquer plugin filho.

Testes: `apps/server/tests/elo.test.ts` (5 testes — elo igual dá K/2 exato calculado à mão, azarão ganha mais, favorito ganha menos, vencedor sempre ganha/perdedor sempre perde, kFactor customizado); `apps/server/tests/matchmaking.test.ts` (7 testes — sem auth, sem candidatos, candidato sem defesa, candidato fora da faixa, encontra oponente válido, nunca escolhe o próprio chamador, desempate por ELO mais próximo entre vários candidatos); `battles.test.ts` ganhou 1 teste novo (ELO atualiza após conclusão, e `/me` reflete o novo valor). `pnpm test` (417 testes, 45 arquivos — 13 novos), `pnpm typecheck` (5 pacotes, limpo), `pnpm lint` e `pnpm validate:data` (15 schemas) sem alteração.

### M7 — sub-sessão 9: replays + anti-replay (nonce) + rate limiting

Fecha os dois últimos cortes de escopo deixados em aberto na sub-sessão 7 (anti-cheat) e o item "replays" do roadmap de M7 — os dois cabem juntos porque compartilham a mesma necessidade: um identificador único por tentativa de batalha. Nenhuma decisão levada ao usuário — os defaults (janela de 60s/10 req, faixa de busca) são infra-config, não conteúdo de simulação.

- **`nonce` dobra como id do replay persistido** — decisão central desta sub-sessão. O cliente gera um `nonce` único por tentativa de batalha (ex.: UUID) e manda em `POST /battles`; o servidor rejeita reenvio do mesmo nonce (409) ANTES de rodar `simulate()` de novo — previne o ataque de replay clássico (reenviar a mesma requisição pra ganhar ELO duas vezes) — e, como o nonce já é único por natureza, ele também serve de chave primária pro `StoredReplay` guardado (`ReplayRepository`, novo, mesmo padrão memória+Postgres-JSONB de `HeroRepository`/`ArenaDefenseRepository`). A constraint `PRIMARY KEY (nonce)` no Postgres é a garantia real contra corrida (a checagem `getByNonce` antes é só uma resposta de erro mais rápida, sem gastar trabalho simulando de novo).
- **`GET /battles/:nonce`** (autenticado) — devolve o replay completo (`initialState`, `commands`, `result`, etc.) só pro atacante ou defensor daquela batalha (403 pra qualquer outro, 404 se o nonce não existe).
- **Rate limiting em memória, não Redis** (`apps/server/src/battle/rateLimit.ts`, `createInMemoryRateLimiter`) — corte de escopo: a stack cita Redis pra M7+, mas nada no projeto usa Redis ainda, e um limitador distribuído só importa quando o servidor escalar horizontalmente, o que não é o caso aqui. Janela deslizante por chave (jogador), default `10 requisições / 60s` — número de infraestrutura, não de balanceamento de combate. Aplicado em `POST /battles`, antes de qualquer outra checagem (429 se excedido).
- **Ordem das checagens em `POST /battles`**: rate limit → nonce (presença + duplicidade) → `rulesVersion` → posse de heróis → defesa do defensor. Rate limit primeiro porque é a checagem mais barata; nonce em segundo porque também é barata e evita gastar trabalho simulando uma requisição que já rodou antes.

Testes escritos antes/junto da implementação: `apps/server/tests/rateLimit.test.ts` (3 testes — permite até o limite, libera quando a janela desliza, chaves independentes, `now` injetável pra não depender de tempo real); `battles.test.ts` ganhou 5 testes novos (nonce ausente → 400, nonce reenviado → 409, rate limit excedido → 429, e o describe novo `GET /battles/:nonce`: 404 pra nonce desconhecido, atacante e defensor conseguem ler o próprio replay). `pnpm test` (425 testes, 46 arquivos — 8 novos), `pnpm typecheck` (5 pacotes, limpo), `pnpm lint` e `pnpm validate:data` (15 schemas) sem alteração.

Com esta fatia, todo o §9.4 (segurança) está coberto exceto o loader real de `ContentCatalog` (cut de escopo já registrado na sub-sessão 7, ainda pendente). Único item restante do roadmap de M7: o fuzz test de 1000 partidas do critério de aceite raiz — comparar `simulate()` rodando no "cliente" (Node local) contra o resultado que o endpoint `POST /battles` devolve, mesma seed, mesmo hash.

### M7 — sub-sessão 10: fuzz test de 1000 partidas (critério de aceite raiz) — MILESTONE COMPLETO

Última peça do roadmap de M7: "resultado do servidor idêntico ao do cliente em 1000 partidas de fuzz; manipulação de stats no cliente é rejeitada" (§09-roadmap.md). Nenhuma decisão levada ao usuário — o desenho decorre diretamente da arquitetura já construída nas 9 sub-sessões anteriores.

- **Como "cliente" e "servidor" são comparados**: como o servidor gera o seed (nunca o cliente, §9.4), o teste não pode pré-computar o resultado antes de chamar o endpoint. Em vez disso: chama `POST /battles` (o "servidor"), busca o replay persistido via `GET /battles/:nonce` (`initialState`+`seed`+`commands`, exatamente o que um cliente real receberia pra animar depois), roda `simulate()` localmente com esses mesmos três campos (o "cliente"), e compara `JSON.stringify` dos dois resultados. Isso não é tautológico — os dois `simulate()` só coincidem se **nada além de `initialState+seed+commands` afeta o resultado**, o que é exatamente a garantia que `packages/core` promete (determinismo, sem estado oculto) e que a arquitetura conta com cliente/servidor SEMPRE importando o mesmo pacote (nunca reimplementando a simulação cada um do seu jeito) pra nunca divergir.
- **1000 iterações reais** (não uma amostra menor) — o número é dado literalmente pelo critério de aceite, não decoração. Variação determinística de time do atacante (1-4 heróis, 4 classes cobrindo os 4 cantos de §6.8: físico/mágico/arco-vs-flying/armored), qual dos 3 defensores (arquétipos de IA diferentes: `hold-position`/`aggressive`/`guard-tile`, alvo perto/longe), e comando por unidade (`engage` ou `wait`, incluindo `engage` fora de alcance — exercita o caminho de comando inválido ignorado). Parâmetros do fuzz gerados por `seedRng`/`nextUint32` do próprio core (não `Math.random`) — não é RNG de regra, mas usar um gerador determinístico garante que uma falha do fuzz seja sempre reproduzível.
- **"Manipulação de stats é rejeitada"**: teste dedicado envia um corpo de requisição com campos forjados fora do contrato da rota (`stats`, `attackerHeroes[].stats`, `forcedResult`, todos com valores absurdos como 999999999) e confirma que o `BattleUnit` do atacante no replay persistido tem exatamente os stats resolvidos por `resolveHeroCombatProfile` a partir do `Hero`/`ClassDef` reais — nunca os valores forjados. Prova concreta, não só estrutural (a asserção anterior em `battles.test.ts`, "cliente nunca envia stats", só olhava as chaves do corpo válido).
- **Performance**: 1000 iterações (2 `app.inject()` cada, mais 1 `simulate()` local) rodam em ~1s — folga enorme pra manter isso em `pnpm test` regular, sem precisar de um script separado tipo `pnpm balance`.

`pnpm test` (427 testes, 47 arquivos — 2 novos, um deles com as 1000 partidas dentro), `pnpm typecheck` (5 pacotes, limpo), `pnpm lint` e `pnpm validate:data` (15 schemas) sem alteração.

**M7 está completo.** Todos os itens do roadmap (§09-roadmap.md): scaffold do servidor, endpoint de batalha PvP + anti-cheat (rulesVersion, posse de herói, nunca confia em stats do cliente), matchmaking/ELO, replays + anti-replay (nonce) + rate limiting, e o fuzz test de 1000 partidas — todos feitos e testados. Cortes de escopo que sobrevivem conscientemente (não são "esquecimento"): loader real de `ContentCatalog` a partir de `packages/data` (sub-sessão 7 — não há conteúdo real pra carregar mesmo, isso é M8), autenticação real (stub por token desde o kickoff), posicionamento de spawn do atacante (borda esquerda, sem pontos de spawn declarados em mapa).

## M8 — Conteúdo e balanceamento

### M8 — sub-sessão 1: `tools/balance`

Kickoff de M8. Antes de codar, perguntei ao usuário por onde fatiar o milestone — duas partes bem diferentes (construir a ferramenta vs. desenhar conteúdo real balanceado). Decidido com o usuário: **só a ferramenta primeiro**, com composições sintéticas (mesmo espírito de test-fixtures já usado desde M1), sem desenhar conteúdo real de jogo ainda — isso evita travar esta fatia em dezenas de decisões de game design que a spec não dá numericamente, e dá uma base testada pra quando o conteúdo real chegar.

- **Composição = Hero+ClassDef reais, resolvidos pela cadeia inteira de M7** (`resolveHeroCombatProfile`+`buildBattleSetupFromHeroes`+`resolveAiTurns`), não um formato self-contained novo tipo `BattleUnit`/`DuelParticipant` (M2/M3). Contexto: M7 já construiu o cabo Hero→BattleUnit; duplicar num formato próprio pra `tools/balance` só pra "ser mais simples agora" desperdiçaria esse trabalho e criaria um segundo caminho de resolução de stats pra manter sincronizado. Consequência: `packages/data/schemas/comps.schema.ts` (novo) embute um `Hero` inteiro por unidade (autocontido, mesmo padrão de `duel-participants.schema.ts`), já que não existe (nem faz sentido existir aqui) um catálogo de heróis por jogador pra este caso de uso.
- **`packages/data/schemas/shared.ts` ganhou `mapAiArchetypeSchema`** — nenhum schema de conteúdo tinha precisado do enum de arquétipo de IA até agora (só M7/servidor usava `MapAiArchetype`, sempre do lado core/apps/server, nunca validado como conteúdo JSON). Necessário porque no Modo 2/Coliseu (que `tools/balance` reusa, §9.2) TODA unidade — não só o time defensor, como em PvP assíncrono — precisa de `aiArchetype`.
- **Composições de teste reusam fixtures já existentes** (`class-soldado`, `class-cavaleiro`, `skill-golpe-basico`, `map-teste`, `terrain-plain`, e a tabela de `weapon-duel-ranges` da sub-sessão 4 de M7) — três comps novas (`comp-infantaria`, `comp-cavalaria`, `comp-mista`) em `packages/data/test-fixtures/comps/valid/`, sem inventar conteúdo de jogo novo (regra de `dados.md`).
- **`tools/balance` roda Modo 2/Coliseu**: os dois lados são 100% IA (`aiArchetype` em toda unidade), então `simulate()` com `commands: []` já resolve a batalha inteira sozinha via `resolveAiTurns` (M7, sub-sessão 6) — nenhum código novo de orquestração de turno precisou ser escrito, só reuso.
- **"+1 AP inicial por herói" pro defensor (§9.5)** aplicado FORA de `packages/core`, como pós-processamento do `BattleSetup` já montado (`{...setup, units: setup.units.map(u => u.side==='enemy' ? {...u, ap: u.ap+1} : u)})`) — mesma categoria de decisão de posicionamento/regra específica de modo de jogo já mantida fora do core em `apps/server/src/battle/routes.ts` (M7).
- **"≥10.000 partidas" (§9.5) interpretado como 10.000 POR PAR ORDENADO de composições**, não 10.000 no total — senão, quanto mais composições existirem no futuro, menos partidas cada pareamento receberia, degradando a significância estatística exatamente quando mais comparações importam. Pares são ORDENADOS (A ataca B ≠ B ataca A) porque a vantagem do atacante em escolher o engajamento é assimétrica por natureza (§9.5).
- **Seeds de batalha geradas por `seedRng`/`nextUint32` do próprio core, não `Math.random`** — não é RNG de regra (a regra continua sendo `rngFor` dentro de `simulate()`), mas usar um gerador determinístico a partir de um `masterSeed` (`--seed`, default 1) torna o relatório de balanceamento inteiro reproduzível de uma rodada pra outra.
- **`import.meta.resolve` não funciona sob o loader SSR do Vitest** (mesma categoria de divergência tsx-vs-vite-node já documentada em `packages/data/validate.ts`, DECISIONS.md M1) — `dataTestFixturesDir()` usa caminho relativo à posição do próprio arquivo dentro do monorepo em vez disso, funcionando nos dois ambientes.
- **Corte de escopo explícito**: `tools/balance` só lê de `packages/data/test-fixtures/` por enquanto, não de um diretório de conteúdo real (que ainda não existe — conteúdo de jogo balanceado é uma sub-sessão futura de M8).

**Rodada real de validação** (`pnpm balance -- --runs 10000`, seguindo o skill `balanceamento`): Cavalaria (baseada em `class-cavaleiro`, tier `spec`/promovida) esmaga Infantaria e Mista (baseadas em `class-soldado`, tier `base`) — 99,9% de winrate global, 83,3% das unidades vencedoras com `spd` acima da mediana — disparando corretamente os dois alertas (§9.5: >65% winrate; §6.7: >60% concentração de `spd`). Confirmado com o usuário que isso é um artefato esperado de comparar classe base vs. já promovida em fixtures sintéticas (não um sinal real de balanceamento) — **nenhum ajuste foi proposto nem aplicado**; a ferramenta em si está provada funcionando corretamente (detectou o desequilíbrio esperado com precisão). Decidido com o usuário: considerar esta sub-sessão encerrada aqui, sem simular o passo 3 do skill (propor ajustes) contra fixtures sintéticas.

Testes: `tools/balance/tests/report.test.ts` (7 testes — agregação de matriz, winrate global somando os dois papéis atacante/defensor, alerta de overpowered >65%, cálculo de mediana par/ímpar, alerta de spd >60%, formatação); `runTournament.test.ts` (6 testes — carregamento de conteúdo real das fixtures, contagem de pares ordenados, determinismo por masterSeed, variação real de seed entre masterSeeds diferentes, stats sempre resolvidos de verdade); `cli.test.ts` (4 testes — parsing de argumentos, execução ponta a ponta). `pnpm test` (446 testes, 50 arquivos — 19 novos), `pnpm typecheck` (6 pacotes, limpo, incluindo `tools/balance` pela primeira vez), `pnpm lint` sem alteração, `pnpm validate:data` (16 schemas, 0 conteúdo real). `pnpm-workspace.yaml`/`vitest.workspace.ts` ganharam `tools/*`; `package.json` raiz: script `balance` real (`tsx tools/balance/src/cli.ts`), substituindo o stub de M0.

### M8 — sub-sessão 2: conteúdo real balanceado

Antes de codar, perguntei ao usuário por onde fatiar o resto do milestone (conteúdo real vs. temporadas de 14 dias vs. loja de arena — três peças independentes do roadmap). Decidido com o usuário: **conteúdo real primeiro**, porque é a única peça que bate o critério de aceite raiz do milestone (winrate/`spd` via `pnpm balance`); temporadas e loja de arena ficam para sub-sessões futuras.

- **Onde conteúdo real vive**: `packages/data/<tipo>/*.json` (plano, sem split `valid`/`invalid`) — não `test-fixtures/`. Isso não foi uma decisão nova, foi uma leitura correta de `validateDataset(rootDir)` (`packages/data/validate.ts`, M0): ele já escaneava `rootDir/<tipo>/**/*.json` desde sempre; só nunca havia conteúdo lá porque nenhuma sub-sessão anterior tinha escopo de desenhar jogo de verdade. `packages/data/tests/validate.test.ts` tinha uma asserção `filesChecked: 0` documentando esse vazio — atualizada para `34` (o conteúdo desta fatia) nesta sub-sessão.
- **Roster: 7 classes base-tier (`tier:'base'`, sem promoção), 1 por `WeaponType`** — Espadachim(sword)/Guerreiro(axe)/Lanceiro(spear) cobrem o ciclo físico completo (§6.8: espada>machado>lança>espada); Arcanista(arcane)/Druida(nature)/Clérigo(holy) cobrem o ciclo mágico; Arqueiro(bow) cobre a assimetria de duelo ranged (§6.1). **Cortes de escopo explícitos, candidatos a sub-sessões futuras de M8**: nenhuma classe `flying`/`armored` (então o bônus de arqueiro contra `flying` e a mitigação diferenciada de `armored`, §6.8, não são exercitados por este roster); nenhuma classe `spec`/`mastery` (sem promoção); itens/sets/enhance/pesos de mainstat-substat (comps rodam com `equipment: null` em todos os slots, mesmo padrão já usado nas composições sintéticas da sub-sessão 1 — não bloqueia o critério de aceite, que é sobre classe/arma, não sobre gear).
- **Gerador de conteúdo (`packages/data/scripts/authorContent.ts`), não JSON digitado à mão**: escrever 60 níveis × 13 stats à mão × 7 classes seria ~5460 números. O gerador aplica uma fórmula linear (mesma exatamente observada nos fixtures de M1 — `class-soldado.json`: hp/atk/def lineares por nível, `spd` em degraus de 5 níveis via `floor(level/5)`) a partir de um `ClassProfile` compacto por classe. O script é ferramenta de autoria (roda uma vez via `tsx`, nunca importado por `packages/core` nem por `apps/*`); o JSON emitido é o conteúdo canônico versionado, validado contra os schemas Zod reais antes de gravar (`classSchema.parse`/`skillSchema.parse`/`compSchema.parse` dentro do próprio script — falha cedo se o gerador tiver um bug).
- **Template de árvore de talentos único, aplicado às 7 classes** (só varia id/números por perfil), desenhado pra bater as regras de §8.2 de forma auditável: 8 linhas, 11 nós — 3 linhas de escolha (rows 1/4/7, nós `exclusiveWith` em par) que mudam o papel do herói de verdade (row 4 é literalmente o exemplo dado pela spec: "contra-atacar custa 0 PP mas perde 1 AP máximo" vs. "ataque de assinatura aplica um debuff"); 2 nós de economia isolados (rows 2/5: `maxPp`/`apRefund`, e as duas opções da row 7 também tocam economia, folgando o mínimo); 2 nós de preenchimento `+2% stat` (rows 3/6) = 2/11 ≈ 18% ≤ 30%. `packages/data/tests/authorContent.test.ts` (49 testes) verifica essas quatro propriedades estruturalmente para as 7 classes, em vez de confiar em revisão visual — teste escrito antes do gerador, provou a estrutura correta já na primeira implementação.
- **Row 4 escolhe entre um `modifySkill` no `skill-contra-atacar` (universal) e um `modifySkill` no golpe especial da própria classe, aplicando `effect-fragilidade`** (debuff `-15% def`, novo) em vez do "sangramento" citado literalmente no exemplo da spec — trocado porque DoT não tickam ainda (corte de M3, §6.9, ainda em aberto: "DoT/regeneração não tickam"); um efeito que não faz nada mecanicamente seria conteúdo real só na aparência. `effect-fragilidade` usa `statMods` (mesmo mecanismo de `effect-furia`, M1), que já é resolvido de verdade por `sumDamageDealtPct`/`sumDamageTakenReductionPct`/agregação de stats.
- **Row 8 (capstone) é `passive` opaco (`passiveId`), não `grantSkill`** — decisão pra evitar acoplar o kit de duelo do herói (que `duelSkills` já cobre diretamente, já que os comps desta fatia usam `talents:{}`, sem pontos alocados) a um nó de talento nunca alocado; segue o mesmo precedente já aceito do `special` de item-set (M4, DECISIONS.md) de deixar um hook opaco sem resolução mecânica.
- **Reações universais (`skill-contra-atacar`/`skill-defender`) e a convenção "Defender" (`multiplier:0 && flat:0`)** foram copiadas literalmente do fixture usado por `apps/server/tests/fuzz.test.ts` (`react-counter`/`react-defend`) — essa checagem por igualdade numérica (não por id) já é como `resolveDuel.ts` decide se uma reação é "Defender" (-40% dano) ou um contra-ataque de verdade; qualquer conteúdo de reação futuro precisa respeitar essa convenção.
- **`tools/balance/src/loadContent.ts` refatorado pra `loadBalanceContent(options?: {rootDir?, layout?: 'flat'|'valid-subdir'})`** em vez de sempre ler `packages/data/test-fixtures/`. Default (`layout:'flat'`, `rootDir` = `packages/data/`) aponta pro conteúdo real desta sub-sessão; `layout:'valid-subdir'` preserva o comportamento original (`<tipo>/valid/*.json`) usado pelos testes de regressão contra `test-fixtures/`. Mesmo padrão de parametrização já usado por `validateDataset(rootDir)` (M0).
- **`runTournament.ts` ganhou `BASELINE_REACTION_SKILL_IDS`** (`['skill-contra-atacar', 'skill-defender']`) em vez de `baselineReactionSkillIds: []` (placeholder da sub-sessão 1) — mesmo padrão de `ContentCatalog.baselineReactionSkillIds` (`apps/server/src/content/types.ts`, M7 sub-sessão 4): quais ids são "baseline" é decisão de quem monta a batalha, não conteúdo validado por schema.
- **Descoberta real ao rodar `pnpm balance` pela primeira vez contra este roster**: com `weaponDuelRanges` diferenciado (`bow`/`arcane`/`nature`/`holy` = 2, melee = 1, mesmos valores do fixture de teste da sub-sessão 1), TODO confronto ranged-vs-melee resolvia 0%/100%, não só uma vantagem — porque em um Coliseu de **1 unidade por comp, sem aliados**, `decideChase` (`battle/mapAi.ts`, M7) faz a unidade se mover e reengajar dentro da MESMA chamada de turno assim que estiver a alcance; combinado com iniciativa por `spd` (as classes ranged/mágicas desta fatia tinham `spd` mais alto), o lado ranged consistentemente inicia o duelo primeiro e a regra de §6.1 ("defensor não age") vira absoluta, não uma vantagem tática — o lado melee nunca tem uma chance real de "fechar distância" porque não há um segundo aliado pra abrir uma janela. **Decisão**: testar essa assimetria de verdade exige comps multi-unidade com assistência real (§6.5), fora do escopo desta fatia (candidato claro pra uma sub-sessão futura de M8). Pra este roster de 1 unidade por comp, `weapon-duel-ranges/tabela-arena.json` usa `1` pra todos os 7 tipos de arma — o torneio mede o triângulo de armas e a distribuição de stats, não a assimetria de alcance.
- **Segunda descoberta, depois de igualar `weaponDuelRanges`**: com `hp`/`atk` diferentes por classe (minha primeira tentativa de roster), pequenas vantagens de stat viravam vitórias quase deterministas — heróis nível 10 sem equipamento têm `def` na casa de 30-80, muito abaixo dos ~1000 onde a fórmula de mitigação de §6.6 é calibrada pra "~50%" (nesses valores baixos a mitigação real fica entre 4% e 8%, quase todo o dano passa), e sem crit (`chc=0` sem equipamento) nem variância de acerto relevante (`acc` fixo, `eva` baixo/negativo nesses `spd`), a maior parte do resultado de cada duelo é decidida quase inteiramente por `hp`/`atk` cru. **Decisão**: igualar `hp`/`atk` (base e por nível) nas 7 classes, deixando `def`/`spd`/`basePools`/`signatureMultiplier` como os diferenciadores reais — mais alinhado com o que a spec já associa a identidade de classe (`spd` em §6.7, AP/PP em §6.2) do que uma vantagem crua de dano/vida. Rebalanceei ainda `def`/`pp` de Lanceiro (78→47 de `def` efetivo no nível 10, `pp` 3→2) e Clérigo (57→42, `pp` 3→2) numa segunda rodada depois de uma primeira tentativa de conteúdo real ainda mostrar os dois como outliers >70% de winrate global.
- **Resultado final, `pnpm balance -- --runs 10000` contra as 7 classes reais**: winrate global por composição entre 42,4% (Guerreiro) e 58,5% (Arqueiro) — nenhuma seção "ACIMA DE 65%" impressa (`tools/balance` só imprime essa seção quando `overpoweredComps.length > 0`); 30,4% das unidades vencedoras com `spd` acima da mediana (limiar de alerta é 60%). **Os dois critérios de aceite raiz de M8 batem.** Confrontos individuais dentro do ciclo físico (Espadachim vs. Guerreiro, Guerreiro vs. Lanceiro, Lanceiro vs. Espadachim) continuam ~99-100% num sentido — isso é o triângulo de armas funcionando como um contador rígido por design (§6.8), não um desequilíbrio; o critério de aceite é sobre winrate GLOBAL agregado, que já soma as duas pontas de cada ciclo.

Testes: `packages/data/tests/authorContent.test.ts` (49 testes, escritos antes do gerador — determinismo/shape de `generateStatCurve`, conformidade estrutural de `generateTalentTree` com §8.2 para as 7 classes, validação Zod de toda classe/skill/comp gerada); `packages/data/tests/validate.test.ts` atualizado (`filesChecked: 0` → `34`); `tools/balance/tests/runTournament.test.ts` reescrito (regressão explícita contra `test-fixtures/` via `layout:'valid-subdir'`, mais o comportamento default agora exercitando as 7 composições reais). `pnpm test` (496 testes, 51 arquivos — 49 novos), `pnpm typecheck` (6 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data` (16 schemas, 34 arquivos — primeira vez com conteúdo real de jogo no projeto). Pendente do restante do roadmap de M8: temporadas de 14 dias, loja de arena; e, como cortes de escopo desta fatia, classes `flying`/`armored`, classes `spec`/`mastery` promovidas, itens/sets reais, e teste real da assimetria de duelo ranged com comps multi-unidade e assistência.

### M8 — sub-sessão 3: itens e sets reais, equipados de verdade no torneio

Continuação direta da sub-sessão 2 — antes de codar, perguntei ao usuário por onde fatiar o resto do que ficou pendente (mais conteúdo real — itens/sets/classes especiais — vs. assimetria ranged com comps multi-unidade vs. temporadas vs. loja de arena). Decidido com o usuário: itens/sets primeiro. Dentro dessa fatia, escopo apertado pra caber numa sessão: **só itens+sets equipados nas 7 classes já existentes**, deixando classes `flying`/`armored`/promovidas explicitamente fora (candidatos claros pra uma sub-sessão futura — cada um já é grande o bastante pra ser a sua própria fatia).

- **Descoberta real que bloqueava a fatia**: `tools/balance/src/runTournament.ts` sempre passava `equippedItems: []` (placeholder desde a sub-sessão 1) e `itemSets: {}` — mesmo que um comp referenciasse um item de verdade em `hero.equipment`, nada nunca era resolvido contra um catálogo, então equipamento não afetava o torneio de jeito nenhum. Sem essa fatia, "itens reais" não teria efeito nenhum na simulação, só existiria como JSON solto.
- **Itens autorados diretamente como `ItemInstance`, não pela pipeline procedural `generateItem`/`packages/core/src/items/generate.ts`** — decisão mecânica, sem levar ao usuário: usar a pipeline real exigiria `packages/data` passar a depender de `@paths-beyond/core`, uma dependência cruzada nova que nenhum schema/conteúdo de `packages/data` tem hoje (só `tools/balance`, um consumidor externo do dado, depende dos dois — `packages/data` continua só dependendo de `zod`, como desde M1). Pra um punhado de itens fixos, isso seria uma mudança de arquitetura maior do que o conteúdo justifica; itens sem RNG não precisam da pipeline de geração.
- **`ilvl:58` (mínimo do schema) e `rarity:'common'`, com valores de mainstat/substat modestos (+18 atk na arma, não os +300 do fixture de teste de M4)** — decisão levada em conta sozinha ao perceber a inconsistência: os comps desta fatia são heróis nível 10 (mesmo padrão desde a sub-sessão 1), com `atk`~90 sem equipamento; um item "cru" nos valores usados pelos fixtures de teste (`ilvl:85`, `+300 atk`) seria conteúdo de endgame e sobrepujaria o herói inteiro, quebrando por completo a leitura do torneio. `ilvl` 58-100 representa uma faixa ampla de poder; usar o próprio mínimo pra heróis de nível baixo é a leitura mais coerente enquanto não existir uma curva de itemização por nível de personagem (fora do escopo de M8).
- **2 item-sets (`set-forca` +10% atk 2pc, `set-guardiao` +15% def 2pc), cada um com exatamente 2 membros: a arma da própria classe + 1 colar compartilhado por todas as classes do mesmo `tag` (`physical`→Força, `magic`→Guardião)** — decisão de design pra exercitar `resolveSetBonuses` (M4) de verdade sem inventar uma vantagem relativa entre as 7 classes: como toda classe do mesmo `tag` equipa exatamente a mesma arma-própria + o mesmo colar compartilhado, as 7 ganham o bônus de 2 peças igualmente (eleva o piso de todas, não desequilibra entre elas).
- **`tools/balance/src/loadContent.ts` ganhou `items`/`itemSets` em `BalanceContent`**, carregados pelo mesmo padrão `loadValid`/`typeDir` já usado pros outros tipos; `runTournament.ts` ganhou `resolveEquippedItems(hero, content, compId)` (resolve os 6 slots de `hero.equipment` contra o catálogo carregado, lança erro se um id referenciado não existir — mesmo padrão de erro já usado pra `classId` desconhecido) e `itemSets: content.itemSets` substituiu o `{}` hardcoded.
- **Mesmo descompasso de tipo Zod-inferido vs. hand-authored já documentado pra `Condition`** (sub-sessão 1) apareceu de novo: `items.schema.ts` valida `enhance` como `0..15` solto, mas `ItemInstance.enhance` (core) é o literal `EnhanceLevel` de 6 marcos (M4). Mesmo tratamento: cast `as unknown as ItemInstance[]` no ponto de carga, comentado — a validação real já aconteceu no `schema.parse`.
- **Rodada real de validação após equipar item real nas 7 classes** (`pnpm balance -- --runs 10000`): winrate global por composição entre 33,2% (Arcanista) e 60,4% (Arqueiro) — nenhuma composição acima de 65%, seção de alerta não impressa; 26,7% das unidades vencedoras com `spd` acima da mediana (limiar 60%) — **os dois critérios de aceite raiz de M8 continuam batendo** depois de equipamento entrar na conta. Observação sem ação: Arcanista caiu de ~48% (sub-sessão 2, sem itens) pra 33,2% — tem o `def` base mais baixo das 7 classes (30), então o mesmo bônus percentual (+15% `def`, `set-guardiao`) rende um ganho absoluto menor que pras classes mais tanque do mesmo set; ainda dentro da margem do critério de aceite, não exigiu nova rodada de ajuste — candidato a revisitar se uma sub-sessão futura adicionar mais gear ou mais classes.

Testes: `packages/data/tests/authorContent.test.ts` ganhou um describe novo (itens/sets válidos contra os schemas reais, todo comp equipando arma+colar do mesmo set, physical/magic em sets diferentes — 5 testes novos, 54 no total); `packages/data/tests/validate.test.ts` atualizado (`filesChecked: 34` → `45`, +9 itens +2 sets); `tools/balance/tests/loadContent.test.ts` (novo, 4 testes) prova as duas pontas — catálogo de itens/sets carregado de verdade, e equipar os itens reais de um comp de fato aumenta `hp`/`atk` da `BattleUnit` montada via `buildBattleSetupFromHeroes` (não só que os ids resolvem estruturalmente). `pnpm test` (505 testes, 52 arquivos — 9 novos), `pnpm typecheck` (6 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data` (16 schemas, 45 arquivos). Pendente do restante do roadmap de M8: temporadas de 14 dias, loja de arena; cortes de escopo que sobrevivem: classes `flying`/`armored`, classes `spec`/`mastery` promovidas, assimetria de duelo ranged com comps multi-unidade e assistência real.

### M8 — sub-sessão 4: classes flying/armored + promoção

Continuação da sub-sessão 3 — perguntei ao usuário por onde fatiar o que sobrou (mais conteúdo real — flying/armored/promoção — vs. assimetria ranged com comps multi-unidade vs. temporadas vs. loja de arena). Decidido: flying/armored + promoção.

- **Tensão identificada antes de codar, resolvida com o usuário**: promover uma classe é, por design, torná-la mais forte que os pares base-tier (mesmo espírito do `class-cavaleiro`/`class-soldado` de M1) — mas o critério de aceite de 65% winrate global roda contra TODO comp em `packages/data/comps/` indiscriminadamente. Incluir a classe promovida no mesmo torneio reintroduziria o artefato já documentado na sub-sessão 1 (base vs. promovida ~99% winrate, confirmado esperado com o usuário naquela época) — só que agora quebrando um relatório que hoje passa limpo, em vez de ser a primeira leitura isolada. **Decisão confirmada com o usuário**: `generatePromotedClass()` (novo, em `authorContent.ts`) produz `class-mestre-espadachim` (promove de `class-espadachim`, `tier:'spec'`, `promotionRequirement:{minLevel:20, itemId:'item-brasao-mestre-espadachim'}` — sem item de engrenagem real pro `itemId`, mesmo precedente não resolvido de `class-cavaleiro`/M1) como conteúdo real e válido (`pnpm validate:data` valida), mas **sem comp correspondente** em `packages/data/comps/` — fica fora do torneio de `tools/balance` de propósito. Testar de verdade uma tabela promovida-vs-promovida (ou uma versão do relatório que agrupe por tier) fica pra uma sub-sessão futura, quando houver mais de uma classe `spec`.
- **`generateTalentTree(profile, tree)` ganhou o parâmetro `tree` (`'class' | 'spec'`, default `'class'`)** — mesmo template estrutural (8 linhas, 11 nós, as 4 regras de §8.2) reusado pra árvore de Especialização da classe promovida, só trocando a etiqueta; nenhuma duplicação de código.
- **`ClassProfile` ganhou `moveType`/`moveRange`** (antes hardcoded `'foot'`/`4` dentro de `generateClass` pras 7 classes da sub-sessão 2) — precisava variar por classe pra `Grifeiro` (`flying`) e `Couraçado` (`heavy`) fazerem sentido tematicamente. Sem efeito real no torneio desta fatia (`terrain-planicie` custa 1 pra todo `MoveType` exceto `aquatic`), mas fica correto pro dia em que mapa/terreno tiver variação de custo.
- **2 classes novas, `tier:'base'`, hp/atk igualados ao resto do roster** (mesmo raciocínio da sub-sessão 2): `Grifeiro` (`unitType:'flying'`, spear) testa o bônus de arqueiro contra `flying` (+25% dano, §6.8); `Couraçado` (`unitType:'armored'`, axe) testa a mitigação diferenciada de `armored` (-20% físico/+20% mágico) — nenhuma das 7 classes anteriores exercitava essas duas regras.
- **Descoberta real ao rodar `pnpm balance` pela primeira vez com o roster de 9**: `Grifeiro` perdia de forma quase determinística contra quase todo mundo (18,7% de winrate global inicial), mesmo com stats muito próximos dos oponentes. Isolei UM duelo direto via `resolveDuel` (fora do loop de `tools/balance`, script de diagnóstico descartado ao final) pra descartar bug de engine: o duelo isolado, começando cheio de recursos dos dois lados, é bem equilibrado (~455 vs. ~446 de dano total ao longo de 3 trocas, uma vantagem de só ~2% pro defensor). A causa real: comps são 1 unidade sem aliados, então o MESMO PAR reengaja em TODO round até um morrer (Modo 2/Coliseu, §9.2) — uma vantagem por-duelo pequena (aqui, ~2 pontos de DEF) **composta ao longo de rounds repetidos** vira decisão quase determinística, o mesmo mecanismo já documentado na sub-sessão 2 (item 2) pra diferenças de `hp`/`atk`, agora se manifestando via `def`. Resolvido subindo o `defBase`/`defPerLevel` de Grifeiro bem acima do resto do roster (36→56, `defPerLevel` 1→3) — sem essa passiva nenhuma (diferente de `armored`), ele precisava de uma vantagem crua real pra sobreviver ao atrito.
- **Segunda descoberta, `Couraçado` acima de 65% mesmo depois de reduzir `def`**: baixar o `defBase` de `Couraçado` (42→30) não mudou o resultado do torneio **em nada** (números idênticos até o último dígito) — a mitigação real de `def` nesses valores baixos (nível 10, sem equipamento) é de só alguns pontos percentuais (mesma faixa 4-8% já medida na sub-sessão 2), muito menor que o -20% flat de dano físico que a passiva `armored` já aplica por cima, embutida no motor (`armoredDamageMultiplier`, não ajustável por conteúdo). Como 6 das 9 classes do roster são `physical`, `Couraçado` levava a vantagem da passiva contra a maioria dos oponentes independente de `def`. Resolvido reduzindo o **`atk`** de `Couraçado` abaixo do piso igualado do resto do roster (63→45, `atkPerLevel` 3→2) — quebra deliberada da regra "hp/atk iguais" da sub-sessão 2, registrada como exceção justificada: `armored` é uma vantagem "fora do orçamento" de stats (não vem de `hpBase`/`atkBase`/`defBase`), então compensar só com stats dentro do orçamento normal (como `def`) não bastava.
- **Terceira descoberta, `Arqueiro` ficou em 65,9% (só 0,9 ponto acima do limiar) depois das duas mudanças acima**: reduzir o `signatureMultiplier` de Arqueiro (1450→1350) **não mudou o resultado em nada** — mesmo fenômeno da descoberta anterior: a skill de assinatura só é usada 1x a cada 2 rounds de mapa (cooldown), então seu peso no dano total de uma guerra de atrito longa é pequeno comparado ao ataque básico (sempre disponível). O que realmente influenciava era `spd` (88, o mais alto do roster) — não pela evasão (a fórmula `(spd-100)*0,5` nunca passa de 0 pra ninguém no roster, já que nenhuma classe chega a `spd` 100 no nível 10 sem equipamento), mas pela **ordem de iniciativa**: quem age primeiro tende a fechar distância e iniciar o engajamento primeiro na guerra de atrito repetida. Reduzido `spdBase` de Arqueiro (88→80) e `defBase` levemente (33→28) — resultado final: nenhuma composição acima de 65%.
- **Resultado final, `pnpm balance -- --runs 10000` com o roster de 9 classes reais**: winrate global por composição entre 31,2% (Couraçado) e 63,2% (Lanceiro) — nenhuma seção "ACIMA DE 65%" impressa; 16,6% das unidades vencedoras com `spd` acima da mediana (limiar 60%). **Os dois critérios de aceite raiz de M8 continuam batendo** com o roster ampliado. O espalhamento (31-63%) é mais largo que nas sub-sessões 2/3 (que giravam mais perto de 40-60%) — esperado: `armored`/`flying` adicionam mecânicas reais de contra-tipo (o próprio propósito de existirem), então uma dispersão maior entre "quem counter quem" é o comportamento correto, não um sinal de desequilíbrio, desde que nenhuma composição individual estoure o teto de 65%.

Testes: `packages/data/tests/authorContent.test.ts` ganhou dois describes novos (`flying`/`armored`: unitType correto, hp/atk de Grifeiro seguindo o piso igualado, atk de Couraçado abaixo do piso por design; classe promovida: schema válido, `tier:'spec'`, árvore `tree:'spec'`, stats mais fortes que a classe base no mesmo nível, e — a checagem que guarda a decisão central desta fatia — nenhum comp gerado referencia a classe promovida — 19 testes novos, 73 no total); `tools/balance/tests/runTournament.test.ts`/`loadContent.test.ts` atualizados pras contagens novas (9 comps, 11 itens). `pnpm test` (524 testes, 52 arquivos — 19 novos), `pnpm typecheck` (6 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data` (16 schemas, **58 arquivos** — 10 classes [9 base + 1 promovida], 22 skills, 9 comps, 11 itens, 2 sets, mais o conteúdo universal já existente). Pendente do restante do roadmap de M8: temporadas de 14 dias, loja de arena; cortes de escopo que sobrevivem: assimetria de duelo ranged com comps multi-unidade e assistência real (a segunda classe `spec` — pra testar promovida-vs-promovida — também vira candidata natural quando essa fatia futura acontecer).

### M8 — sub-sessão 5: temporadas de 14 dias

Continuação da sub-sessão 4 — perguntei ao usuário por onde fatiar o que sobrou (assimetria ranged com comps multi-unidade vs. temporadas vs. loja de arena). Decidido: temporadas primeiro (infra de `apps/server`, independente do conteúdo balanceado das sub-sessões 2-4).

- **Pergunta levada ao usuário antes de codar, já que §9.1 só diz "ELO, temporadas de 14 dias" sem detalhar o que reseta**: como tratar o ELO de todo jogador na virada de temporada. **Decidido: soft-reset, regride 50% na direção de `DEFAULT_ELO` (1200)** — quem estava em 1600 vai pra 1400, quem estava em 1000 vai pra 1100. Padrão clássico de ladders competitivos (preserva parte do mérito da temporada anterior sem congelar hierarquia pra sempre); as outras duas opções descartadas (reset total, sem reset nenhum) foram apresentadas mas não escolhidas.
- **Sem cron/scheduler** (nenhuma dependência disso existe no projeto, `apps/server/package.json` confirmado sem `node-cron`/similar) — `ensureCurrentSeason` segue o mesmo idioma já estabelecido em `battle/rateLimit.ts` (M7, sub-sessão 9): cálculo puro em função de `now()` (`now?: () => number`, default `Date.now`), checado sob demanda por quem chamar, não um timer de fundo. Rollover é preguiçoso: se a temporada atual (a de maior `seasonNumber`) já expirou (`endsAt <= now`), cria a próxima E faz o soft-reset; se não existe nenhuma temporada ainda, cria a #1 sem resetar nada (não há o que resetar).
- **Corte de escopo explícito**: `POST /battles` e `GET /matchmaking/opponent` não chamam `ensureCurrentSeason` nesta fatia — só a rota nova `GET /season/current` dispara o rollover. Evita tocar rotas já testadas/estáveis (`battles.test.ts`, `matchmaking.test.ts`) só pra ligar o gatilho de temporada; ligar isso a mais pontos de entrada (garantindo que toda mudança de ELO aconteça sempre dentro do contexto de temporada correto) fica pra quando isso importar de verdade — por exemplo, se `POST /battles` rodar exatamente no instante de virada, o ELO seria atualizado pelo `computeEloUpdate` de M7 ANTES do soft-reset da nova temporada rodar, então a atualização "vale" pra temporada errada; corner case aceito nesta fatia, não corrigido.
- **`PlayerRepository` ganhou `listAll()`** (novo método na interface, implementado nas duas variantes memória/Postgres) — o soft-reset precisa enumerar todo jogador, não só um; nenhum outro fluxo do servidor precisava disso até agora.
- **`Season` como uma tabela append-only, sem coluna "temporada atual"** — "a atual" é sempre a de maior `seasonNumber` (`ORDER BY season_number DESC LIMIT 1` no Postgres, `sort` equivalente em memória); nenhuma linha é atualizada depois de criada, só inserida. Migração nova `apps/server/migrations/0005_seasons.sql`.
- **Rota nova `GET /season/current`** (`apps/server/src/season/routes.ts`), registrada no mesmo escopo protegido de `/me`/`battleRoutes`/`matchmakingRoutes` em `app.ts` (mesmo padrão de "vazamento de `fp()`" já documentado — não precisa re-registrar `authPlugin`). `BuildAppDeps` ganhou `seasonRepository` (obrigatório) e `now?` (opcional, propagado até `ensureCurrentSeason` pra testes controlarem o tempo sem fake timers) — os 4 call sites existentes de `buildApp()` em testes (`app.test.ts`, `battles.test.ts`, `fuzz.test.ts`, `matchmaking.test.ts`) precisaram de um `seasonRepository: createMemorySeasonRepository()` a mais, e `index.ts` ganhou `createPostgresSeasonRepository(pool)` no boot real.

Testes: `apps/server/tests/season.test.ts` (novo, 7 testes) — `ensureCurrentSeason`: cria a #1 sem tocar ELO; temporada ainda válida não cria nada; temporada expirada cria a próxima com soft-reset calculado à mão pra 3 jogadores (acima/abaixo/na média); expiração exata (`endsAt === now`) conta como expirada, não como válida (bordas importam: `>` vs. `>=`); `GET /season/current`: 401 sem auth, 200 com auth criando a temporada sob demanda, duas chamadas seguidas dentro da mesma janela são idempotentes (não criam uma segunda temporada). `pnpm test` (531 testes, 53 arquivos — 7 novos), `pnpm typecheck` (6 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data` (16 schemas, 58 arquivos, sem mudança — fatia é infra de servidor, não conteúdo). Pendente do restante do roadmap de M8: loja de arena; cortes de escopo que sobrevivem: assimetria de duelo ranged com comps multi-unidade e assistência real, ligar `ensureCurrentSeason` a `/battles`/matchmaking (corner case de virada-durante-partida documentado acima).

### M8 — sub-sessão 6: loja de arena — MILESTONE COMPLETO (roadmap)

Última peça do roadmap de M8 listado em §09-roadmap.md ("`tools/balance`, matriz de winrate, relatório de distribuição de stats, temporadas, loja de arena") — com esta fatia, as cinco entradas estão feitas. Continuação da sub-sessão 5; só sobravam duas opções (loja de arena vs. assimetria ranged com comps multi-unidade), usuário escolheu loja de arena.

- **§10 só diz "venda gear de set específico e cosméticos — nunca poder bruto"**, sem detalhar economia. Nenhuma pergunta levada ao usuário desta vez (ao contrário do soft-reset de ELO da sub-sessão 5) — as decisões aqui são mecânicas/estruturais, não têm um "número certo" ambíguo pra escolher entre opções concretas.
- **Corte de escopo explícito, registrado antes de codar**: só "gear de set específico" é implementado. "Cosméticos" ficam de fora porque nenhum tipo de conteúdo cosmético existe ainda em `packages/core`/`packages/data` (são puramente visuais — sem stat sheet, sem `GearSlot` — modelar isso do zero é uma decisão de conteúdo maior que cabe numa fatia própria, não um sub-item de "loja"). "Nunca poder bruto" é garantido estruturalmente: a loja só referencia itens que já existem no catálogo normal de `items/` (`arena-shop.schema.ts`, novo, é só `{id, itemId, priceMarks}` — nenhum item exclusivo/mais forte é inventado pra ela).
- **Marcas de arena são moeda de economia de servidor, não conteúdo de `packages/data`** — mesmo tratamento já dado a `DEFAULT_K_FACTOR`/`ELO_SEARCH_RANGE` (M7, sub-sessão 8): `ARENA_MARKS_WIN=10`/`ARENA_MARKS_LOSS=3` hardcoded em `battle/routes.ts` com comentário, não em `packages/data` — a regra de `dados.md` sobre "número de balanceamento vive em dados" é escopada a conteúdo de simulação de combate (`packages/core`), categoria diferente de infraestrutura de servidor.
- **Ganho de marcas ligado a `POST /battles`** (rota já estável, tocada de propósito — diferente da decisão da sub-sessão 5 de NÃO tocar essa rota pro rollover de temporada): sem creditar marcas em batalhas de verdade, a loja não teria de onde vir dinheiro, então ligar isso é o requisito mínimo pra "loja" ser jogável de ponta a ponta. Vencedor ganha mais, perdedor ganha menos por participar (nunca zero — perder não deveria travar o jogador fora da loja); só quando `result.outcome !== 'ongoing'`, mesmo guard já usado pro ELO.
- **`apps/server` ganhou dependência de `@paths-beyond/data`** (primeira vez — antes só `tools/balance` dependia dos dois pacotes) — `shop/catalog.ts` (`loadShopCatalog`) lê `packages/data/arena-shop/` + `packages/data/items/` com o mesmo idioma de `findJsonFiles`+`schema.parse` já usado em `tools/balance/src/loadContent.ts`. Isso resolve, só pra este catálogo específico, o corte maior ainda em aberto desde M7 sub-sessão 7 (`ContentCatalog` de classes/skills/mapas ainda usa `EMPTY_CATALOG` no boot) — a loja é um catálogo bem menor e mais simples, não precisou esperar aquele corte maior ser resolvido primeiro.
- **Compra troca o item do MESMO slot em vez de acumular** (`stored.equippedItems.filter(i => i.slot !== item.slot)` antes de adicionar o novo) — mesma regra de qualquer equipar normal; reforça "nunca poder bruto" (não dá pra empilhar 5 armas na loja pra ganhar 5x o bônus).
- **`HeroRepository` ganhou `updateHero()`** (novo — antes só `createHero`, nenhum fluxo precisava atualizar um herói já salvo) e `PlayerRepository` ganhou `updateArenaMarks()` (mesmo padrão exato de `updateElo`). Migração nova `apps/server/migrations/0006_arena_marks.sql` (`ALTER TABLE players ADD COLUMN arena_marks`).

Testes: `apps/server/tests/shop.test.ts` (novo, 10 testes) — `loadShopCatalog()` contra conteúdo real (ofertas carregam, cada uma resolve um item real, determinismo); `GET /shop/catalog` (401 sem auth, lista ofertas com preço); `POST /shop/purchase` (401, oferta desconhecida → 404, herói alheio → 403, marcas insuficientes → 400, compra bem-sucedida debita marcas e troca o item do slot, comprar um slot diferente não remove o item já equipado noutro slot). `battles.test.ts` ganhou 1 teste (marcas creditadas nos dois lados, vencedor mais que perdedor). `pnpm test` (542 testes, 54 arquivos — 11 novos), `pnpm typecheck` (6 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data` (**17 schemas**, **62 arquivos** — +1 schema `arena-shop`, +4 ofertas reais).

**Com esta fatia, todo o roadmap literal de M8 (§09-roadmap.md) está coberto**: `tools/balance` + matriz de winrate + relatório de distribuição de stats (sub-sessão 1-4, critério de aceite raiz confirmado batendo — nenhuma composição >65%, `spd` concentrado ≤60% — em cada rodada de conteúdo real adicionada), temporadas de 14 dias (sub-sessão 5), loja de arena (esta fatia). Corte de escopo que sobrevive conscientemente (não é esquecimento): assimetria de duelo ranged com comps multi-unidade e assistência real (§6.1/§6.5) nunca testada de verdade — descoberta na sub-sessão 2, contornada deixando `weaponDuelRanges` uniforme em 1 pra todas as armas; testar isso exige times de 2+ heróis com o sistema de assistência (§6.5) real, que os comps de 1 unidade de `tools/balance` não exercitam.

### M8 — sub-sessão 7: determinismo entre runtimes (§3.3) + relatório de balanceamento revisado (recuperada após reinício da máquina)

Esta sessão foi interrompida por um reinício do PC do usuário antes de ser registrada aqui — o trabalho abaixo já estava completo e com todos os testes passando no disco, achado numa auditoria pedida pelo usuário no início da sessão seguinte (`git status`/timestamps de arquivo mostraram um lote de mudanças ~3h48 mais recente que tudo o resto do working tree, incluindo este arquivo e `PROGRESS.md`). Reconstituído e registrado agora; nenhum código novo foi escrito pra fechar esta parte, só a auditoria + a investigação do achado de balanceamento abaixo.

- **Hash canônico entre runtimes** (`packages/core/src/determinism/hash.ts`): fecha um critério de aceite de §01-fundacoes-tecnicas.md §3.3 que nenhuma sessão de M1/M3 tinha implementado ("rodar o mesmo replay... em Node e em browser (headless) comparando o hash"). `canonicalize()` serializa com chaves ordenadas (evita a não-canonicidade de `JSON.stringify`, que segue ordem de inserção) e rejeita float/inteiro-fora-de-faixa-segura no meio do caminho (sinal de que uma regra vazou pra ponto flutuante); `fnv1a32()` usa só bitwise/`Math.imul`, aritmética de inteiro de 32 bits idêntica em qualquer engine.
- **`packages/core/vitest.browser.workspace.ts`** roda `tests/determinism/**` em Chromium, Firefox e WebKit reais via Playwright (não jsdom/happy-dom — os dois rodam dentro do V8 do Node e nunca detectariam divergência real entre engines). Só este diretório roda em browser, de propósito — o resto da suíte não ganha nada com o custo de 3 navegadores. `pnpm test:browser` (raiz) e `pnpm browsers:install` novos; `@vitest/browser`+`playwright` viraram devDependencies de `packages/core`. Confirmado rodando agora: 42/42 testes em 3 engines, hash bate.
- **`tests/determinism/goldenReplay.ts`**: fixture de replay congelado (não é teste) compartilhada entre a execução Node e as três engines de browser — exercita movimento com custo de terreno, ZoC, duelo de duas linhas de script, reação com PP, triângulo de armas, assistência, crítico, variância e debuff. O hash congelado (`GOLDEN_HASH` em `crossRuntime.test.ts`) só deve mudar junto com uma subida de `RULES_VERSION` — mudar silenciosamente é a regressão que este teste existe pra pegar.
- **Relatório de `tools/balance` revisado** (`tools/balance/src/report.ts`): duas adições ao `BalanceReport`, ambas releitura de §9.5 que não foi levada ao usuário antes desta auditoria (decisão de design fora da spec tomada em silêncio na sessão original — registrando agora, tarde, pra não deixar acontecer de novo):
  - **`underpoweredComps`** (piso de 40% de winrate global): §9.5 original só definia teto (>65% = alerta). Uma composição a 31% é tão inviável pra jogar quanto uma a 70% é opressora — ninguém a leva pra arena, o roster efetivo encolhe mesmo sem violar o teto.
  - **`hardCounters`** (par decidido em ≥99,5% ou ≤0,5% das partidas, amostra mínima de 200): confrontos onde o resultado não depende de script tático, posicionamento nem seed — o metajogo vira pedra-papel-tesoura resolvido na tela de seleção, o oposto do "combate automático mas legível" que é pilar do jogo (§00-visao-e-pilares.md).
  - Nenhuma mudança em `cli.ts` foi necessária — ele importa `buildReport`/`formatReport` genericamente, sem desestruturar campos.
- **Achado ao rodar `pnpm balance -- --runs 10000` com o relatório revisado contra o conteúdo real de M8** (rodado nesta auditoria, não na sessão original): 3 composições abaixo do piso de 40% (Arcanista 38,7%, Grifeiro 35,8%, Couraçado 31,2%) e **29 pares de hard counter** — incluindo pares que não tinham nenhuma sobreposição óbvia de bônus de tipo (ex.: Grifeiro↔Lanceiro, mesma arma, sem `flying`/`armored` envolvido no lado perdedor).
- **Root-cause investigado antes de tocar em qualquer número** (regra 10/13: não mudar balanceamento sem rodar+mostrar o relatório, não inventar em silêncio): escrito um diagnóstico descartável (`tools/balance/src/_diagnose.ts`, apagado depois de usado — mesmo padrão já usado na sub-sessão 4) que isola UM duelo com HP cheio dos dois lados (via `buildInitialState`+`applyCommandAndAdvance`, sem reengajamento) pros pares mais extremos do relatório. Resultado: **0 mortes em 500 tentativas, para todo par testado, incluindo os hard counters de 0%/100%** — nenhum duelo isolado (máx. 3 trocas) chega perto de matar um alvo com HP cheio. Isso descarta a hipótese que o próprio texto do relatório sugere ("triângulo, bônus de tipo e assimetria de alcance empilhando na mesma pancada", §6.8) — `combinedTypeDamageMultiplier` no máximo combina DOIS fatores por vez (triângulo ± bônus `armored`; `UnitType` é exclusivo, uma unidade nunca é `flying` E `armored` ao mesmo tempo), teto real de ±32%, insuficiente pra decidir um duelo de 3 trocas sozinho.
- **Causa real confirmada**: `tools/balance` usa comps de 1 unidade sem aliados (Modo 2/Coliseu, §9.2) — nenhum dos dois lados pode se desengajar, então a IA `aggressive` reengaja TODO round até um morrer. Uma vantagem pequena e consistente por troca (o ±10% do triângulo, ou o ±20% de `armored`) nunca decide um duelo sozinha, mas composta em dano acumulado (permanente, sem regeneração de HP) ao longo de dezenas de rounds converge pra vitória quase certa — exatamente o mecanismo já documentado na sub-sessão 4 pra `hp`/`atk`/`def`, agora confirmado também pro eixo triângulo/tipo. **Não é bug de motor.** É a mesma limitação estrutural do método de `tools/balance` (corte de escopo já registrado desde a sub-sessão 2: "assimetria... nunca testada de verdade... comps de 1 unidade não exercitam") aparecendo numa superfície nova.
- **Deixado em aberto de propósito, não corrigido nesta auditoria**: nem os 3 comps abaixo do piso nem os 29 hard counters foram ajustados. Rebalancear stats sem mudar o método de teste só esconderia o sintoma numa direção (compensar `def`/`atk` de novo, como já foi feito 2x pro Grifeiro/Couraçado) sem resolver a causa (comps de 1 unidade sempre vão produzir resultados extremos quando há QUALQUER vantagem de tipo consistente, por menor que seja). Decisão de encaminhamento fica pro usuário: (a) aceitar isso como limitação conhecida do Coliseu de 1 unidade e não usar `underpoweredComps`/`hardCounters` como gate de aceite até `tools/balance` suportar comps multi-unidade, ou (b) investir agora em rebalancear os 3 comps citados. Nenhuma das duas foi escolhida ainda.

`pnpm test` (563 testes, 55 arquivos — 14 novos: 5 em `crossRuntime.test.ts`/`goldenReplay.ts` não contam à parte pois são um arquivo só com múltiplos describes, mais o describe novo de `report.test.ts`), `pnpm test:browser` (42 testes, 3 engines), `pnpm typecheck` (6 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data` (17 schemas, 62 arquivos, sem mudança — fatia não mexeu em conteúdo).

### M8 — sub-sessão 7: resolução da pendência (op. (a) escolhida pelo usuário)

Consultado o usuário sobre o encaminhamento em aberto (opção (a) vs. (b) acima) no início da sessão seguinte, antes de qualquer código. Escolhido **(a): aceitar como limitação conhecida.**

- **`underpoweredComps` e `hardCounters` não são gate de aceite do M8** (nem de nenhum milestone futuro que rode `pnpm balance` contra o Coliseu de 1 unidade). Os únicos critérios de aceite formais de M8 são os dois de §09-roadmap.md: nenhuma composição >65% winrate global; unidades vencedoras não concentram `spd` acima da mediana em >60% dos casos — ambos confirmados batendo com conteúdo real (sub-sessões 2-6). Os dois campos revisados do relatório (sub-sessão 7) continuam sendo impressos — são diagnóstico útil, não regressão — mas não bloqueiam milestone nem viram critério de CI.
- Isso não é uma alegação de que Arcanista/Grifeiro/Couraçado/os 29 pares hard counter estão de fato balanceados para jogo real com aliados — é uma alegação de que o **método atual** (Coliseu de 1 unidade, §9.2) não consegue medir isso de forma significativa, então usá-lo como gate produziria correções de sintoma (a mesma dança de ajustar `def`/`atk` já feita 2x na sub-sessão 4) sem mover a causa raiz.
- **Reaberto explicitamente como corte de escopo permanente**, já registrado desde a sub-sessão 2 e reafirmado aqui: comps multi-unidade com assistência real no Coliseu é o pré-requisito antes de `underpoweredComps`/`hardCounters` poderem virar gate de verdade. Não agendado para nenhuma sessão específica — é trabalho novo de engenharia em `tools/balance`, não ajuste de números, e só deve ser puxado por pedido explícito do usuário (regra do projeto: nada de antecipar milestones/trabalho futuro em silêncio).
- Com esta decisão, **M8 está formalmente completo** — nenhum milestone seguinte existe em `docs/spec/09-roadmap.md` (M8 é o último). O roadmap literal do projeto (M0-M8) está com todo o escopo coberto.

Nenhuma mudança de código nesta sessão — só a decisão e a atualização de `PROGRESS.md`.

### Auditoria 2026-08-07 — roadmap pós-M8 (M9–M14)

Sessão de auditoria, sem código. O roadmap original (M0–M8) terminou; o usuário pediu uma
avaliação do estado real do projeto e a definição do que vem depois, com o papel dividido:
a auditoria **decide**, um agente separado **implementa**.

**Estado verificado (rodado, não lido do `PROGRESS.md`):** `pnpm test` verde — 55 arquivos,
563 testes. 64 JSONs de conteúdo real (10 classes com árvore de 11 nós cada, 22 skills, 11
itens, 2 sets, 1 mapa, 9 comps). Cliente com 11 componentes; servidor com auth, batalha,
matchmaking/ELO, temporadas, loja, rate-limit, anti-replay. **Qualidade não é o problema.**

- **Achado 1 (estrutural, o mais grave) — três universos de conteúdo paralelos.** Cliente
  (`apps/client/src/data/campaign/`, 580 linhas hardcoded em TS), `packages/data` (64 JSONs
  reais, consumidos só por `tools/balance`) e servidor (`EMPTY_CATALOG`, literalmente vazio —
  o servidor não consegue rodar uma batalha real). `grep -rn "fetch(" apps/client/src` → zero:
  o cliente nunca falou com o servidor. Motor pronto, cliente pronto, servidor pronto,
  conteúdo balanceado pronto — e nenhum dos quatro se conhece. → **M9**.
- **Achado 2 — o conteúdo hardcoded do cliente viola a regra 4 do `CLAUDE.md`.** Foi decisão
  aprovada na sub-sessão 1 de M6, quando não havia conteúdo real. Há desde M8. A justificativa
  expirou e ninguém aposentou a decisão. → **M9**.
- **Achado 3 (processo) — um único commit no repositório** (`chore: scaffold M0`), 93 caminhos
  não-commitados, sem remote. M1–M8 inteiros sem ponto de restauração. Não é dívida técnica, é
  ausência de backup. → **Parte 0 do M9**.
- **Achado 4 — `RULES_VERSION` nunca saiu de `'0.0.0'`** em 8 milestones, apesar da regra 11.
  O servidor valida replay/anti-cheat contra esse campo, então hoje ele nunca invalida um
  replay obsoleto. → **M9 (D4)**.
- **Achado 5 — toda skill hoje é só um número de dano.** `skill.effects` não é aplicado dentro
  do duelo (corte de M2), então nenhum buff/debuff/DoT nasce de skill; a assistência decide
  *quem* assiste mas nunca aplica dano/cura a HP, o que torna decorativo o pilar "Unicorn
  Overlord" do design; só o gatilho `onAttacked` existe (sem `onLethal`, não há "last stand");
  efeitos `special` de set — justamente os que mexem em economia de AP/PP — não resolvem. →
  **M10**.
- **Achado 6 — só a condição de vitória `rout` resolve.** `seize`/`surviveRounds`/`escort`/
  `defend` têm schema desde M3 e nenhuma implementação; `useValor` gasta saldo sem aplicar
  efeito; `mapSkill` não tem AOE. Uma campanha de 6–10 mapas (§10) onde todos são "mate todo
  mundo" é a diferença entre Fire Emblem e um boss rush. Esta é a maior alavanca de design de
  fase ausente. → **M11**.
- **Achado 7 — o balanceamento de M8 é mais estreito do que "COMPLETO" sugere.** O critério de
  aceite bateu de verdade, mas `tools/balance` só testa comps de 1 unidade sem aliados, com
  `weaponDuelRanges` uniforme em 1. Logo a matriz validou a **fórmula de dano do duelo**, não o
  jogo: assimetria ranged (§6.1), assistência, modificadores posicionais e lista de iniciativa
  ficaram todos fora. → o upgrade do harness para comps multi-unidade é **pré-requisito dentro
  do M10**, não trabalho opcional: sem ele as mudanças de M10 não são mensuráveis.
- **Achado 8 — requisitos duros de §11 que nenhum milestone cobriu:** tela de replay, modo
  daltônico, fonte escalável, e qualquer superfície de PvP. Some-se a ausência de persistência
  entre mapas e a economia PvE de §10, que o roadmap original nunca teve milestone para. →
  **M13** e **M14**.

**Decisão de ordenação (a mais consequente da auditoria):** integração antes de mecânica,
mecânica antes de conteúdo, conteúdo antes de superfície. Motivo: autorar 40 skills antes de
`skill.effects` existir é autorar 40 números de dano, e autorar 10 mapas antes das condições
de vitória é autorar 10 vezes "mate todo mundo". Superfície de UI vem depois porque o cliente
é reescrito em M9 e tocado de novo em M10/M11 (status effects precisam de ícone, objetivos
precisam de display) — construir tela de PvP antes disso é garantir retrabalho.

**Decisão de método:** cada milestone ganha um briefing detalhado em `docs/milestones/`
escrito **quando ele vira o próximo**, não antes — o escopo de M12–M14 depende do resultado de
M10/M11, e detalhar agora seria inventar. Só `docs/milestones/M9-integracao-de-conteudo.md`
existe nesta sessão. As decisões de implementação de M9 (D1–D5: onde mora o loader, divisão
isomórfico+adaptadores por causa do browser, porte dos 3 layouts de campanha para JSON
provisório, bump de `rulesVersion`, fuzz de M7 permanecendo sintético) estão nesse briefing e
não devem ser reabertas.

**Achado que reduz o custo de M9:** o loader já existe em ~90% (`tools/balance/src/loadContent.ts`,
150 linhas, 4 testes verdes) e já resolve a fusão maps+terrains → `GridMap` que
`apps/server/src/content/types.ts` descreve como "trabalho de integração novo e sem precedente
no projeto". M9 é promoção de código testado, não construção do zero. `ArenaMap` está
duplicado verbatim nos dois arquivos.

Nenhuma mudança de código nesta sessão — só a auditoria, as entradas M9–M14 em
`docs/spec/09-roadmap.md`, o briefing de M9 e a atualização de `PROGRESS.md`.

## M9 — Integração de conteúdo

### M9 — sub-sessão 1: `packages/content` (o loader)

- **Reconstrução de histórico git (Parte 0) tratada como trabalho desta sessão, não como
  decisão de design** — segue literalmente o agrupamento por milestone já prescrito no
  briefing (`m1`..`m8` + `chore`). Único desvio: um commit extra de correção
  (`packages/core/src/battle/aiTurn.ts` — resolveAiTurns, M7 sub-sessão 6 — tinha ficado
  de fora do commit de M7 porque só foi notado depois; corrigido com um commit pequeno
  rotulado M7 antes do commit de M8, em vez de misturado no lugar errado). Arquivos
  "plumbing" que evoluem em cima de vários milestones (`package.json`/
  `pnpm-workspace.yaml`/`vitest.workspace.ts` da raiz) ganharam versões intermediárias
  escritas à mão por commit, pra cada estado do histórico bater com o que o projeto
  realmente tinha naquele milestone (ex.: `pnpm balance` só vira real no commit de M8,
  não antes). Arquivos com evolução mais entrelaçada (`packages/core/src/index.ts`,
  `packages/core/package.json`, `pnpm-lock.yaml`) foram commitados inteiros no milestone
  que mais claramente os fechou — não dá pra separar hunks sem `git add -p` interativo,
  que a ferramenta de shell não-interativa não suporta; o próprio briefing autoriza essa
  imprecisão ("se as fronteiras ficarem ruins, refaz").
- **`baselineReactionSkillIds` é derivado como "toda skill `kind:'reaction'` do
  catálogo"** (`packages/content/src/buildCatalog.ts`, `deriveBaselineReactionSkillIds`).
  D2 do briefing pedia pra mover a derivação pro catálogo, mas não dava a regra — decisão
  desta sub-sessão. Motivo: hoje só existem duas skills `kind:'reaction'` no conteúdo real
  (`skill-contra-atacar`/`skill-defender`, M8 sub-sessão 2) e as duas já eram, por
  convenção de autoria, pensadas como baseline (toda unidade tem as duas por padrão,
  §6.4) — inferir por `kind` evita repetir os ids como string literal em mais um lugar
  (antes hardcoded tanto em `apps/server` quanto em
  `tools/balance/src/runTournament.ts`). Risco assumido conscientemente: se um talento
  vier a conceder uma reação nova que não deva contar como baseline (ex.: uma reação
  exclusiva de árvore), essa inferência quebra — fica registrado como o ponto exato a
  revisitar (candidato: campo explícito em vez de inferir por `kind`), não é decisão
  fechada para sempre.
- **`ArenaMap`/`Composition`/`ContentCatalog` ganharam definição única em
  `packages/content/src/types.ts`**, fechando a duplicação verbatim que a auditoria
  (`docs/milestones/M9-integracao-de-conteudo.md`, seção 2) apontou entre
  `tools/balance/src/loadContent.ts` e `apps/server/src/content/types.ts` — só do lado de
  `tools/balance` nesta fatia, já que `apps/server` só migra na sub-sessão 2 (fora de
  escopo desta sessão; `apps/server/src/content/types.ts` continua com sua própria cópia
  de `ArenaMap` até lá).
- **`firstArenaMap(catalog)` como conveniência temporária pra `tools/balance`** — o
  Coliseu (§9.2) só usa 1 mapa e `content.map` (M8) virou `content.maps` (`Record<Id,
  ArenaMap>`, D2). "Primeiro mapa na ordem de inserção" replica fielmente o
  `loadFirstValid` de antes de M9 (que sempre pegava o primeiro arquivo encontrado no
  disco) — seguro enquanto só existir 1 mapa "de arena" por dataset. Vira candidato a
  escolha explícita por id quando `apps/client` portar os 3 mapas de campanha
  (sub-sessão 3) e o dataset real de `packages/data/maps/` deixar de ter só 1 arquivo.
- **Baseline de `pnpm balance` capturado antes de qualquer mudança de código de M9**
  (critério de aceite 2 do milestone exige comparação "antes"/"depois"). Depois da
  migração completa desta sub-sessão, a saída de `pnpm balance -- --runs 10000` é
  **byte-a-byte idêntica** à linha de base (`diff` sem nenhuma linha de diferença) — a
  migração do loader não mudou nenhum resultado de simulação.

`pnpm test` (570 testes, 56 arquivos — 14 novos em `packages/content`, 4 removidos de
`tools/balance/tests/loadContent.test.ts` [deletado, testes migraram], 3 removidos de
`tools/balance/tests/runTournament.test.ts` [migraram junto]), `pnpm typecheck` (7
pacotes, limpo — `packages/content` pela primeira vez), `pnpm lint` sem alteração,
`pnpm validate:data` (17 schemas, 62 arquivos, sem mudança — fatia não mexeu em
conteúdo).

### M9 — sub-sessão 2: servidor com catálogo real

- **`apps/server/src/content/types.ts` deletado, não esvaziado num re-export.** A
  alternativa (manter o arquivo como `export type { ArenaMap, ContentCatalog } from
  '@paths-beyond/content'`) evitaria tocar nos 8 arquivos que importavam dele, mas
  perpetuaria uma segunda "fonte" de import pros mesmos tipos — exatamente o tipo de
  duplicação que D2 pediu pra fechar. Import direto de `@paths-beyond/content` em todo
  lugar (`app.ts`, `battle/routes.ts`, e os 6 arquivos de teste que constroem um
  catálogo à mão) deixa claro, pra quem ler o código depois, que o pacote novo é a
  única fonte — sem indireção que só existiria por conveniência de migração.
- **Nenhuma mudança de lógica em `battle/routes.ts`**, só de import — `opts.catalog.maps
  [mapId]`/`opts.catalog.maps[defense.mapId]` já indexavam por id desde M7 (o servidor
  sempre exigiu `mapId` explícito no corpo de `PUT /me/defense`, nunca "o mapa"). A
  mudança de M9 sub-sessão 1 (`content.map` único → `content.maps: Record<Id,
  ArenaMap>`) já era exatamente o shape que `apps/server` sempre teve — só `tools/balance`
  (Coliseu, mapa único por natureza) precisou de `firstArenaMap()`.
- **Teste novo (`realContent.test.ts`) fica ao lado do fuzz, não o substitui** — D5 é
  literal: o fuzz continua provando o motor com conteúdo sintético (rápido, sem
  depender do estado de `packages/data`); o teste novo prova que o catálogo real
  carrega e resolve através do endpoint HTTP de ponta a ponta (`PUT /me/defense` →
  `POST /battles`), usando duas classes reais (`class-espadachim`/`class-guerreiro`)
  com equipamento vazio (por simplicidade — provar que o catálogo resolve não exige
  equipar itens; isso já é coberto por `packages/content/tests/loadCatalogFromDisk.test.ts`).

`pnpm test` (571 testes, 57 arquivos — +1 sobre a sub-sessão 1), `pnpm typecheck` (7
pacotes, limpo), `pnpm lint`/`pnpm validate:data` sem alteração (17 schemas, 62
arquivos). `pnpm balance -- --runs 10000` byte-a-byte idêntico à linha de base da
sub-sessão 1 (nenhuma mudança em `tools/balance`/`packages/content` nesta fatia).

### M9 — sub-sessão 3: cliente com conteúdo real

- **Import por subpath direto (`@paths-beyond/content/src/buildCatalog.js`/`types.js`)
  no adapter de browser, nunca pelo barrel `@paths-beyond/content`.** Achado real ao
  rodar `tsc --noEmit` pela primeira vez com a dependência nova: o barrel (`index.ts`)
  reexporta `loadCatalogFromDisk` (usa `node:fs`/`node:path`/`node:url`), e importar
  qualquer coisa do barrel puxa esse arquivo pro grafo de módulos do TypeScript —
  como `apps/client/tsconfig.json` não declara `types:["node"]` de propósito (o
  cliente roda em browser, regra já implícita desde M6), o programa inteiro falhava
  com "Cannot find module 'node:fs'". Mesmo padrão já usado por
  `tools/balance/src/loadContent.ts` (M8) pra importar schemas de `@paths-beyond/data`
  por subpath em vez de um barrel — não foi preciso mudar `packages/content/package.json`
  (sem campo `exports`, subpath resolve direto pro arquivo em disco, mesmo mecanismo
  que já sustenta `@paths-beyond/data/schemas/*.schema.js`).
- **D3 — os 3 mapas de campanha portados marcam o caráter provisório só por
  `id`/`name`** (`map-campanha-{1,2,3}-provisorio`, nome com "(provisório...)"), não por
  um campo novo no schema. `maps.schema.ts` não tem — e não ganhou — um campo
  `provisional`: adicionar um campo de schema só pra 3 arquivos que M12 vai substituir
  é mais acoplamento permanente do que o problema pede. Se M12 (autoria de mapa real)
  não fizer questão de apagar esses 3 arquivos explicitamente, o candidato certo é
  reabrir esta decisão então, não agora.
- **`terrain-floresta`/`terrain-montanha` são conteúdo REAL, não provisório** —
  diferente dos 3 mapas, o TIPO de terreno "floresta"/"montanha" (custos de
  movimento/bônus de defesa/evasão) não é arbitrário de demonstração, é um tipo de
  terreno genérico que qualquer mapa real futuro (M12) pode querer reusar. Só a
  GEOMETRIA dos 3 layouts (onde cada terreno fica em cada mapa) é provisória; os
  valores do terreno em si, portados de `terrains.ts` (M6) sem alteração, não são.
- **`baselineReactionSkillIds` derivado por `kind:'reaction'` (decisão da sub-sessão 1)
  sobreviveu ao teste real** — os únicos dois hits no catálogo real
  (`skill-contra-atacar`/`skill-defender`) são exatamente os que a campanha real
  precisa, confirmado pelo teste de browser (Chromium headless) sem erro.
- **Talentos: árvore por classe real, não uma árvore global de demonstração.**
  Descoberta ao portar: uma classe `tier:'base'` só tem nós `tree:'class'`; uma classe
  `tier:'spec'` (promovida) só tem nós `tree:'spec'` — nunca ambas simultaneamente
  (diferente da demo de M6, que aplicava uma árvore "classe" E uma árvore "spec" fixas
  pra qualquer unidade). Isso é fiel à spec (§8.2: especialização vem da promoção) — a
  correção não foi tratada como bug a esconder; `TalentTreePanel.tsx` mostra a aba sem
  conteúdo (nenhum nó) quando a classe da unidade não tem aquela árvore, em vez de
  fingir dados que não existem. Nenhuma mecânica de promoção foi implementada nesta
  sub-sessão (fora de escopo de M9) — a classe promovida (`class-mestre-espadachim`)
  entra como um inimigo já promovido de fábrica, não como resultado de uma promoção
  em jogo.
- **`layoutTalentTree()` deriva a coluna visual (0/1/2) da estrutura da árvore**, não
  mais hand-authored por nó (impossível pra conteúdo real — `ClassDef.talentTree` não
  tem campo de layout, propositalmente, já que é decisão só do cliente). Regra: nó
  sozinho numa linha fica centralizado; um par `exclusiveWith` na mesma linha (o
  padrão real de bifurcação usado por toda classe de M8) fica um de cada lado,
  ordenado por id pra determinismo.
- **Enemigos de campanha continuam sem `aiArchetype`** (preserva o comportamento de
  M6 — nenhuma unidade de campanha é controlada por IA nesta fatia). Ligar IA de mapa
  real na campanha do cliente seria mecânica nova, fora do escopo "zero mecânica nova"
  de M9.
- **Verificação além de typecheck/testes**: como a UI não é coberta por `pnpm test`,
  rodei o servidor Vite real e verifiquei com Playwright/Chromium headless (mesma
  instalação de M8 sub-sessão 7) — página carrega, zero erros de console, campanha
  renderiza com stats/AP/PP reais. Screenshot descartável salvo fora do repo (mesmo
  padrão de diagnóstico descartável já usado em M8 sub-sessão 4/7).

`pnpm test` (571 testes, 57 arquivos — só `validate.test.ts` mudou de expectativa,
62→67 arquivos, pelos 5 arquivos reais novos), `pnpm typecheck` (7 pacotes, limpo),
`pnpm lint` sem alteração, `pnpm validate:data` (17 schemas, 67 arquivos). `pnpm
balance -- --runs 10000` continua byte-a-byte idêntico à linha de base (confirmado que
`firstArenaMap()` de `tools/balance` ainda escolhe `map-arena-coliseu` com 4 mapas no
catálogo — ordem alfabética de `readdirSync` coloca "map-arena" antes de
"map-campanha").

### M9 — sub-sessão 4: sim-cli, RULES_VERSION, aceite final — MILESTONE COMPLETO

- **`RULES_VERSION` bumpado de `'0.0.0'` pra `'0.1.0'` (D4), primeiro bump desde M0.**
  Antes de bumpar, investiguei se isso quebraria `GOLDEN_HASH` (M8 sub-sessão 7):
  `simulate()` (`packages/core/src/battle/simulate.ts`) nunca lê `replay.rulesVersion`
  — o campo existe no `Replay` só pra quem monta a batalha (o servidor) comparar
  contra a constante antes de rodar, fora de `packages/core`. `BattleResult` (o que
  `hashState` hasheia) não carrega `rulesVersion`. Confirmado rodando `pnpm
  test:browser` (3 engines) depois do bump: os 42 testes de determinismo continuam
  batendo com o mesmo `GOLDEN_HASH` — o bump é seguro por construção, não só por sorte.
  Escolha do valor `'0.1.0'` (não dada pelo briefing, só "bump it"): primeira versão
  minor, sinalizando "regras agora versionadas de verdade" sem fingir reconstruir os 8
  incrementos que nunca aconteceram em M1-M8.
- **`hashState`/`canonicalize`/`fnv1a32` exportados no barrel público de
  `packages/core`** (antes só acessíveis via import relativo dentro dos próprios
  testes de `packages/core`, M8 sub-sessão 7). Primeira vez que um consumidor externo
  (`sim-cli`) precisa do hash canônico — sem isso, `sim stat-sheet` teria que
  reimplementar FNV-1a de novo (como `sim-cli/src/duel.ts`, código de M2, já faz com
  `hashDuelResult`, que usa `JSON.stringify` cru — sem a garantia de chaves ordenadas
  que `canonicalize()` existe pra dar). Não mexi em `duel.ts` (fora de escopo desta
  sub-sessão, código pré-existente e já testado), só não repeti o mesmo padrão frágil
  no código novo.
- **`sim stat-sheet <hero.json> [--catalog-dir <dir>]`**: lê um `Hero` real
  (`heroes.schema.ts`, mesmo shape usado por comps/servidor/cliente), carrega o
  catálogo via `loadCatalogFromDisk()`, resolve `resolveHeroStatSheet` e imprime os 13
  stats + hash canônico. `--catalog-dir` opcional (default = conteúdo real de
  `packages/data/`) segue a mesma convenção de `rootDir`/`layout` já usada por
  `loadCatalogFromDisk`/`loadBalanceContent`, permitindo testar contra
  `test-fixtures/` sem inventar um segundo caminho de carregamento.
- **Critério de aceite 4 (o análogo de §3.3 pra camada de conteúdo) — prova em duas
  partes, não uma só:**
  - **Automatizada em `pnpm test`** (`packages/sim-cli/tests/
    heroStatSheetCrossConsumer.test.ts`): as pernas sim-cli e "servidor" rodam as
    duas em Node contra o mesmo catálogo real. "Servidor" é literalmente
    `resolveHeroCombatProfile` — a função que `apps/server/src/battle/routes.ts`
    chama por dentro (via `buildBattleSetupFromHeroes`/`buildBattleUnit`) pra resolver
    `.stats`, já exercitada de ponta a ponta contra conteúdo real por
    `apps/server/tests/realContent.test.ts` (sub-sessão 2) — não uma cópia paralela de
    lógica escrita só pra este teste.
  - **Manual, com output real colado nesta sessão, NÃO automatizada em CI**: a perna
    cliente. `apps/client/src/data/catalog.ts` ganhou um bloco temporário
    (`resolveHeroStatSheet`+`hashState` sobre o mesmo `Hero` de `comp-espadachim`,
    expondo o resultado em `window.__debugHeroStatHash`) — mesmo padrão de
    diagnóstico descartável já usado em M8 sub-sessão 4/7, revertido antes do commit
    (`git diff` confirmado vazio no arquivo depois de reverter). Rodei `npx vite` real
    + Playwright/Chromium headless (mesma instalação de M8 sub-sessão 7): **hash do
    navegador = `33998011`, idêntico ao hash computado em Node** pro mesmo `Hero`.
    Decisão de escopo: automatizar isso em CI exigiria subir um servidor Vite +
    Playwright dentro da suíte de testes de `packages/content` ou `apps/client`,
    infraestrutura de E2E nova que nenhum dos dois pacotes tem hoje — desproporcional
    ao pedido de M9 ("sim-cli passa a poder carregar do catálogo... aceite"). Fica
    registrado como candidato natural pra M13 (superfície jogável completa), que já
    precisa de infraestrutura de teste de UI real por outros motivos (tela de replay,
    tela de PvP).
- **Nenhum briefing de M10 foi escrito nesta sessão** — decisão de método já registrada
  na "Auditoria 2026-08-07": cada milestone ganha o briefing detalhado só quando vira
  o próximo. M9 é o único que teve briefing desde o início porque a auditoria decidiu
  a ordem completa (integração → mecânica → conteúdo → superfície) e escreveu só o
  primeiro passo em detalhe.

`pnpm test` (579 testes, 59 arquivos — +8 sobre a sub-sessão 3: 4 em
`statSheet.test.ts`, 3 em `parseArgs.test.ts`, 1 em
`heroStatSheetCrossConsumer.test.ts`), `pnpm typecheck` (7 pacotes, limpo), `pnpm lint`
sem alteração, `pnpm validate:data` sem alteração (17 schemas, 67 arquivos), `pnpm
test:browser` (42 testes, 3 engines, `GOLDEN_HASH` intacto). `pnpm balance -- --runs
10000` continua byte-a-byte idêntico à linha de base capturada antes da sub-sessão 1 —
confirmado em toda fatia de M9 sem exceção. **Com esta fatia, M9 está completo: os 4
critérios de aceite formais de `docs/milestones/M9-integracao-de-conteudo.md` §6 estão
confirmados batendo.**

### M10 — sub-sessão 1/N: fundação de skill.effects no duelo

Primeira fatia de M10 (roadmap: "Profundidade do duelo"). Usuário escolheu, entre as
opções apresentadas (fundação+skill.effects / assistência aplicando HP / harness
multi-unidade do balance), começar pela fundação — é o item citado primeiro no roadmap
e desbloqueia DoT/regen e set specials depois.

- **Campo de dano/cura periódico em `EffectDef`: percentual do HP MÁXIMO do alvo**
  (`periodicDamagePct`/`periodicHealPct`, fp-scale), não valor fixo — decisão levada ao
  usuário antes de codar. Reusa a convenção já existente no projeto (`damageDealtPct`,
  `damageTakenReductionPct` já são todos percentuais) e escala automaticamente com o HP
  do alvo sem precisar recalibrar por tier de progressão. **Declarado nesta sub-sessão,
  ainda não tickado** — `round.ts`/`tickEffects` continua só decrementando duração
  numérica; aplicar dano/cura de fato fica para a sub-sessão que liga DoT/regen.
- **Campo `duration` em `EffectApplication` — mesmo union de `ActiveEffect.duration`**
  (`number | 'duel' | 'battle'`), extraído para `effectDurationSchema` em
  `packages/data/schemas/shared.ts` e reusado nos dois lugares. Passou a ser **campo
  obrigatório** (não opcional/default) — duração de efeito é decisão de conteúdo, não
  do motor; `applyMapSkill` (`packages/core/src/battle/commands.ts`) parou de usar
  `'battle'` hardcoded (cut documentado desde M3) e passou a ler `application.duration`
  de verdade.
- **`skill.effects` só é aplicado para a skill do ATOR PRINCIPAL** (a que o script
  tático escolheu, ou a skill pura de buff/debuff sem componente de dano — branch que
  antes só logava e retornava). Reação/contra-ataque e assistência têm seus próprios
  `effects` declaráveis em `SkillDef` mas **não são resolvidos ainda** — corte
  explícito, pareado com o corte de reaction triggers além de `onAttacked` (ambos
  candidatos óbvios pra próxima sub-sessão de M10, já que resolver um sem o outro seria
  trabalho pela metade no mesmo código).
- **Chance de aplicação usa `eff`/`efr` do formulário literal do §6.9 mesmo para
  self-target** — o `efr` do PRÓPRIO ator (não um "defensor" separado) entra na conta
  quando uma skill aplica um buff em si mesma. Não é exceção explícita na spec; decisão
  de implementar literal em vez de inventar um caso especial pra self-buffs.
- **Reaplicar um efeito já ativo refresca a `duration` para a da nova aplicação** (em
  vez de manter a duração mais longa entre as duas, ou somar). `upsertActiveEffect`
  (novo, `packages/core/src/duel/effects.ts` — extrai e substitui a lógica que antes só
  existia duplicada dentro de `applyMapSkill`) segue essa convenção; stacks continuam
  somando até o teto do `EffectDef`, só a duração é substituída.
- **Achado que exigiu escopo maior do que "só core+data" (confirmado com o usuário
  antes de prosseguir):** `packages/content`'s `ContentCatalog` nunca teve uma coleção
  `effects` — inofensivo enquanto `skill.effects` era mecanicamente inerte (M2), mas
  uma vez ligado, `apps/server`, `apps/client` e `tools/balance` continuariam rodando
  com `effectDefs: {}` hardcoded, repetindo exatamente o padrão que a auditoria de
  2026-08-07 criticou em "Achado 5" (skill que não faz nada mecanicamente). Fechado
  nesta sub-sessão: `ContentCatalog.effects`, os dois adapters
  (`loadCatalogFromDisk.ts`/`loadCatalogFromBrowser.ts`) e os 4 pontos de chamada
  (`apps/server/src/battle/routes.ts`, `apps/client/src/data/campaign.ts`,
  `tools/balance/src/runTournament.ts`) passaram a usar conteúdo real.
  `packages/sim-cli/src/duel.ts` continua com `effectDefs: {}` — seu formato
  self-contained (`DuelParticipant` autônomo, decisão de M2) não tem hoje um terceiro
  arquivo de entrada pra um catálogo de efeitos; fica como gap documentado, não
  resolvido, já que consertar exigiria mudar o formato do comando `sim duel`, fora do
  escopo desta fatia.
- **`DuelResult` ganhou `finalActiveEffectsAttacker`/`finalActiveEffectsDefender`** —
  sem isso, um efeito aplicado dentro de `resolveDuel` evaporaria ao sincronizar de
  volta com o `BattleUnit` no fim de `applyEngage` (que só copiava hp/ap/pp de volta).
  `ActionLogEntry` ganhou `effectsApplied: readonly Id[]` (quais effectIds passaram na
  rolagem de chance nesta ação) — não exigido pelo critério de aceite formal, mas
  mínimo o suficiente pra testar diretamente em vez de só inferir por diferença de
  dano, e é o tipo de dado que a UI de M10/M11 (ícones de status) vai precisar de
  qualquer forma.
- **`effect-fragilidade` (talento granted, `class-*.json` × 10 + template em
  `authorContent.ts`) ganhou `duration: 'duel'`** — não `'battle'`. É a primeira vez
  que este efeito (inerte desde M2) passa a fazer algo de verdade; escopo contido
  (dura só o duelo em que foi aplicado) pareceu o default mais seguro pra uma skill de
  assinatura de classe recém-ligada, em vez de debuff permanente de mapa. Sem
  consequência observável em `pnpm balance` porque todo comp real usa `talents: {}`
  (nenhum talento é alocado nos comps de balanceamento) — confirmado empiricamente
  (`git stash` + rerun na baseline pré-M10 = output byte-a-byte idêntico ao pós-M10).
- **Fixture `goldenReplay.ts` (`heavyBlow.effects` → `effect-bleed`) ganhou
  `duration: 'battle'`** — já existia desde M2 como debuff mecanicamente inerte,
  citado no próprio docstring do fixture ("...aplicação de debuff") como algo que a
  fixture pretendia exercitar mas nunca exercitou de fato. `'battle'` (não `'duel'`)
  porque o replay engaja os mesmos dois rivais duas vezes — dá cobertura ao caminho de
  persistência entre duelos, não só dentro de um duelo só.
- **`GOLDEN_HASH` mudou (`6249029d` → `c3a404a0`) e `RULES_VERSION` subiu (`0.1.0` →
  `0.2.0`)**, no mesmo commit, seguindo o protocolo documentado no próprio
  `crossRuntime.test.ts`: mudança de regra real (skill.effects deixou de ser inerte),
  não regressão — confirmado rodando `pnpm test` (node) e `pnpm test:browser`
  (Chromium/Firefox/WebKit reais) com o hash novo batendo nos quatro ambientes.

`pnpm test` (594 testes, 59 arquivos), `pnpm typecheck` (7 pacotes, limpo), `pnpm lint`
sem alteração, `pnpm validate:data` sem alteração (17 schemas, 67 arquivos), `pnpm
test:browser` (42 testes, 3 engines, `GOLDEN_HASH` novo confirmado nos três). `pnpm
balance -- --runs 10000` byte-a-byte idêntico à linha de base pré-M10 (comparação
direta via `git stash`, não só inferência). Escopo restante de M10 (não iniciado):
tick de DoT/regen, dano/cura de assistência aplicado a HP, reaction triggers além de
`onAttacked`, efeitos `special` de set (§7.4), harness multi-unidade de
`tools/balance` com `weaponDuelRanges`/`assistRange` reais.

### M10 — sub-sessão 2/N: assistência causa dano de verdade a HP

Continuação direta da sub-sessão 1, sessão diferente, autorizada pelo usuário ("pode
continuar"). Item explícito do roadmap de M10 ("assistência muda o HP final do duelo",
critério de aceite formal) e o corte mais "pronto pra ligar" segundo a sub-sessão 1:
`resolveAssists` já decidia QUEM assiste (testado desde M2); faltava só aplicar
`ASSIST_DAMAGE_MULTIPLIER` a HP de verdade.

- **Achado que restringiu o escopo antes de codar:** o roadmap agrupa "dano **e cura**
  de assistência" como um item só, mas investigação mostrou que **cura não tem
  mecânica nenhuma no motor hoje** — `heal` existe só como campo de `StatSheet` (§4.1,
  "Cura dada/recebida", %), nunca lido em código nenhum; o único discriminador de
  "isto é uma skill de cura" é `tags.includes('heal')` (§06-classes-e-talentos.md
  linha 64), mas não existe fórmula normativa de magnitude (nenhum §6.6-equivalente
  pra heal). Decisão: **esta sub-sessão implementa só o dano de assistência**
  (totalmente especificado, sem invenção); cura de assistência fica cortada,
  documentada, candidata a uma sub-sessão própria que primeiro precisa inventar a
  fórmula de cura do zero (decisão de design que merece checkpoint com o usuário
  antes, não algo pra decidir em silêncio no meio de outra fatia).
- **Dano de assistência reusa a mesma matemática de `computeDamage` (§6.6)**, com
  duas simplificações explícitas: (1) **sem rolagem de acerto própria** — mesma
  convenção já adotada para contra-ataques em resolveDuel.ts ("Contra-ataques sempre
  acertam"), estendida agora à assistência; (2) **`positionalMultiplier: 1000`
  (neutro)** — o assistente não tem posição própria resolvida dentro do duelo (ele
  ataca de uma tile diferente da dos dois duelistas principais); calcular
  flanco/cerco/altura pro assistente exigiria resolver uma segunda posição dentro do
  mesmo `DuelEngagementContext`, fora de escopo desta fatia.
- **Crítico e variância de dano SÃO rolados** para a assistência (ao contrário do
  acerto) — mantém a assistência sujeita à mesma aleatoriedade que qualquer outro
  golpe, só sem o passo de "será que erra".
- **Novo stream de rng**: `rngFor(seed, 0, assistantId, '<lado>-assist:crit'/'<lado>-
  assist:damage-variance')` — `round=0` nunca colide com as trocas reais (1/2/3),
  `<lado>` (`attacker-assist`/`defender-assist`) distingue os dois lados.
  `upsertActiveEffect`/`applyActiveEffectsToStats` reusados para computar os stats
  efetivos do assistente E do alvo (ambos podem ter `activeEffects` de duração
  `battle` herdados de duelos anteriores no mesmo mapa).
- **`AssistCandidate` ganhou `stats`/`unitType`/`weaponType`/`activeEffects`** — antes
  só carregava o necessário pra `resolveAssists` DECIDIR quem assiste (script de
  reação + economia + `ConditionContext`), nada que permitisse calcular dano de
  verdade. `commands.ts`'s `buildAssistCandidates` agora repassa `ally.stats`/
  `ally.unitType`/`ally.weaponType`/`ally.effects`.
- **`AssistResult` (decisão pura, `resolveAssists`) ficou inalterado** — `AppliedAssistResult`
  (novo, `= AssistResult & { damageDealt: number }`) é o tipo que carrega o dano,
  produzido por `applyAssistDamage` (novo, `assist.ts`) e é o que `DuelResult.
  attackerAssists`/`defenderAssists` expõe agora. Mantém a separação já estabelecida
  em M2: "quem assiste" (decisão, testado isoladamente, sem stats) vs "o que
  acontece" (aplicação, precisa de stats/rng/HP).
- **Assistência sem componente de dano (skill `multiplier=0 && flat=0`, ex.: tag
  `'heal'`) contribui `damageDealt: 0`**, sem erro — resultado esperado dado o corte
  de cura acima, não um bug.
- **Achado sobre o replay canônico**: `goldenReplay.ts` (fixture de determinismo desde
  M2/M9) tem um arqueiro posicionado "pra entrar como assistência" (comentário no
  próprio arquivo), mas seu `reactionScript` só tem uma linha com trigger
  `onAttacked` — nunca teve uma linha `onAllyEngagedNearby`, então `resolveAssists`
  sempre retornou `[]` pra ele, em qualquer sub-sessão de M2 a M10. **`GOLDEN_HASH`
  não mudou nesta fatia** (confirmado rodando `pnpm test` e `pnpm test:browser` nas 3
  engines) — não porque a mudança seja cosmética, mas porque a fixture nunca exercitou
  de verdade o caminho que mudou. Gap pré-existente da fixture, não corrigido aqui
  (fora de escopo; corrigir mudaria o que a fixture testa, não é uma correção
  "grátis"). **`RULES_VERSION` subiu mesmo assim** (`0.2.0`→`0.3.0`) — a regra mudou
  de verdade, só não é observável por ESTE fixture específico.
- **`pnpm balance -- --runs 10000` continua byte-a-byte idêntico** à baseline pré-M10
  — todos os 9 comps reais de M8 são de 1 unidade só (sem aliados), então assistência
  nunca é candidata a acontecer nesses torneios. Confirmado (`diff` direto contra o
  arquivo salvo na sub-sessão 1, não só inferência).

`pnpm test` (606 testes, 59 arquivos — +12 sobre a sub-sessão 1: 8 novos em
`assist.test.ts`, mais os testes estendidos em `resolveDuel.test.ts`/
`commands.test.ts` contam nas mesmas suítes), `pnpm typecheck` (7 pacotes, limpo),
`pnpm lint` sem alteração, `pnpm validate:data` sem alteração (17 schemas, 67
arquivos — fatia não mexeu em conteúdo), `pnpm test:browser` (42 testes, 3 engines,
`GOLDEN_HASH` intacto). Pendente do restante do roadmap de M10: cura de assistência
(precisa de fórmula nova, checkpoint com usuário), tick de DoT/regen, reaction
triggers além de `onAttacked`, efeitos `special` de set, harness multi-unidade de
`tools/balance`.

### M10 — sub-sessão 3/N: DoT/regeneração tickando de verdade

Continuação, sessão diferente, autorizada pelo usuário ("pode continuar"). Entre os
itens restantes do roadmap de M10, o usuário escolheu este (entre 4 opções
apresentadas) por ter escopo bem definido, sem decisão de fórmula nova pendente —
`periodicDamagePct`/`periodicHealPct` já existiam no `EffectDef` desde a sub-sessão 1
(percentual do HP máximo, fp-scale, decisão já tomada naquela sub-sessão), só nunca
eram lidos por código nenhum.

- **Tensão real entre §5.3 e §6.9, levada ao usuário antes de codar** (já estava
  registrada como decisão em aberto desde M3, sub-sessão M8-7): §5.3 descreve o tick
  de duração como em lote, no fim do round, depois que TODAS as unidades já agiram;
  §6.9 descreve DoT/regen numa ordem por TURNO INDIVIDUAL da unidade ("DoT → tick de
  duração → regeneração → ação"), o que implicaria aplicar o dano/cura periódico
  antes daquela unidade agir naquele round — inclusive antes de sua própria decisão
  tática (uma condition `selfHpBelow` já veria o HP pós-DoT no mesmo round). Isso
  muda resultado de jogo de verdade (uma unidade pode morrer de veneno antes de agir;
  uma decisão tática pode virar por causa do tick), não é só um detalhe de
  implementação — perguntei antes de escolher. **Decisão do usuário: lote no fim do
  round**, consistente com o tick de duração/cooldown que `endRound` já fazia; evita
  plumbing novo de "início de turno" (não existe hoje — `commands.ts` só tem
  `move`/`rest`/`wait`/`mapSkill`/`useValor`/`engage`, comandos diretos, sem um passo
  de "a unidade X começou seu turno"). Consequência aceita: DoT/regen aplicado no
  round N só afeta a decisão tática da unidade no round N+1, não no round em que foi
  tickado.
- **Stacks escalam o tick, também perguntado antes**: 2 stacks de veneno causam 2×
  `periodicDamagePct` por tick — dá sentido mecânico a `maxStacks > 1`, que já existia
  no schema desde M1 mas nunca influenciava dano nenhum antes desta fatia. Escolhido
  via soma repetida (`for (let i = 0; i < active.stacks; i++)`), mesma convenção já
  estabelecida em `sumEffectField` (`duel/effects.ts`, M10 sub-sessão 1) para nunca
  fazer `value * stacks` cru fora dos helpers de `math/fixed.ts` (regra 2 do
  CLAUDE.md).
- **`computePeriodicEffects` (novo, `duel/effects.ts`)**: função pura que soma dano e
  cura periódicos de todos os efeitos ativos de uma unidade, em HP absoluto (não
  percentual) — `fpPct(maxHp, periodicDamagePct)` por stack, somado. Vive em
  `duel/effects.ts` (não em `battle/round.ts`) porque esse arquivo já é o módulo
  compartilhado de "matemática de `ActiveEffect`" reusado por `resolveDuel.ts` e
  `battle/commands.ts` desde M10 sub-sessão 1 — `battle/round.ts` só chama a função e
  aplica o resultado a `hp`, não recalcula nada.
- **`applyPeriodicHp` (novo, `battle/round.ts`)**: aplica o resultado a `unit.hp`
  seguindo a ordem literal de §6.9 mesmo em lote — dano primeiro (`Math.max(0, hp -
  damage)`), só então cura, capada em `unit.stats.hp` (`Math.min`). Uma unidade que o
  próprio DoT deste tick derrubou a 0 NÃO recebe a cura do mesmo tick (checada com
  `if (afterDamage <= 0) return afterDamage`) — decisão implícita, não perguntada
  separadamente, mas segue diretamente da ordem "DoT → regeneração" já decidida
  acima (se a unidade já morreu no passo 1, não há "ação" nem passo seguinte pra ela).
  DoT/regen calculado a partir dos efeitos ANTES do tick de duração (`tickEffects`) —
  um efeito com `duration: 1` ainda causa seu último tick de dano/cura no round em que
  expira, só desaparece no round seguinte. Cura é a primeira mecânica de cura de
  verdade no motor inteiro (o corte documentado em M10 sub-sessão 2 — "`heal` nunca
  foi lido em código nenhum" — falava de cura de SKILL/assistência, que continua sem
  fórmula; regen periódico é um mecanismo diferente, já totalmente especificado por
  `periodicHealPct`, sem tensão com aquele corte).
- **`pnpm balance -- --runs 10000` continua byte-a-byte idêntico**: nenhum conteúdo
  real de `packages/data` (fora de `test-fixtures/`) declara `periodicDamagePct`/
  `periodicHealPct` — confirmado via grep antes de rodar o comando, não só inferido. O
  relatório bate número a número com o já documentado em `DECISIONS.md`/`PROGRESS.md`
  desde M8 sub-sessão 7 (Arcanista 38,7%, Grifeiro 35,8%, Couraçado 31,2% abaixo do
  piso de 40% — limitação conhecida e já aceita, não é regressão desta fatia).
  `GOLDEN_HASH` também intacto pelo mesmo motivo: o replay canônico não tem nenhum
  `EffectDef` com campo periódico.
- **`RULES_VERSION` subiu** (`0.3.0`→`0.4.0`) — mudança de regra real (DoT/regen
  passam de campos declarados-mas-inertes para mecanicamente ativos), mesmo não sendo
  observável nem pelo replay canônico nem por `pnpm balance` pelo motivo acima (mesmo
  padrão já estabelecido nas duas sub-sessões anteriores de M10).

Testes novos: 6 em `effects.test.ts` (`computePeriodicEffects` — dano/cura isolados,
escala por stacks, efeito sem campo periódico contribui 0, efeito ausente do
catálogo de defs ignorado sem lançar, soma de múltiplos efeitos simultâneos) + 8 em
`round.test.ts` (`endRound` — dano reduz hp, stacks escalam, cura capada no HP
máximo, cura soma normalmente abaixo do teto, dano pode matar sem ir negativo,
regen não se aplica se o dano do mesmo tick já matou, efeito que expira neste round
ainda causa seu último tick, unidade já morta não ticka) + 1 em `simulate.test.ts`
(integração ponta a ponta: uma unidade com veneno morre no fim do round SEM nenhum
duelo acontecer, e isso decide `outcome: 'victory'` via `checkWinCondition`, provando
que o caminho `applyCommandAndAdvance` → `endRound` → `checkWinCondition` fecha
corretamente). `pnpm test` (**621 testes, 59 arquivos** — +15 sobre a sub-sessão 2),
`pnpm typecheck` (7 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data`
sem alteração (17 schemas, 67 arquivos — fatia não mexeu em conteúdo), `pnpm
test:browser` (42 testes, 3 engines, `GOLDEN_HASH` intacto). Pendente do restante do
roadmap de M10: cura de assistência/skill (fórmula nova, checkpoint pendente com
usuário — corte diferente deste, não resolvido aqui), reaction triggers além de
`onAttacked`, efeitos `special` de set, harness multi-unidade de `tools/balance`.

### M10 — sub-sessão 4/N: harness multi-unidade com assistência real

Sessão de `/milestone`. Fecha o **critério de aceite 3 de M10** ("`pnpm balance` roda
com comps de múltiplas unidades e os dois critérios de M8 continuam batendo com o
motor novo"). Segue a ordem do próprio roadmap, que chama o harness multi-unidade de
pré-requisito ("sem isso as mudanças desta milestone não são mensuráveis") — os itens
restantes de M10 nascem medíveis.

- **Achado que mudou a forma do trabalho, antes de codar:** `tools/balance` **já
  suportava multi-unidade estruturalmente** — `toPlacements` (`runTournament.ts`) mapeia
  `comp.units` sem assumir aridade, e `simulate`/`resolveAiTurns` já rodam times
  multi-unidade desde M7 (é o que o fuzz de 1000 partidas faz). Os bloqueios eram de
  CONTEÚDO: (1) nenhuma skill do catálogo tinha `trigger: 'onAllyEngagedNearby'`, então
  `resolveAssists` devolvia `[]` sempre e o dano de assistência da sub-sessão 2 nunca
  disparava em conteúdo real; (2) os 9 comps tinham 1 unidade cada. Nenhuma linha de
  `tools/balance` precisou mudar nesta fatia.
- **`skill-assistir` é concedida por talento, não universal (decisão do usuário).**
  §6.4 fecha a lista de reações universais em duas (Contra-atacar, Defender) e diz
  literalmente que "classes e talentos adicionam outras". A skill entra no nó
  `talent-<slug>-foco-em-equipe` (row 7), que já dava `assistRangeBonus +1` e é
  exclusivo com `foco-solo` — a escolha da row 7 vira literalmente "jogo em time vs.
  jogo sozinho", sem nó novo nem mudança na estrutura da árvore de §8.2.
- **`SkillDef.baseline` (campo novo, decisão do usuário) reverte a derivação de M9.**
  M9 decidiu "toda skill `kind:'reaction'` do catálogo é baseline" — o que só estava
  certo por acidente: as duas únicas reações existentes eram justamente as duas que
  §6.4 chama de universais. Com `skill-assistir` no catálogo, a regra antiga daria
  assistência de graça a toda unidade, contradizendo a decisão acima. `baseline`
  default `false` (a lista fechada de §6.4 tem 2 itens; tudo o mais vem de talento);
  `deriveBaselineReactionSkillIds` passa a filtrar por `kind === 'reaction' &&
  baseline === true`. As duas reações universais passaram a ser geradas por
  `authorContent.ts` (antes escritas à mão desde M8) pra o campo viver num lugar só.
  **`RULES_VERSION` subiu** (`0.4.0`→`0.5.0`): o `reactionScript` resolvido por
  `combatProfile.ts` muda de verdade.
- **Comps: 3 unidades da MESMA classe (decisão do usuário: substituem os de 1
  unidade).** Mesma classe, e não um time misto, pra o comp continuar significando "um
  time desta classe" — que é o que a matriz de winrate mede desde M8. Um time misto
  introduziria, junto com a multi-unidade, um segundo eixo de variação (qual aliado cada
  classe ganha) que tornaria impossível atribuir uma mudança de winrate à classe.
  Posições em L dentro de raio 2 (Manhattan), porque §6.5.2 exige o aliado dentro do
  `assistRange` (melee = 2) pra a janela de assistência abrir.
- **`skill-assistir.multiplier = 1000`, leitura literal de §6.5.3.** "Executa uma ação
  reduzida: 50% do dano da skill" — os 50% são aplicados pelo motor
  (`ASSIST_DAMAGE_MULTIPLIER`, sub-sessão 2), então o multiplicador aqui é o da skill
  cheia (o mesmo do ataque básico), e uma assistência entrega exatamente metade de um
  ataque normal, sem número novo escondido no meio.

**Rebalanceamento forçado pelo resultado (regra 10 do CLAUDE.md — relatório rodado
antes de mexer em número).** A primeira rodada real com comps multi-unidade **quebrou o
critério de aceite 1 de M8**: Espadachim 68,7% e Guerreiro 68,4%, ambos acima do teto de
65%. Antes de tocar em qualquer número, isolei a causa com um diagnóstico descartável
(mesmo padrão de M8 sub-sessões 4/7): zerando o multiplicador de `skill-assistir`, o
spread volta a 22,3–63,9% e nada passa de 65% — ou seja, o desequilíbrio vem do dano de
assistência, não do formato multi-unidade em si. Baixar só o multiplicador não resolveu
(1000→500 moveu Espadachim de 68,7% pra 67,2%: o efeito é de limiar, não linear — com
3 unidades por lado, quem mata primeiro fica em superioridade numérica e a vantagem
composta), então a correção foi na causa estrutural real: **as 6 classes `physical`
equipam `set-forca` (+10% atk) e as 3 `magic` equipam `set-guardiao`, que dava +15%
`def` — e `def` é praticamente inerte nos valores reais do roster** (a mitigação de §6.6
é calibrada pra def~1000; heróis nível 10 têm def~30-56 — descompasso já documentado
desde M8 sub-sessão 2). Enquanto o torneio era 1v1 isso só encolhia o roster efetivo;
com assistência viva, que escala com `atk`, o lado físico passou a levar dois comps
acima do teto. `set-guardiao` trocou o eixo pra `hp`, magnitude calibrada
empiricamente: +15% hp inverteu o desequilíbrio (Druida a 70,5%), **+8% deixa o roster
inteiro abaixo de 65%**.

**Os dois critérios de aceite raiz de M8 confirmados batendo com o motor novo**
(`pnpm balance -- --runs 10000`): winrate global entre 26,2% (Couraçado) e **63,5%**
(Espadachim) — nenhuma composição acima de 65%; **22,4%** das unidades vencedoras com
`spd` acima da mediana (limiar 60%). Observações sem ação, consistentes com a decisão
de M8 sub-sessão 7/8 (piso de 40% e hard counters são diagnóstico, **não** gate de
aceite): Arqueiro (36,2%) e Couraçado (26,2%) abaixo do piso — Arqueiro caiu de 58,6%
(matriz 1v1 de M8) porque tem `pp: 1`, e com assistência viva o PP passou a ser
disputado entre assistir e contra-atacar; é consequência mecânica genuína do formato
novo, não bug. Hard counters caíram de 29 pares (M8) pra 17 — o formato multi-unidade
de fato reduziu os confrontos decididos antes da primeira jogada, que era o benefício
esperado.

**Correção de infraestrutura de teste, não de regra:** `apps/server/tests/fuzz.test.ts`
(1000 partidas) começou a estourar o timeout default de 5s do Vitest sob a suíte
inteira em paralelo — isolado roda em ~1,9s, mas já vinha batendo em ~4,6s sob
contenção, e o teste novo desta fatia (que carrega o catálogo real do disco) tipou a
balança. Timeout explícito de 30s; nada do que o teste verifica mudou.

Testes novos: 2 em `buildCatalog.test.ts` (baseline explícito; reação não-baseline fica
fora de `baselineReactionSkillIds` mas continua no catálogo), 7 em
`authorContent.test.ts` (skill-assistir válida/não-baseline, as 2 universais marcadas,
comps com >1 unidade, heroId único por unidade, 1 herói = 1 tile, talento alocado em
toda unidade, o talento de fato concede a skill, todo par de unidades dentro de 2
tiles) e 7 em `tools/balance/tests/multiUnitAssist.test.ts` (novo — conteúdo real
dispara assistência de verdade, dano > 0 a HP, teto de 2 por lado, 1 PP do assistente,
assistir não consome o turno do assistente, toda unidade conhece a skill via talento,
determinismo). `pnpm test` (**637 testes, 60 arquivos** — +16 sobre a sub-sessão 3),
`pnpm typecheck` (7 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data`
(17 schemas, **68 arquivos** — +1, `skill-assistir`), `pnpm test:browser` (42 testes, 3
engines, `GOLDEN_HASH` intacto — o replay canônico usa fixture própria, não conteúdo
real). Pendente do restante do roadmap de M10: reaction triggers além de `onAttacked`
(`onDamaged`, `onLethal`), efeitos `special` de set (§7.4), cura de assistência/skill
(fórmula nova, checkpoint pendente com o usuário).

### M10 — sub-sessão 5/N: gatilhos de reação além de `onAttacked`

Continuação da sub-sessão 4, mesma sessão, autorizada pelo usuário ("pode continuar,
deixe o commit pra mais tarde"). Item nomeado no roadmap de M10: "gatilhos de reação
além de `onAttacked` (`onDamaged`, `onLethal`)". Das 5 variantes de `ReactionTrigger`
(§6.4), duas já eram resolvidas — `onAttacked` (M2) e `onAllyEngagedNearby`
(assistências, M2 + M10 sub-sessões 2/4).

- **`onLethal` NÃO foi implementado — decisão de design do usuário, não corte por
  tempo.** Levei ao usuário a questão de o que um `onLethal` poderia fazer, já que cura
  não tem fórmula na spec (§6.4 lista "Cura de emergência" entre as reações que classes
  e talentos adicionam, mas nenhuma seção dá magnitude de cura). A resposta reenquadrou o
  problema em vez de escolher entre as opções oferecidas: **`onLethal` como checagem de
  ativação de script é estranho, porque implica prever a própria morte** — "não é
  interessante conseguir prever quando for morrer". O que faria sentido é "no máximo uma
  passiva ou skill que ativasse AO MORRER, pra prevenir ou pra fazer algum efeito". Isso
  é um mecanismo diferente do de reações: `selectReaction` é uma DECISÃO (script ordenado
  + conditions + custo de PP), e o que o usuário descreve é uma CONSEQUÊNCIA automática
  de um evento. Encaminhamento: `onLethal` fica sem resolução; quando for implementado,
  deve ser como gatilho automático de morte (passiva), não como linha de script — e
  provavelmente junto da decisão de fórmula de cura, que segue pendente.
- **`onDamaged` e `onDebuffed` são genuinamente reativos** (você levou dano; você foi
  debuffado — nenhum dos dois exige previsão), então entram pelo caminho normal de
  `selectReaction`, sem mecanismo novo. `onDebuffed` entrou junto por escolha do usuário,
  fechando o enum de §6.4 exceto por `onLethal` — deixar um trigger do enum sem resolução
  é exatamente o tipo de ponta solta que a auditoria de 2026-08-07 apontou.
- **Onde cada gatilho é resolvido, e por quê:** `onAttacked` continua ANTES do dano (o
  `-40%` de Defender precisa reduzir a troca corrente); `onDamaged` e `onDebuffed` são
  resolvidos DEPOIS do dano e depois de `applyEffectApplications` — antes disso não há o
  que reagir. A ordem entre os três é cronológica (a ordem dos eventos), não uma
  prioridade arbitrária.
- **Na prática no máximo UM dos três dispara por troca**, e isso não é regra nova: o teto
  de 1 PP por troca (§6.4, já implementado em `canAffordPp`) faz o primeiro gatilho que
  passar consumir o recurso. Por isso `ActionLogEntry.reaction` continua sendo um campo
  único em vez de virar array; ganhou `trigger` (aditivo, nenhum consumidor quebrou —
  `apps/client/DuelPreviewPanel.tsx` e `sim-cli/duel.ts` leem só `skillId`/`lineIndex`/
  `counterDamage`).
- **Uma reação `onDamaged`/`onDebuffed` sem componente de dano gasta o PP e não faz mais
  nada.** O `-40%` de Defender é específico de `onAttacked` (§6.4 descreve Defender como
  "-40% de dano NA TROCA"), e depois que o golpe já entrou não há dano a reduzir.
- **O corte "reação não aplica os próprios `skill.effects`" (sub-sessão 1) foi
  PRESERVADO**, embora estivesse documentado como pareado com este trabalho. Existe teste
  explícito afirmando esse comportamento (`counterWithEffects` em `resolveDuel.test.ts`);
  reverter seria decisão de design própria, não consequência de ligar os gatilhos. Fica
  como candidato a fatia futura — é o que tornaria `onDebuffed` interessante de verdade
  (reagir a um debuff limpando-o ou se buffando, em vez de só revidar).
- **Nenhum conteúdo real usa os gatilhos novos ainda** — gap consciente e documentado,
  da mesma categoria que a auditoria criticou no "Achado 5". Autorar uma reação
  `onDamaged` real exigiria concedê-la por talento (§6.4 fecha a lista de universais em
  duas — ver sub-sessão 4), fazer os comps alocarem esse talento, e portanto **outro
  ciclo completo de rebalanceamento** — a sub-sessão 4 acabou de mostrar que mexer no que
  os comps alocam quebra o teto de 65%. Por isso não entrou junto: é fatia própria, não
  detalhe desta.

`RULES_VERSION` subiu (`0.5.0`→`0.6.0`) — mudança de regra real. **Não observável** em
`pnpm balance` (numericamente idêntico à rodada da sub-sessão 4: Espadachim 63,5% …
Couraçado 26,2%, `spd` em 22,4%) nem no `GOLDEN_HASH` (42 testes, 3 engines, intacto),
porque nenhuma skill do catálogo real — nem a fixture do replay canônico — declara
`onDamaged`/`onDebuffed`.

Testes novos: 8 em `resolveDuel.test.ts` (onDamaged dispara e contra-ataca; o contra-dano
de onDamaged reduz HP de verdade, medido contra um duelo idêntico sem a reação; onDamaged
não dispara em ação sem dano; onDamaged não dispara se onAttacked já gastou o PP da troca;
onDebuffed dispara quando o debuff de fato é aplicado; não dispara quando a rolagem de
chance falha; não dispara para buff que o ator aplica em si mesmo; determinismo).
**Achado durante os testes:** uma primeira versão do teste "ação sem dano não dispara
onDamaged" falhou por motivo legítimo — o teto de 2 AP por duelo (§6.2) faz o atacante cair
para ataque básico na troca 3, que causa dano e dispara o gatilho corretamente; a asserção
foi restringida à troca 1, onde a ação medida é de fato a sem dano. `pnpm test` (**645
testes, 60 arquivos** — +8 sobre a sub-sessão 4), `pnpm typecheck` (7 pacotes, limpo),
`pnpm lint` sem alteração, `pnpm validate:data` (17 schemas, 68 arquivos — fatia não mexeu
em conteúdo), `pnpm test:browser` (42 testes, 3 engines). Pendente do restante do roadmap
de M10: efeitos `special` de set (§7.4), cura de assistência/skill (fórmula nova,
checkpoint pendente), `onLethal` como gatilho de morte (encaminhamento acima), e conteúdo
real usando os gatilhos novos.
