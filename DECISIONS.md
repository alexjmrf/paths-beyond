# Decisões

Registro de decisões de design tomadas fora da spec. Uma entrada por decisão.

> Formato: **Data — Decisão — Contexto — Alternativas descartadas — Consequência para a spec**

## Em aberto (da spec, seção 15)

- `MAX_TROCAS = 3` é chute inicial. Testar antes de mexer.
- Limite de 2 AP por duelo: se ninguém chegar perto, reduzir pools em vez de subir o limite.
- Alcance de assistência: começar em 2 tiles. Se disparar em >70% dos duelos, encarecer o custo em PP.
- Duelo ranged unilateral é forte de propósito. Se arqueiros dominarem, reduzir dano — não permitir contra-ataque.
- Permadeath: sugestão de `classic` como padrão.

## Em aberto (levantadas pelo usuário em 2026-08-28, ao julgar o critério 2 do M16)

### A direção de arte deixa de ser "definitiva"

O briefing do M16 (§2) diz **"visual programático, definitivo, zero assets raster"**, e a auditoria
de 2026-08-14 fundamentou isso. Ao julgar o critério 2, o usuário declarou uma visão diferente:
**personagens em sprite 2.5D** (Fire Emblem e Final Fantasy antigos, Dark Deity) **ou em 3D**
(Fire Emblem moderno), mais uma passagem de HUD. Não é contradição com o trabalho feito — é
mudança de horizonte, e ela precisa estar escrita antes que alguém leia "definitivo" ao pé da
letra numa sessão futura.

**O que sobrevive intacto:** o `UnitRenderer` de M16 1/N foi construído exatamente como hedge para
isto (D2: "é o que permite uma camada de sprite entrar por cima no futuro sem reescrever o
renderer"), e o teste de contrato com o renderer alternativo prova que a costura não está amarrada
à linguagem de formas de hoje. Uma camada de sprite entra por cima trocando a implementação.

**O que NÃO é resolvido por sprite, e continua sendo trabalho de tabuleiro:** terreno, alvenaria e
portão são o *tile*, não a peça. Distinguir um do outro é contraste de valor, textura e forma, e
nenhuma camada de personagem toca nisso. É exatamente a metade do critério 2 que o usuário reprovou.

**Em aberto:** se o critério 1 ("nenhum arquivo de imagem entra no repositório") continua valendo
como regra permanente ou passa a valer só até a fatia de arte começar; e se o critério 2 é
perseguido agora no desenho programático ou congelado até a arte entrar.

### Personagens no lugar de classes, e a árvore de talentos em duas colunas

Proposta do usuário, ainda não resolvida em spec. O jogo passa a se basear em **personagens**;
a classe continua existindo, mas como **indicação do rumo** do que o personagem faz, não como a
unidade de progressão. E a árvore de talentos deixa de ser "ultra complicada": passa a ter

- **duas colunas principais**, cada uma com **5 a 9 linhas**;
- **convergências ocasionais** em algumas linhas, que deixam o jogador cruzar para a outra coluna;
- na prática **três colunas**, com a terceira existindo só onde há convergência — e mesmo nas
  linhas em que ela aparece, as duas colunas principais continuam oferecendo talento.

**O que isto conflita, e precisa ser resolvido antes de virar código:**

- `docs/spec/06-classes-e-talentos.md` (§8) define a árvore atual e é normativo;
- as árvores das 10 classes vivem **dentro de `packages/data/classes/*.json`** (`classes.schema.ts`),
  e cada `Hero.talents` referencia nós por id — trocar a forma da árvore invalida esse conteúdo;
- `packages/core/src/talents/allocate.ts` (`validateAllocation`, `resetTree`) valida pré-requisitos
  contra a estrutura de hoje, incluindo o `minAwakening` de M14;
- os **build codes** (`apps/client/src/logic/buildCode.ts`) codificam alocação; a mudança quebra
  códigos existentes;
- é **mudança de regra**: `RULES_VERSION` sobe, e replays antigos deixam de validar (§7, anti-cheat).

**A distância é menor do que soa, e isto foi verificado e não estimado.** A árvore do Espadachim
hoje tem **8 linhas**, com `exclusiveWith` formando um par de escolha nas linhas 1, 4 e 7 e nó
único nas demais. Ou seja: a estrutura já é "linhas com ramificação ocasional", já tem `row`,
`maxRank` e exclusão mútua. O que **não** existe é o conceito de **coluna persistente** (hoje a
escolha de uma linha não amarra a escolha da próxima) nem o **nó de convergência**. A mudança é
acrescentar um eixo à estrutura e reautorar as 10 árvores — não reescrever o sistema de talentos.

**Perguntas que preciso responder com o usuário antes de escrever spec:** se a classe ainda resolve
stats base e skills ou vira só rótulo; se cada personagem tem árvore própria ou herda a da classe;
se o jogador escolhe uma coluna e a convergência é a exceção, ou se pode alternar livremente; e
qual é o orçamento de pontos.

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

### M10 — sub-sessão 6/N: efeitos `special` de set (§7.4)

Item nomeado no roadmap de M10 ("efeitos `special` de set (§7.4)"). Até aqui os quatro
sets que §7.4 marca em negrito — os que "atacam diretamente a economia de recursos" e são
"o principal contrapeso a builds de `spd`" — eram **mecanicamente inertes**:
`resolveSetBonuses` (M4) descartava todo `effect.t !== 'stat'`, e nada levava um efeito
comportamental de equipamento até o duelo ou a batalha.

- **Encanamento novo, em uma função só.** `resolveSetSpecialEffects` (`items/sets.ts`) é o
  espelho de `resolveSetBonuses`: mesma contagem de peças, mesmo limiar lido do dado
  (`effect.pieces`, não fixado em 4), mas devolve `effectId`s em vez de `StatModifier`s. O
  resultado desce por `HeroCombatProfile.setSpecialEffectIds` → `BattleUnit` →
  `DuelParticipant`. Nos dois últimos o campo é **opcional**, mesmo precedente de
  `aiArchetype`: as unidades self-contained de M2–M6, as fixtures de teste e o formato que
  `sim-cli` lê não têm equipamento resolvido; ausente = nenhum efeito special. Em
  `HeroCombatProfile` é obrigatório, porque ali sempre há equipamento pra resolver.
- **Os ids são do MOTOR, não conteúdo livre.** `SET_SPECIAL_DUELISTA` e companhia vivem em
  `packages/core/src/items/sets.ts` com prefixo `set-special:`, mesma categoria de
  `BASIC_ATTACK_SKILL` (regra de motor, não número de balanceamento). `packages/data` repete
  as strings porque não depende de `@paths-beyond/core` — o mesmo espelhamento que `ItemSet`
  e `EffectDef` já fazem. O que impede as duas cópias de divergirem em silêncio (uma
  divergência deixaria o set inerte de novo, sem erro nenhum) é um teste explícito em
  `packages/data/tests/authorContent.test.ts` travando os 4 valores.
- **Duelista — leitura mais ampla que a letra, de propósito.** §7.4 diz "Contra-atacar custa
  0 PP na primeira troca", mas o core não pode fixar o id `skill-contra-atacar` (regra 4:
  conteúdo vive em `packages/data`). Implementado como *a reação `onAttacked` da troca 1
  custa 0 PP*. Na prática é a mesma coisa: pela lista fechada de §6.4, as reações
  `onAttacked` universais são exatamente Contra-atacar e Defender.
- **A gratuidade de Duelista não consome o teto de 1 PP por troca.** O teto de §6.4 é sobre
  PP *gasto*, e uma reação que custa 0 não gasta nada. O que continua garantindo no máximo
  uma reação por troca é `reactionLog` (M10 sub-sessão 5/N), não o orçamento de PP — então
  o comportamento não muda, mas a razão é outra e vale estar escrita.
- **Imunidade — barra ANTES da rolagem de chance.** Imunidade não é resistência (`efr`), não
  há o que rolar: o debuff simplesmente não entra. Implementado sobre quem RECEBE o efeito
  (não sobre quem aplica) e só para `kind: 'debuff'`; buff passa normalmente, inclusive o
  que o atacante aplica em si mesmo. Consequência que virou teste: com o debuff barrado, o
  gatilho `onDebuffed` da sub-sessão 5/N **não** dispara — não houve debuff.
- **Reserva "+1 AP máximo" = +1 AP inicial (decisão do usuário).** Este motor não tem teto de
  AP em runtime — `rest`/`wait` somam sem clamp, e `startingAp` é só o pool com que a unidade
  entra na batalha. A alternativa (criar um cap real, com clamp em toda recuperação) seria
  regra nova afetando o roster inteiro, não só quem usa o set, e exigiria rebalanceamento
  junto. O bônus é cumulativo com o `maxAp` de talento (§8.2), pelo mesmo caminho.
- **Reserva "`rest` recupera +2 AP" = 2 no total, não 1+2.** §5.4 dá +1 AP e +1 PP; o set
  substitui o ganho de AP por 2. O PP não é citado por §7.4 e continua em +1. A
  pré-condição de movimento de §5.4 não muda — o set mexe no ganho, não no gate. `wait`
  também não muda, porque §7.4 só cita `rest`.
- **Sentinela é o único cujo escopo é o ROUND, não o duelo** — daí o campo novo
  `BattleState.freeAssistUsedThisRound`, zerado por `endRound` junto de
  `distanceMovedThisTurn`. Um detalhe deliberado: a janela só é marcada como consumida se
  ela de fato pagou alguma coisa — uma assistência que já custava 0 PP não gasta a
  gratuidade. `AssistResult` ganhou `freePp` pra a camada de batalha saber o que não debitar
  (`resolveDuel` decide quem assiste, mas quem mexe no pool do assistente é `applyEngage`).
- **Um mecanismo só para Duelista e Sentinela:** `SelectReactionInput.freePp` +
  `effectivePpCost(skill, freePp)`, exportado de `reactions.ts` para que quem *decide* e
  quem *cobra* usem exatamente o mesmo número. Sem isso, uma reação poderia ser escolhida
  como gratuita e debitada como paga.
- **Conteúdo autorado, mas ninguém equipa (decisão do usuário).** Os 4 sets existem como
  JSON válido em `packages/data/item-sets/` (gerados por `authorContent.ts`), e nenhum item
  pertence a eles — nenhum comp de balanceamento os equipa. É o que mantém `pnpm balance`
  numericamente idêntico à sub-sessão 4. Equipá-los é fatia própria: a sub-sessão 4 mostrou
  que mexer no equipamento dos comps quebra o teto de 65% de M8, e misturar mecânica nova
  com rebalanceamento tornaria impossível atribuir a causa de qualquer mudança de winrate.
  Mesma categoria de gap consciente da sub-sessão 5/N, e agora são dois acumulados —
  candidato natural a uma fatia "conteúdo real usa o que M10 construiu".

**Nenhum número de balanceamento se moveu** (`pnpm balance -- --runs 10000`, rodado como
verificação e não como calibração): winrate global de 26,2% (Couraçado) a **63,5%**
(Espadachim), **22,4%** das unidades vencedoras com `spd` acima da mediana, 17 hard
counters — **byte a byte o mesmo relatório da sub-sessão 4**, o que é o resultado correto:
nenhuma unidade de conteúdo real tem um efeito `special` ativo. Os dois critérios de aceite
raiz de M8 continuam batendo. `GOLDEN_HASH` intacto pelo mesmo motivo (`pnpm test:browser`,
42 testes, 3 engines). `RULES_VERSION` `0.6.0`→`0.7.0` — a mudança de regra é real mesmo sem
ser observável nestes dois lugares.

Testes novos: 7 em `items/sets.test.ts` (limiar de peças; limiar lido do dado e não fixado
em 4; `stat` e `special` não vazam um para o outro; set misto resolvendo os dois limiares;
dois sets simultâneos; set desconhecido), 4 em `hero/combatProfile.test.ts`
(`setSpecialEffectIds` vindo do equipamento; Reserva no `startingAp`; cumulativo com o
talento `maxAp`; 3 peças não bastam), 13 em `duel/setSpecial.test.ts` (novo — Duelista com
PP zerado na troca 1 e não nas trocas 2/3, sem debitar PP, sem mudar nada além do custo
quando há PP; Imunidade barrando na troca 1 e deixando passar na 2, não bloqueando buff,
não disparando `onDebuffed`, não interferindo em `onDamaged`; determinismo dos dois) e 12
em `battle/setSpecial.test.ts` (novo — `rest` com e sem Reserva, gate de movimento
preservado, `wait` inalterado; Sentinela grátis na primeira assistência do round, cobrada
na segunda, devolvida no round seguinte, sem debitar PP, marcando só quem usou;
determinismo). `pnpm test` (**686 testes, 62 arquivos** — +41 sobre a sub-sessão 5),
`pnpm typecheck` (7 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data`
(17 schemas, **72 arquivos** — +4, os sets novos). Pendente do restante do roadmap de M10:
cura de assistência/skill (fórmula nova, checkpoint pendente com o usuário), `onLethal`
como gatilho de morte (encaminhamento da sub-sessão 5/N), e conteúdo real usando o que M10
construiu — os gatilhos novos E os sets `special`, os dois gaps acumulados.

### M10 — sub-sessão 7/N: cura de assistência e de skill

Último item nomeado no roadmap de M10 ainda aberto ("dano **e cura** de assistência
aplicados a HP de verdade"). O dano saiu na sub-sessão 2; a cura ficou parada desde então
por um motivo que não era de escopo: **a spec não define fórmula de cura em lugar nenhum.**
As três únicas menções são não-normativas — §2 lista `heal` como "cura dada/recebida, %"
(percentual sobre uma base que ninguém define), §6.4 cita "Cura de emergência" entre as
reações que classes e talentos adicionam, e §6.5.3 diz que assistir aplica "cura/buff em
efeito integral" sem dizer integral de quê.

- **Fórmula (decisão do usuário):** `cura = fpMul(base, FP_SCALE + heal_do_curador)`, onde
  `base = fpMul(stat_de_scalesWith_do_curador, skill.multiplier) + skill.flat`. É a forma
  dos passos 1-2 de §6.6 e nada além: **sem** mitigação por `def` (mitigar cura não
  significa nada), sem triângulo de armas, sem posicional. Reusa `multiplier`/`flat`/
  `scalesWith`, que toda `SkillDef` já tem — zero campo novo em `packages/data`, zero número
  mágico novo no core, e a magnitude de cada cura fica em dados (regra 4). Escala com o
  build de quem cura, então equipar um curador importa e o stat `heal` deixa de ser inerte.
- **Sem crítico e sem variância (decisão do usuário):** cura é determinística. Alinha com o
  pilar de previsibilidade ("o algoritmo é literal; previsibilidade é o produto") — quem
  monta o script tático consegue saber se a cura salva o aliado — e não consome stream de
  RNG novo dentro do duelo.
- **O stat `heal` entra UMA vez, do lado de quem cura.** §2 o chama de "cura
  dada/recebida", mas aplicá-lo também do lado de quem recebe dobraria o mesmo stat na
  mesma conta. Leitura levada ao usuário junto da fórmula e aprovada com ela.
- **A tag `heal` é o discriminador, não um campo novo.** Uma skill cura quando declara
  `tags: ['heal']`. Precedente direto: `combinedTypeDamageMultiplier` já interpreta
  `skillTags` ('physical', 'armored') dentro do motor, e o comentário de corte de
  `assist.ts` (sub-sessão 2) já usava essa convenção por escrito. `SkillDef` fica intacta.
- **Três caminhos, um `computeHeal` só:**
  1. **Assistência de cura** (§6.5.3, o item do roadmap) — mira o **aliado duelista**, alvo
     que o motor não tinha: `applyAssistDamage` só sabia mirar o inimigo. "Efeito integral"
     é lido literalmente: a cura **não** leva o `ASSIST_DAMAGE_MULTIPLIER` de 50% que o dano
     leva. `AppliedAssistResult` ganhou `healDone`; quem aplica ao HP é `resolveDuel`, único
     lugar que sabe quem é o aliado e qual o HP máximo dele.
  2. **Skill de duelo com a tag** — num 1v1 não existe aliado pra mirar, então o único alvo
     coerente é o próprio ator (auto-cura). Cai no mesmo ramo das skills sem dano, sem
     rolagem de acerto: não há o que "errar" curando a si mesmo.
  3. **Reação com a tag** ("Cura de emergência", §6.4) — cura o reagente. Exigiu ramo novo:
     `resolveExchange` classificava reação por `multiplier === 0 && flat === 0` (Defender)
     senão contra-ataque, então uma cura (que tem `multiplier > 0`) viraria dano. A ordem
     agora é cura → Defender → contra-ataque, e vale igual nos três gatilhos — reagir a ter
     levado dano curando-se é justamente o caso que §6.4 descreve.
- **Bordas:** cura nunca passa de `stats.hp` e **não ressuscita** — alvo em 0 continua em 0,
  mesmo precedente já adotado por `applyPeriodicHp` (`battle/round.ts`) para regeneração.
  `heal` negativo o bastante zera a cura em vez de virar dano.
- **`lifesteal` continua inerte** — stat declarado em `stats/types.ts` que nenhuma linha do
  motor lê. Não está nomeado no roadmap de M10; fica registrado aqui como ponta solta
  conhecida, candidata a M12 junto do resto da autoria de conteúdo.
- **Nenhum conteúdo real ganhou a tag `heal`.** Autorar uma skill de cura e dá-la a uma
  classe é escopo declarado de M12 ("skills que usam os efeitos de M10") e mexeria no
  balanceamento. Fixtures em teste, como a regra de `packages/data` exige.

**Nenhum número de balanceamento se moveu** (`pnpm balance -- --runs 10000`, rodado como
verificação): winrate global de 26,2% (Couraçado) a 63,5% (Espadachim), 22,4% das unidades
vencedoras com `spd` acima da mediana, 17 hard counters — **o mesmo relatório das
sub-sessões 4 e 6**, que é o resultado correto: nenhuma skill do catálogo real declara a
tag `heal`. Os dois critérios de aceite raiz de M8 continuam batendo. `GOLDEN_HASH` intacto
(`pnpm test:browser`, 42 testes, 3 engines). `RULES_VERSION` `0.7.0`→`0.8.0`.

Testes novos: 14 em `duel/heal.test.ts` (a tag como discriminador; multiplier × stat +
flat; escala com o stat do curador; `heal` como bônus percentual; `heal` negativo não vira
dano; cura só-flat ignora o build; determinismo; truncamento; e as bordas de `applyHeal` —
soma, cap no HP máximo, não ressuscita, cura 0) e 16 em `duel/healInDuel.test.ts` (novo —
assistência de cura mira o aliado e não o inimigo, não sofre o corte de 50%, não causa
dano, assistência ofensiva segue com `healDone` 0, cura do lado do defensor, cap no HP
máximo, determinismo; auto-cura de skill de duelo com valor batendo com `computeHeal`, o
stat `heal` aumentando a cura, skill de dano seguindo com `heal` 0; reação de cura curando
em vez de contra-atacar, atacante não levando contra-dano, PP gasto normalmente, reação de
dano seguindo com `healDone` null, determinismo). O fixture `assistHealSkill` de
`assist.test.ts` saiu de `multiplier: 0` para `1000`: com cura inexistente ele só afirmava
"não causa dano", e agora prova o caminho integral. `pnpm test` (**716 testes, 64
arquivos** — +30 sobre a sub-sessão 6), `pnpm typecheck` (7 pacotes, limpo), `pnpm lint`
sem alteração, `pnpm validate:data` (17 schemas, 72 arquivos — fatia não mexeu em
conteúdo).

**Com esta fatia acabam os itens nomeados de M10**, exceto `onLethal` (adiado por decisão
de design do usuário na sub-sessão 5/N). Os 3 critérios de aceite formais de M10 já batiam
desde a sub-sessão 4. Duas pontas soltas conhecidas, nenhuma delas escopo de M10:
`lifesteal` inerte, e `sim-cli`/`DuelPreviewPanel` sem exibir cura no log troca a troca (o
motor registra `heal` e `reaction.healDone`; exibir é trabalho de UI).

### M10 — sub-sessão 8/N: `onLethal` como gatilho de morte (fecha os itens de M10)

Último item nomeado no roadmap de M10 ("gatilhos de reação além de `onAttacked`
(`onDamaged`, `onLethal`)"). `onDamaged`/`onDebuffed` saíram na sub-sessão 5/N; `onLethal`
ficou aberto lá por decisão de design do usuário, não por falta de tempo — **como linha de
script ele implicaria prever a própria morte** ("não é interessante conseguir prever quando
for morrer"). O encaminhamento registrado naquela sub-sessão era: implementar como passiva
que dispara AO MORRER. É o que esta fatia faz. Com ela o enum `ReactionTrigger` de §6.4
fecha: as 5 variantes têm resolução.

- **Não é uma reação, e por isso não passa por `selectReaction`.** Uma reação é uma DECISÃO
  (script ordenado + conditions + custo de PP); o gatilho de morte é uma CONSEQUÊNCIA
  automática de um evento. Sem linha no `reactionScript`, sem conditions, sem PP — basta a
  skill estar entre as `knownSkills`. É a diferença de mecanismo que a sub-sessão 5/N já
  tinha identificado.
- **Duas variantes, discriminadas pela tag `survive` (decisão do usuário).** Com a tag:
  previne a morte, a unidade fica com `LETHAL_SURVIVE_HP = 1` (o golpe é truncado, não
  anulado). Sem a tag: a morte acontece e a skill acerta **quem deu o golpe fatal** — dano
  calculado como um contra-ataque (crítico e variância próprios, streams `lethal-crit` e
  `lethal-damage-variance`) **e** os `skill.effects` dela aplicados no matador. Mesmo
  precedente de discriminação por tag da sub-sessão 7/N (`heal`) e de
  `combinedTypeDamageMultiplier`: zero campo novo pra dizer o que a skill faz.
- **Os `skill.effects` do gatilho de morte SÃO aplicados** — ao contrário do corte de
  reação/assistência (sub-sessão 1/N), preservado. Sem isso a variante "efeito ao morrer"
  seria só "exploda causando dano", e o caso que o usuário descreveu ("pra fazer algum
  efeito", uma maldição no matador) não existiria. Stream de RNG próprio
  (`lethal-effect-application:*`): adicionar uma rolagem em um sistema não pode deslocar as
  de outro, e sem o prefixo próprio a aplicação de efeito da skill do ator e a do gatilho
  de morte dele dividiriam o mesmo stream.
- **Frequência declarada no DADO, não no motor — `SkillDef.lethalUses`.** Resposta do
  usuário: "varia de skill pra skill dependendo do efeito". `perDuel` é estado local de
  `resolveDuel` e recarrega a cada duelo; `perBattle` atravessa duelos, persistido em
  `BattleUnit.lethalTriggersUsed` pelo mesmo caminho de `finalActiveEffects*`. A
  alternativa considerada e descartada era reusar `skill.cooldown`: **hoje nada escreve
  cooldown de volta** — nem as skills de duelo normais põem cooldown após o uso, só
  `endRound` decrementa — então usar esse campo exigiria abrir um caminho de escrita novo e
  levantaria um bug pré-existente que não é de M10. O motor mantém um default (`perDuel`, o
  escopo conservador), mas o schema Zod **exige** o campo quando o trigger é `onLethal` e o
  **rejeita** quando não é: um escopo omitido mudaria o poder da skill inteira em silêncio,
  que é o tipo de número invisível que a regra 4 proíbe.
- **Onde cada variante pode disparar — derivado do que a skill faz, sem campo novo.** Esta é
  a segunda metade da resposta do usuário sobre alcance ("também vai depender do que a skill
  faz"). A variante de dano precisa de um matador identificável, então **não** dispara em
  morte por dano de assistência (quem assiste não é participante do duelo) nem no tick de
  DoT de `battle/round.ts` (o veneno não é um matador). A variante `survive` dispara em
  qualquer morte. Fora do duelo há um filtro a mais: só `perBattle` — `perDuel` não tem
  duelo a que se limitar, e sem esse corte uma skill `perDuel` seria imunidade permanente a
  DoT.
- **Um ponto de passagem só.** Existiam **quatro** lugares fazendo `Math.max(0, hp - dano)`
  (golpe principal, contra-ataque e as duas assistências); todos passam agora por
  `applyDamageWithLethalTrigger`, pra o gatilho não depender de por qual caminho o dano
  veio. Um quinto caminho, o tick de DoT, ficou em `round.ts` porque ali não há duelo nem
  matador — mas usa a mesma `findLethalTriggerSkill`.
- **O gatilho NÃO encadeia.** Se o dano da variante "efeito ao morrer" matar o matador, o
  gatilho DELE não dispara. Chamar o helper recursivamente ali seria um laço sem fim entre
  duas unidades com o gatilho, e "morrer da explosão de quem você matou" já é a consequência
  pretendida.
- **Piso de uma vez por duelo, mesmo em `perBattle`.** Sem ele, `survive` seria
  imortalidade: as 3 trocas de §6.1 dariam 3 sobrevivências. Na prática uma unidade que
  sobrevive com 1 HP morre na troca seguinte — o que é o desenho, não um efeito colateral.
- **`findLethalTriggerSkill` devolve UMA skill, escolhida por ordem lexicográfica de id.**
  A ordenação é obrigatória por determinismo: a ordem de iteração de um `Record` é a de
  inserção, que varia conforme quem montou as `knownSkills` (cliente, servidor, `sim-cli`),
  e os três precisam produzir bytes idênticos. Também é o que implementa literalmente o "no
  máximo uma passiva" da formulação do usuário.
- **`LethalTriggerLog` fica em `DuelResult`, não em `ActionLogEntry`.** Nem todo disparo
  acontece dentro de uma troca: a janela de assistências (§6.5) também mata, e ali não
  existe ação de troca a que anexar o registro — daí `trocaNumber: 1|2|3|null`.
- **`lethalTriggersUsed` só é escrito quando há o que escrever** (`lethalTriggersPatch` em
  `commands.ts`, spread condicional em `round.ts`). Gravar lista vazia em toda unidade que
  duela ou a todo round mudaria o estado serializado — e o hash de replay — sem nenhuma
  mudança de regra por trás.
- **Nenhuma skill do catálogo real declara `trigger:'onLethal'`.** Gap consciente, o
  terceiro acumulado (gatilhos da sub-sessão 5/N, sets `special` da 6/N, tag `heal` da 7/N):
  autorar conteúdo em cima dos efeitos de M10 é escopo declarado de M12, e daria início a um
  ciclo de rebalanceamento próprio. Há teste em `packages/data` travando essa afirmação.

`RULES_VERSION` `0.8.0`→`0.9.0`. **Nenhum número de balanceamento se moveu**
(`pnpm balance -- --runs 10000`): Espadachim 63,5% … Couraçado 26,2%, `spd` em 22,4%, 17
hard counters — **o mesmo relatório das sub-sessões 4, 6 e 7**, que é o resultado correto,
já que nada no catálogo tem o trigger. `GOLDEN_HASH` intacto (`pnpm test:browser`, 42
testes, 3 engines).

Testes novos: 14 em `duel/lethal.test.ts` (classificação por trigger e por tag; a tag sem o
trigger não faz nada; default de `lethalUses`; a busca ignorando skill já usada e skill em
cooldown; `requireSurvive` e `requirePerBattle` filtrando; determinismo contra a ordem de
inserção do `Record`; o filtro de persistência mantendo só `perBattle`, descartando id sem
dono e não duplicando), 19 em `duel/lethalInDuel.test.ts` (controle sem gatilho morrendo;
sobrevivência ao golpe principal, ao contra-ataque e ao dano de assistência; HP exatamente
1; disparo único por duelo; não disparar em dano não-letal nem com a skill já usada; a
variante de dano matando e ferindo o matador, aplicando efeitos nele, não encadeando e não
disparando no caminho sem matador; `perBattle` saindo no resultado e `perDuel` não;
determinismo nas duas variantes) e 10 em `battle/lethalOnMap.test.ts` (novo — tick de DoT
letal com e sem gatilho, disparo único entre rounds, `perDuel` e a variante de dano não
disparando fora do duelo, tick não-letal; e a persistência nos dois sentidos: o que o duelo
gasta volta pro mapa, o que o mapa já gastou impede o duelo de disparar, `perDuel` não
persistindo, e duelo e tick compartilhando o mesmo estado de uso), mais 4 em
`packages/data/tests/authorContent.test.ts` (schema aceitando os dois escopos, rejeitando
`onLethal` sem `lethalUses` e `lethalUses` sem `onLethal`, e travando que nenhuma skill do
catálogo usa o trigger). `pnpm test` (**763 testes, 67 arquivos** — +47 sobre a sub-sessão
7), `pnpm typecheck` (7 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data`
(17 schemas, 72 arquivos).

**Com esta fatia acabam TODOS os itens nomeados no roadmap de M10**, e os 3 critérios de
aceite formais batem desde a sub-sessão 4. Pontas soltas conhecidas, nenhuma delas escopo
de M10: `lifesteal` inerte; `sim-cli`/`DuelPreviewPanel` sem exibir cura nem gatilho de
morte no log troca a troca (o motor registra `heal`, `reaction.healDone` e
`lethalTriggers`; exibir é trabalho de UI); e nenhum conteúdo real usando os efeitos de M10
(M12).

## M11 — Objetivos de mapa e Valor

### M11 — sub-sessão 1/N: as 4 condições de vitória além de `rout` (§5.7)

Primeira fatia de M11, escolhida por ser a mais autocontida das três frentes do milestone
(as outras: `mapSkill` em área e catálogo real de `valor-skills`) — uma função pura de
estado, zero conteúdo novo, zero campo novo em `SkillDef`. É também a que destrava o
problema que o roadmap nomeia: **sem ela todo mapa da campanha é obrigatoriamente "mate
todo mundo"**. `WinCondition` tinha as 5 formas no tipo (core) e no Zod (`packages/data`)
desde M3, e só `rout` tinha checagem.

§5.7 é uma linha e meia — *"Data-driven por mapa: `rout`, `seize`, `survive N rounds`,
`escort`, `defend`. Permadeath é flag do `BattleSetup`"* — e **não define nenhuma das
cinco**. As leituras abaixo foram decididas com o usuário antes de qualquer código.

- **`defend` ganhou `target` no schema (decisão do usuário).** Os dois schemas existentes
  eram `defend: {rounds}` e `surviveRounds: {n}` — sem nada que os diferenciasse, `defend`
  seria um alias, e o critério de aceite pede 4 condições NOVAS. Agora é o clássico do
  gênero: segure `rounds` rounds **e** não deixe inimigo pisar no tile. Derrota imediata se
  um inimigo vivo ocupa o alvo, e ela **decide antes da contagem** — cumprir os N rounds
  não desfaz o tile tomado. Dá também uma razão de ser ao arquétipo `guard-tile` de §9.1,
  que existe desde M7 sem objetivo a guardar. Mudança no tipo `WinCondition` e no
  `maps.schema.ts`; nenhum dado real precisou migrar, porque os 4 mapas usam `rout`.
- **Perder o escoltado é derrota imediata (decisão do usuário).** Sem isso `escort` seria
  só um `seize` que exige uma unidade específica — não há tensão em escoltar alguém que
  pode morrer sem consequência. Um `unitId` que não existe no mapa também resolve como
  derrota: é erro de conteúdo, e a alternativa (ficar `ongoing` para sempre) seria uma
  partida sem desfecho possível, pior de diagnosticar.
- **`seize` = QUALQUER unidade viva do jogador sobre o tile (decisão do usuário).** É
  exatamente o que separa `seize` de `escort`: lá a unidade é nomeada pelo próprio schema.
  Evita inventar um conceito de "comandante/lorde" que a spec não tem em lugar nenhum.
- **Eliminar o time inimigo NÃO vence mais um mapa cuja condição declarada é outra.** Esta
  é a única quebra de comportamento da fatia, e é deliberada: "data-driven por mapa" lido
  ao pé da letra significa que a condição declarada é a única via de vitória. Antes,
  `checkWinCondition` devolvia `victory` sempre que o time inimigo acabava, ignorando a
  condição — o que tornaria `seize`/`escort` decorativos em qualquer mapa com inimigos
  finitos. Decisão minha, registrada aqui em vez de perguntada (regra 13 permite as duas
  vias), e sem efeito em nada existente: todo conteúdo real e o replay canônico usam
  `rout`, cujo ramo é idêntico ao de antes. **A derrota por não ter unidade viva continua
  universal** — essa não vem da condição, é a partida deixando de existir.
- **`surviveRounds`/`defend` usam `state.round > n`.** `round` é o round CORRENTE e só vira
  `n+1` quando o round `n` fecha em `endRound`, então `>` é literalmente "sobreviveu aos n
  rounds". Nenhum campo de estado novo: a contagem já existia.
- **`checkWinCondition` saiu de `round.ts` para `winCondition.ts` próprio.** Eram 3 linhas
  e viraram 5 ramos com regras próprias; `round.ts` já carregava `isRoundComplete`,
  `endRound` e o tick periódico. `round.ts` reexporta o símbolo, então `simulate.ts` e
  `aiTurn.ts` não mudaram uma linha.

`RULES_VERSION` `0.9.0`→`0.10.0`. **Nenhum número de balanceamento se moveu**
(`pnpm balance -- --runs 10000`): Espadachim 63,5% … Couraçado 26,2%, `spd` em 22,4% — o
mesmo relatório das sub-sessões 4/6/7/8 de M10, que é o esperado, já que o torneio roda em
mapas `rout`. `GOLDEN_HASH` intacto (`pnpm test:browser`, 42 testes, 3 engines).

Testes novos: 24 em `battle/winConditions.test.ts` (novo — a derrota universal valendo para
as 5 condições; `rout` intacto e o teste explícito de que eliminar o inimigo NÃO vence
outra condição; `seize` com unidade viva/morta/inimiga sobre o tile; `surviveRounds` nos
três estados de contagem; `escort` com o VIP longe, com outra unidade sobre o alvo, com o
VIP no alvo, com o VIP morto e com `unitId` inexistente; `defend` nos dois eixos — contagem
e ocupação do tile, incluindo inimigo morto sobre ele e unidade do jogador sobre ele; **uma
batalha completa terminando por cada uma das 4 condições novas** via
`buildInitialState`/`applyCommandAndAdvance`, que é o critério de aceite literal; e
determinismo das 4) e 4 em `packages/data/tests/validate.test.ts` (as 5 formas aceitas pelo
schema, `defend` sem `target` rejeitado, as demais rejeitadas sem os campos que a resolução
exige, e os 4 mapas reais travados em `rout`). `pnpm test` (**791 testes, 68 arquivos** —
+28), `pnpm typecheck` (7 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data`
(17 schemas, 72 arquivos).

Pendente do resto de M11: **`mapSkill` com alvo em área** (§5.4 — `applyMapSkill` hoje
aplica efeito só em `target:'self'`, com o comentário "alvo em área não suportado em M3";
exige campo de raio, que a spec não define) e **catálogo real de `valor-skills`** resolvido
por `useValor` (hoje o comando ignora o `skillId` e debita um custo fixo de 1;
`packages/data/valor-skills/` não existe e o `ContentCatalog` não carrega valor-skills —
os 4 `kind` do schema, em especial `summonReinforcement`, precisam de decisão de design
própria). Autorar mapas de campanha com objetivos variados é escopo declarado de M12 (§10).

### M11 — sub-sessão 2/N: `mapSkill` com alvo em área (§5.4)

Segunda das três frentes de M11, escolhida antes de `valor-skills` porque o `kind:'artillery'`
do schema de Valor é literalmente dano em área: construir a mira de área primeiro torna a
fatia de Valor mais barata, e a ordem inversa seria trabalho duplicado.

Estado anterior: `applyMapSkill` **ignorava `cmd.target` por completo** — a coordenada vinha
no `BattleCommand` desde M3 e nunca foi lida — e aplicava efeito só em `target:'self'`, com
o comentário `// alvo em área não suportado em M3`. Não causava dano nem cura em ninguém.
§5.4 dá uma linha sobre a ação (*"Usa skill de mapa (cura em área, artilharia, buff de
zona). Custa AP."*) e nada mais; as três decisões abaixo foram tomadas com o usuário.

- **Quem a área atinge é DERIVADO do que a skill faz, sem campo novo (decisão do usuário).**
  Tag `heal` → cura os ALIADOS no raio ("cura em área"); componente de dano → acerta os
  INIMIGOS ("artilharia"); e cada `skill.effects` escolhe o lado pelo `EffectDef.kind` que
  já existe desde M1 — buff → aliados, debuff → inimigos ("buff de zona"). Os três exemplos
  nomeados por §5.4 saem exatamente disso, sem `areaTargets` declarado. O
  `EffectApplication.target` ganhou a leitura natural que faltava: `'self'` = só o lançador
  (comportamento de M3, preservado inclusive no stream de RNG), `'target'` = a área. A
  alternativa descartada (`areaTargets: 'allies'|'enemies'|'all'`) só ganharia expressividade
  no caso da bomba que fere os dois lados, ao custo de um campo que o autor de conteúdo pode
  declarar incoerente com o resto da skill. Mesmo padrão das tags `heal` (M10 7/N) e
  `survive` (M10 8/N).
- **Alcance de lançamento reusa `skill.duelRange` (decisão do usuário).** Em `kind:'map'`
  ele passa a significar "a que distância do lançador o centro da área pode estar"; ausente,
  herda o `duelRange` da unidade — a mesma herança que a skill de duelo já segue. Não havia
  colisão de sentido: `duelRange` em uma skill de mapa não significava nada antes. Sem esta
  checagem o `target` seria só o centro da área e artilharia acertaria qualquer canto do
  mapa do próprio spawn.
- **Sem rolagem de acerto e sem crítico, com variância (decisão do usuário).** Reusa
  `computeDamage` inteiro (mitigação por `def`, triângulo de armas, `damageDealtPct` do
  lançador e `damageTakenReduction` do alvo, variância de ±3%) mas não rola acurácia —
  artilharia não "erra" um tile — nem crítico, que §6.6 passo 7 descreve como conceito da
  troca de duelo. Posicional fica em `FP_SCALE`: flanco/cerco/altura são modificadores de
  `engage` (§5.5) e não existem fora do duelo. Cura em área usa `computeHeal`, já
  determinística por decisão de M10, então o mesmo valor cai em todos os alvos.
- **`SkillDef.areaRadius` é OPCIONAL, ao contrário de `lethalUses`.** Raio em distância
  Manhattan (§5.1 fixa a métrica — não é decisão de design), ausente/0 = só o tile alvo.
  Omitir é o caso conservador, e uma skill de mapa de alvo único é legítima; o schema Zod
  só **rejeita** `areaRadius` fora de `kind:'map'`, onde seria um número inerte.
- **Stream de RNG por ALVO.** A variância usa `mapskill-variance:<unitId>` e a aplicação de
  efeito em área usa `mapskill-area:<effectId>:<unitId>`. Dois inimigos idênticos na mesma
  área não podem dividir a mesma rolagem — levariam exatamente o mesmo dano sempre, e há
  teste afirmando que não levam. O stream de `target:'self'` (`mapskill:<effectId>`) ficou
  **intocado**, então nenhum replay existente muda de resultado.
- **Ordem dos alvos é a da iniciativa fixa (§5.3)**, não a do array `state.units` — mesma
  escolha de `buildAssistCandidates` (M3): a ordem de montagem do array não tem garantia
  nenhuma, e cliente, servidor e `sim-cli` precisam produzir bytes idênticos.

`RULES_VERSION` `0.10.0`→`0.11.0`. **Nenhum número de balanceamento se moveu**
(`pnpm balance -- --runs 10000`): Espadachim 63,5% … Couraçado 26,2%, `spd` em 22,4% — o
torneio não emite `mapSkill` e nenhuma skill do catálogo declara `areaRadius`. `GOLDEN_HASH`
intacto (`pnpm test:browser`, 42 testes, 3 engines).

Testes novos: 21 em `battle/mapSkillArea.test.ts` (novo — `unitsInArea` com o alvo
exatamente no raio, um a mais fora, raio 0, mortos ignorados e ordem de iniciativa;
artilharia **atingindo mais de uma unidade**, que é o critério de aceite literal, poupando
quem está fora do raio, os aliados e o próprio lançador, gastando AP uma vez só e não
levando ninguém abaixo de 0 HP; cura em área curando aliados e não inimigos, com cap de HP
máximo e sem ressuscitar; buff caindo nos aliados e debuff nos inimigos pelo `kind`;
`target:'self'` continuando só no lançador; alcance de lançamento rejeitando alvo distante,
aceitando o limite exato e herdando o da unidade quando a skill não declara; AP insuficiente
rejeitando antes de qualquer efeito; e os dois testes de determinismo) e 5 em
`packages/data/tests/authorContent.test.ts` (raio aceito em skill de mapa e ausente,
raio 0 válido, raio negativo rejeitado, raio fora de `kind:'map'` rejeitado, e nenhuma skill
do catálogo declarando o campo ainda). `pnpm test` (**817 testes, 69 arquivos** — +26),
`pnpm typecheck` (7 pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data`
(17 schemas, 72 arquivos).

Pendente de M11: **catálogo real de `valor-skills` resolvido por `useValor`** — o comando
ignora o `skillId` e debita custo fixo de 1; `packages/data/valor-skills/` não existe e o
`ContentCatalog` não carrega valor-skills; os 4 `kind` do schema precisam de decisão
própria, e `summonReinforcement` esbarra em §5.3 ("unidades que entram depois são inseridas
na posição correspondente ao seu valor de iniciativa" — a lista é calculada uma vez e nunca
recalculada). Autorar mapas e skills de área reais é escopo declarado de M12 (§10).

### M11 — sub-sessão 3/N: `valor-skills` resolvidas de verdade por `useValor` (§5.6)

Terceira e última frente nomeada de M11. Estado anterior: `applyUseValor` **ignorava o
`skillId`** e debitava um custo fixo de 1 sem aplicar efeito nenhum; `packages/data/valor-skills/`
**não existia** (só a pasta de fixtures); o `ContentCatalog` não carregava valor-skills; e o
`payload` no Zod era `z.record(z.string(), z.unknown())`, solto desde M3 porque nenhum
`kind` tinha resolução.

- **`summonReinforcement` fica sem resolução (decisão do usuário).** Invocar exige um
  blueprint completo de `BattleUnit` — stats, scripts, `knownSkills` — que hoje só
  `resolveHeroCombatProfile` + `assembleBattleUnit` sabem montar a partir de um `Hero` +
  catálogo, e `packages/core` não pode importar conteúdo (regra 1). Além disso é o único
  ponto do motor que mexeria na lista de iniciativa: §5.3 manda inserir a unidade nova "na
  posição correspondente ao seu valor de iniciativa", o que é permitido (inserir ≠
  recalcular) mas colide de perto com a regra 9. Os outros três kinds fecham o critério de
  aceite com folga. **O comando rejeita alto** (`reason` nomeando o kind) em vez de gastar
  Valor em silêncio — há teste afirmando que o saldo não se move.
- **`artillery` = dano fixo do payload, mitigado por `def` (decisão do usuário).** Entra em
  `computeDamage` como `flat` com `multiplier: 0`, então a mitigação de §6.6 (passos 2-4), a
  redução de dano do alvo (passo 8) e a variância (passo 9) continuam valendo — mesma
  família de números do resto do jogo, e um Couraçado continua duro contra artilharia. **Sem
  triângulo de armas** (Valor não empunha arma), **sem crítico** e **sem posicional**: não há
  lançador de quem herdar nada, e os três exigiriam inventar uma origem. As alternativas
  descartadas eram dano cru (criaria uma segunda família de números que o `pnpm balance` não
  sabe comparar com nada) e dano derivado do `cost` (fórmula que a spec não insinua e que
  tira do autor de conteúdo o controle que a regra 4 manda dar).
- **Registrado sem perguntar** (leituras literais de §5.6, regra 13 permite): usar uma skill
  de Valor **não consome turno de nenhuma unidade** e não tem outro limite além do saldo — é
  "recurso de exército", e a spec não dá nenhum outro limite; `restoreApPp`/`globalBuff`
  miram os seus e `artillery` mira os inimigos, pela mesma derivação por natureza da
  sub-sessão 2; **o alcance é o mapa inteiro** (§5.6 diz "artilharia **de mapa**", e não há
  lançador de onde medir distância); e `globalBuff` "de 1 round" vira `duration: 1`, que
  `endRound` já sabe tickar — a duração é do MOTOR (`GLOBAL_BUFF_DURATION`), não do payload,
  porque deixar o autor escolhê-la seria mudar a regra de §5.6 em dado.
- **`restoreApPp` mira um tile, não uma unidade.** `BattleCommand.useValor` tem
  `{skillId, target: Coord}` desde M3 (forma normativa de §3.3 de `01-fundacoes-tecnicas`),
  então a unidade é a que está no tile. Só unidade **viva do jogador**: mirar um inimigo ou
  um tile vazio rejeita sem cobrar. `artillery` em área vazia, ao contrário, **vale e cobra**
  — o jogador escolheu o tile, e é a mesma leitura de `applyMapSkill`, que também conjura em
  área vazia. A assimetria é proposital: `restoreApPp` sem unidade não tem sujeito, é alvo
  malformado; artilharia em tile vazio é uma decisão ruim, não um comando inválido.
- **`payload` virou união discriminada por `kind`.** Com três kinds resolvidos, um payload
  sem forma passou a ser a mesma classe de bug que o `defend` sem `target` da sub-sessão 1:
  conteúdo que valida e não faz nada. `summonReinforcement` mantém o record solto de
  propósito — dar forma a ele agora seria adivinhar a decisão que ficou adiada.
- **`BattleSetup.valorSkills`/`BattleState.valorSkills` são OPCIONAIS**, mesmo precedente de
  `setSpecialEffectIds`/`aiArchetype`/`lethalTriggersUsed`: as batalhas montadas à mão de
  M2-M6 e as fixtures não têm catálogo. Ausente = todo `useValor` rejeita. No `ContentCatalog`
  o campo é obrigatório, como `effects` (que entrou pelo mesmo caminho em M10) — o que
  obrigou a acrescentar `valorSkills: {}` nos 6 catálogos inline dos testes de `apps/server`
  e a nova entrada no loader do cliente.
- **Catálogo real autorado** (`packages/data/valor-skills/`): `valor-restaurar-recursos`
  (custo 2, +2 AP/+1 PP), `valor-bombardeio` (custo 4, dano 400, raio 1) e
  `valor-brado-de-guerra` (custo 5, +15% de `atk` por 1 round), mais o `EffectDef` novo
  `effect-brado-de-guerra` que a última referencia — o catálogo real só tinha um efeito, e
  ele é debuff. Autorar aqui é escopo, ao contrário das skills de área: o roadmap de M11 diz
  literalmente "catálogo real de `valor-skills` resolvido de verdade por `useValor`".
  **Estes números não são exercitados por `pnpm balance`** (o torneio nunca emite `useValor`,
  `decideMapAiCommand` não conhece o comando), então são um primeiro passe calibrado contra
  §5.6 ("Começa em 5, +1 por round") e o HP do roster real, a rever quando M12 autorar
  campanha que os use de verdade.
- **Gap registrado: "+2 ao capturar objetivo" (§5.6) continua sem implementação.** `endRound`
  dá o "+1 por round"; a outra fonte não tem onde acontecer — com `seize` resolvido na
  sub-sessão 1, capturar o objetivo **termina** a batalha, então não existe captura no meio
  dela. Precisa de um conceito de objetivo intermediário que §5.7 não tem.

`RULES_VERSION` `0.11.0`→`0.12.0`. **Nenhum número de balanceamento se moveu**
(`pnpm balance -- --runs 10000`): Espadachim 63,5% … Couraçado 26,2%, `spd` em 22,4%.
`GOLDEN_HASH` intacto (`pnpm test:browser`, 42 testes, 3 engines) — o replay canônico não
emite `useValor`.

Testes novos: 19 em `battle/valorSkills.test.ts` (novo — `restoreApPp` devolvendo AP/PP à
unidade do tile, não tocando em mais ninguém, cobrando o `cost` declarado em vez do custo
fixo de 1, **não consumindo turno**, e rejeitando tile sem aliado vivo ou com inimigo;
`artillery` ferindo todos os inimigos do raio e nenhum aliado, com o dano **mitigado por
`def`** e menor que o número cru do payload, sem levar ninguém abaixo de 0, e gastando Valor
em tile vazio; `globalBuff` atingindo todo aliado vivo onde quer que esteja, poupando
inimigos e mortos, e **durando exatamente 1 round** — provado com `endRound`;
`summonReinforcement` rejeitando sem cobrar; skillId fora do catálogo, saldo insuficiente e
batalha sem catálogo; e os dois de determinismo), 7 em `packages/data/tests/validate.test.ts`
(os três payloads resolvidos aceitos, payload trocado de kind rejeitado, artilharia sem dano
ou com raio negativo rejeitada, `summonReinforcement` seguindo solto, custo zero rejeitado, o
catálogo real cobrindo os três kinds resolvidos e todo `effectId` referenciado existindo de
fato). Os 2 testes do placeholder de M3 em `commands.test.ts` foram reescritos para a
semântica nova. `pnpm test` (**843 testes, 70 arquivos** — +26), `pnpm typecheck` (7 pacotes,
limpo), `pnpm lint` sem alteração, `pnpm validate:data` (17 schemas, **76 arquivos** — +4).

**Os 4 critérios de aceite de M11 batem.** Pendências registradas, nenhuma delas critério:
`summonReinforcement` (fatia própria, decisão do usuário), "+2 ao capturar objetivo" (§5.6,
sem onde acontecer), e nenhum mapa/skill real usando condições novas ou área — escopo
declarado de M12 (§10: campanha de 6-10 mapas com objetivos variados).

## M12 — Conteúdo e campanha real

### M12 — sub-sessão 1/N: `encounters` — o elenco da campanha vira dado

Primeira fatia de M12, escolhida por destravar as outras: sem roster em dado não dá para
autorar mapa de `escort` (a condição nomeia um `unitId`, que só existe no elenco) nem de
`defend`, e servidor e `sim-cli` continuam sem conseguir montar um mapa de campanha.

Estado anterior: `apps/client/src/data/campaign.ts` montava os 3 mapas da campanha em
TypeScript — quem entra, em que tile, com qual equipamento, tudo hardcoded, com o `Hero` de
cada unidade DERIVADO por convenção de nome (`skill-ataque-<slug>`, `skill-especial-<slug>`)
e `permadeath: 'casual'` fixo no código. M9 moveu classes/skills/itens/mapas para
`packages/data` e deixou este arquivo para trás de propósito ("autoria de mapa de verdade é
M12"); era o último canto de conteúdo hardcoded do projeto, contra a regra 4.

- **Schema `encounters` próprio, separado do layout (decisão do usuário).** Um encounter é
  `{ id, name, mapId, chapter, permadeath, winCondition?, units[] }`; o layout (tiles,
  terreno) continua em `maps/*.json`, referenciado por `mapId`. Separar os dois deixa um
  layout servir a capítulos diferentes sem duplicar a matriz de tiles — os mapas atuais têm
  ~940 linhas só de `tiles`, e colar elenco no layout também faria `maps.schema.ts` servir
  dois consumidores com necessidades opostas (a arena de `tools/balance` não quer roster).
- **`hero` embutido inteiro, não derivado por convenção de nome.** Precedente direto de
  `comps.schema.ts` (M8), que resolveu o mesmo problema para o torneio. A derivação por
  convenção do `campaign.ts` antigo funcionava enquanto toda classe tivesse exatamente
  `skill-ataque-*` + `skill-especial-*`; com M12 autorando skills variadas por unidade, uma
  regra de nomenclatura implícita viraria armadilha. `aiArchetype` é **opcional** aqui
  (obrigatório em comps): numa campanha a unidade do jogador é humana, e ausente = humana,
  mesma leitura de `BattleUnit`.
- **`winCondition` opcional no encounter, sobrepondo a do layout.** Decisão registrada, não
  perguntada (regra 13). É praticamente forçada por `escort`: a condição referencia um
  `unitId` que só existe no elenco, então declará-la no layout amarraria o layout a um
  roster específico. Ausente = vale a do mapa, que é o comportamento de hoje. O schema
  ainda **valida** que um `escort` nomeie uma unidade do jogador presente no encounter —
  sem isso a partida nasceria sem desfecho possível (o motor resolve `unitId` inexistente
  como derrota imediata, decisão de M11 sub-sessão 1).
- **`permadeath` mora no encounter.** §5.7 diz "Permadeath é flag do `BattleSetup`
  (`casual | classic | ironman`), **nunca hardcoded**" — e estava hardcoded em `campaign.ts`
  desde M6. É conteúdo do cenário, não do layout nem do motor.
- **Três `refine` no schema que o TypeScript não daria de graça:** pelo menos uma unidade do
  jogador, `unitId` único, e **1 herói = 1 tile** (duas unidades não podem começar na mesma
  coordenada) — este último é o conceito que o `CLAUDE.md` marca como "não pode confundir",
  e é o tipo de erro que só apareceria como comportamento estranho em runtime.
- **`RULES_VERSION` NÃO subiu** (segue `0.12.0`). Nenhuma regra do motor mudou: esta fatia
  move conteúdo e acrescenta um schema. `permadeath` e `winCondition` passaram a vir do
  dado, mas com os mesmos valores de antes ('casual' e a do mapa), então nem o comportamento
  observável mudou.
- **Gap consciente preservado: as unidades inimigas da campanha continuam sem `aiArchetype`**
  — herança de M6, documentada em `campaign.ts` desde então. O campo agora existe no schema
  e basta preencher; ligar a IA muda como a campanha JOGA, e isso pertence à fatia que
  autora os mapas de verdade (3/N), não a uma migração de formato.

`pnpm balance -- --runs 10000` byte a byte igual ao baseline (Espadachim 63,5% … Couraçado
26,2%, `spd` em 22,4%) e `GOLDEN_HASH` intacto — o torneio não conhece encounters. Mesmo
critério de fidelidade que M9 usou para provar que uma migração de conteúdo não mudou nada.

Testes novos: 9 em `packages/content/tests/encounters.test.ts` (novo — os 3 encounters
carregando e vindo **ordenados por capítulo** e não pela ordem do disco; o elenco sendo
exatamente o que vivia em `campaign.ts`, unit a unit, com o tile do jogador conferido nos
três capítulos; e a **integridade cruzada** que o TS dava de graça e o dado não dá: `mapId`,
`classId`, todo skill de `duelSkills`/`mapSkills`/`tacticsScript` e todo item equipado
existindo no catálogo, `weaponType` dentro de `classDef.allowedWeapons`, nenhuma unidade
fora do grid; mais cada encounter virando um `BattleSetup` que `buildInitialState` aceita, e
determinismo), 2 em `packages/data/tests/validate.test.ts` (o par valid/invalid do schema
novo, via o `describe.each` que já cobre os outros 17). `pnpm test` (**854 testes, 71
arquivos** — +11), `pnpm typecheck` (7 pacotes, limpo — exigiu `encounters: []` nos 6
catálogos inline dos testes de `apps/server`, mesma mecânica de `valorSkills` na fatia
anterior), `pnpm lint` sem alteração, `pnpm validate:data` (**18 schemas, 79 arquivos** —
+1 schema, +3 encounters).

Pendente de M12: skills usando os efeitos de M10 + rebalanceamento completo (2/N), os 6+
mapas com objetivos variados (3/N) e o aceite ponta a ponta no cliente (4/N).

### M12 — sub-sessão 2/N: skills usando os efeitos de M10 + rebalanceamento completo

Fatia que fecha o critério de aceite "nenhuma skill do catálogo é só um número de dano" e
dispara o ciclo de rebalanceamento que M10 e M11 vinham adiando de propósito a cada
sub-sessão. Ponto de partida: **22 das 23 skills do catálogo eram só multiplier + flat** (só
`skill-defender` escapava, por não causar dano).

- **O ataque básico e as duas reações universais de §6.4 são a exceção declarada (decisão
  do usuário).** §6.2 define o básico como o fallback de 0 AP "sempre disponível"; dar efeito
  a ele — ou a Contra-atacar/Defender, que toda unidade tem sem gastar talento — infla a
  linha de base em vez de criar escolha, e mexeria em todo duelo do torneio. O critério vale
  para toda skill que o jogador ESCOLHE.
- **Toda especial de classe aplica um efeito, com `duration: 'duel'`.** Duração em rounds de
  mapa é alavanca bem mais forte (efeito `battle` acumula vantagem entre duelos, §6.9) e fica
  reservada para conteúdo que a queira de propósito. 10 `EffectDef` novos, escolhidos para
  dar consumidor aos campos que M10 declarou e ninguém lia: `periodicDamagePct`
  (sangramento, queimadura), `periodicHealPct` (regeneração), `damageDealtPct` (ímpeto),
  `damageTakenReductionPct` (guarda cerrada, e negativo na marca do caçador) e `statMods`
  dentro do duelo (quebra de armadura, desarme, lentidão, bênção).

**Dois achados mecânicos que mudaram o desenho da fatia** — os dois vieram de o teste do
critério ter sido escrito depois da primeira autoria, e são o argumento de por que ele
deveria ter vindo antes:

1. **Uma reação `onDamaged` com `ppCost: 1` NUNCA dispara.** `resolveDuel` resolve
   `onAttacked` primeiro (ordem cronológica, M10 sub-sessão 5/N) e `tryLateReaction` sai
   cedo se já houve reação na troca; Contra-atacar é baseline, sem condições, então vence
   sempre. A única janela em que `onDamaged` existe é quando a unidade NÃO reagiu — isto é,
   quando ficou sem PP. **Custar 0 PP é a razão de a skill existir**, não generosidade: ela
   é literalmente "sem PP para revidar, você ainda responde ao levar o golpe". Medido: com
   `ppCost: 1` o Arqueiro ficou em 34,4% (inerte); com 0, foi a 83,0% na mesma rodada.
2. **Reação e assistência não conseguem ser "mais que um número de dano" neste motor.**
   `resolveDuel` ignora os `skill.effects` de uma reação e `applyAssistDamage` ignora os de
   uma assistência — corte deliberado de M10 sub-sessão 1/N, preservado com teste explícito.
   Dar um efeito a elas seria autorar **conteúdo morto**, que é pior do que assumir que são
   um número. Consequências:
   - `skill-revide-preciso` (dano) virou **`skill-folego-de-combate` (cura)**: curar é a
     única forma de uma reação ser mais que um número sem mentir — e isso dá consumidor à
     "Cura de emergência" que §6.4 nomeia e que M10 sub-sessão 7/N implementou sem ninguém
     usar. Uma mecânica a mais coberta pelo mesmo conteúdo.
   - **`skill-assistir` fica isenta**, por motivo mecânico e não de design: uma assistência
     é ou 50% do dano da skill ou cura em efeito integral (§6.5.3), e nada além. Há teste
     travando a justificativa (`effects` vazio, sem tag `heal`): se um dia o motor passar a
     aplicar efeitos de assistência, o teste falha e a isenção é reavaliada em vez de virar
     folclore. **Tornar isso falso é mudança de core, não de conteúdo.**

**As três mecânicas de M10 com consumidor real** (o gap que M10 registrou quatro
sub-sessões seguidas esperando M12):

| Mecânica | Conteúdo | Como chega à unidade |
| --- | --- | --- |
| tag `heal` (M10 7/N) | `skill-cura-clerigo` | `duelSkills` do Clérigo + linha de script com `selfHpBelow` |
| `onLethal` (M10 8/N) | `skill-ultimo-suspiro`, `perBattle` | `duelSkills` do Couraçado (é assim que uma passiva chega a `knownSkills`) |
| `onDamaged` (M10 5/N) + Cura de emergência (§6.4) | `skill-folego-de-combate` | talento exclusivo do Arqueiro, **alocado pelo comp** |

A cura do Clérigo é skill PRÓPRIA e não a especial dele: assim "curar ou bater" vira uma
linha de script com condição — o produto do jogo (§6.3) — em vez de trocar dano por cura
sempre. O `onLethal` NÃO entra no `tacticsScript` (não é ação, é consequência), e o teste
afirma isso. E o comp do Arqueiro precisa alocar o talento, senão o gatilho continuaria sem
consumidor no torneio: o mesmo erro que M10 sub-sessão 4/N encontrou com `skill-assistir`.

**Rebalanceamento — 4 passes de `pnpm balance -- --runs 10000`:**

| | Espadachim | Grifeiro | Couraçado | Clérigo | Arqueiro | pior–melhor |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline (M8→M11) | 63,5% | 55,1% | 26,2% | 54,2% | 36,2% | 26,2–63,5 |
| Passe 1 (efeitos crus) | **66,3%** | **66,2%** | 58,7% | 27,0% | 34,4% | 27,0–66,3 |
| Passe 2 (`ppCost:0`) | 59,8% | 50,0% | 42,0% | 29,9% | **83,0%** | 29,9–83,0 |
| Passe 3 | 61,3% | 48,9% | 46,1% | 35,7% | 51,6% | 35,7–61,3 |
| **Final** | **59,9%** | 47,5% | 44,3% | 49,5% | 48,0% | **42,5–59,9** |

Ajustes finais, todos em `packages/data` (regra 4 — nenhum número de balanceamento entrou em
código): ímpeto 120→50, guarda cerrada 150→70, bênção +10%→+45% def, sangramento 600→400 de
chance, queimadura 50→80 de tick e 500→650 de chance, quebra de armadura ganhou
`damageTakenReductionPct: -80` (a -12% de `def` sozinha era quase nada nos valores de nível
10 — mesma descoberta que M8 sub-sessão 2 registrou), `signatureMultiplier` do Clérigo
1300→1450, e a cura do Fôlego de Combate 400→120.

**Resultado: o roster mais bem balanceado que o projeto já teve.** Os dois critérios de M8
batem — nenhuma comp acima de 65% (a maior é 59,9%) e `spd` em 20,0% das vencedoras (teto
60%) — e, **pela primeira vez desde M8, nenhuma comp está abaixo de 40%**: o alerta de §9.5
que acusava Arqueiro (36,2%) e Couraçado (26,2%) desde a autoria original desapareceu. A
faixa inteira do roster comprimiu de 37,3 pontos para 17,4.

`RULES_VERSION` **não subiu** (segue `0.12.0`): nenhuma regra do motor mudou — esta fatia é
inteiramente conteúdo. `GOLDEN_HASH` intacto (o replay canônico usa fixtures próprias, não o
catálogo real).

Testes novos: 10 em `packages/data/tests/authorContent.test.ts` (o **critério de aceite de
M12 como teste executável**: toda especial aplicando efeito com duração de duelo, nenhuma
skill escolhível sendo só dano, a exceção continuando restrita ao básico + as 2 universais
+ a assistência com a justificativa travada, e todo `effectId` referenciado existindo; mais
as 3 mecânicas de M10 com consumidor, cada uma verificada até a unidade — `duelSkills`,
linha de script com condição, talento alocado pelo comp — e a trava de que só o Arqueiro tem
reação própria). `pnpm test` (**864 testes, 71 arquivos** — +10), `pnpm typecheck` (7
pacotes, limpo), `pnpm lint` sem alteração, `pnpm validate:data` (18 schemas, **92
arquivos** — +13: 10 efeitos e 3 skills).

Pendente de M12: os 6+ mapas com pelo menos 3 condições de vitória distintas e a IA dos
inimigos da campanha (3/N), e o aceite ponta a ponta no cliente (4/N).

### M12 — sub-sessão 3/N: os 6 mapas da campanha, com terreno e com a IA ligada

Fecha os dois itens que faltavam do aceite de M12: "campanha de 6+ mapas jogável ponta a
ponta com pelo menos 3 condições de vitória distintas" e a IA dos inimigos da campanha.

Estado anterior: 3 layouts 15×15 de **planície pura** (`map-campanha-{1,2,3}-provisorio`,
portados byte a byte de M6 pela sub-sessão 3/4 de M9), todos `rout`, com o jogador sozinho
contra 2–3 inimigos **sem `aiArchetype`** — isto é, parados. Nenhuma das 4 condições de
vitória que M11 implementou tinha um mapa real, `areaRadius` seguia sem conteúdo, e
`terrain-floresta`/`terrain-montanha` existiam no catálogo sem nenhum mapa que os usasse.

**Três decisões tomadas com o usuário:**

- **Os 3 layouts provisórios saem; os 6 são novos, com terreno de verdade.** A alternativa
  (manter os três e somar três) deixaria metade da campanha em planície pura, e nenhum dos
  chokepoints que `seize`/`defend` precisam existiria nos capítulos iniciais.
- **A party do jogador cresce por capítulo** (1 → 2 → 3 → 4 → 5 → 5). Até aqui a campanha
  era 1 unidade contra N nos três mapas, o que deixava a assistência de M10
  (`onAllyEngagedNearby`, cura de assistência) sem sujeito e tornava `escort` degenerado —
  o herói escoltando a si mesmo é um `seize` com outro nome.
- **As 5 condições de §5.7 são usadas, não as 3 do mínimo:** `rout` (cap. 1 e 6), `seize`
  (2), `defend` (3), `surviveRounds` (4), `escort` (5). Excede o aceite e fecha a pendência
  registrada em M11 de que "nenhum mapa real usa condição nova".

**Decisões registradas sem perguntar (regra 13):**

- **Chokepoint é montanha, não `object:'wall'`.** `Tile.object` (`wall | fort | gate |
  chest | camp`) existe no schema desde M3 e **ninguém lê** — nem o core, nem o cliente.
  Autorar um portão como `object` seria cenário decorativo se fazendo passar por regra; o
  único bloqueio que o motor respeita é `moveCost: 'impassable'`, de `terrain-montanha`
  (que `flying` atravessa — é o que dá sentido ao Grifeiro no capítulo 6).
- **A altura de cada unidade é derivada do tile, não autorada.** `move` já copia a altura
  do destino (`commands.ts`), então um número escrito à mão no encounter só poderia
  divergir do mapa — e a vantagem posicional de §6.6 sairia de um número inventado. Há
  teste travando a igualdade.
- **Um mapa por gerador, como as classes.** `packages/data/scripts/authorCampaign.ts`
  escreve os layouts em ASCII (uma linha por linha do grid, com legenda de terreno+altura)
  e emite o JSON. 6 layouts são ~6 mil linhas de `tiles` onde um `terrain` trocado passa
  despercebido; em ASCII o chokepoint se lê de relance. Mesmo papel de `authorContent.ts`:
  ferramenta de autoria, fora do motor.
- **O capítulo 1 tem UM inimigo, não dois.** Achado medido, não escolha estética: AP e PP
  são pools da **batalha** (§6.3) e o lado em menor número gasta o dobro pra defender o
  mesmo turno. Um herói sozinho contra dois perde por exaustão de recurso mesmo contra
  inimigos muito abaixo do nível dele — testado com bandidos de nível 5 contra o herói de
  nível 10: derrota. Enquanto a party tem uma unidade, o capítulo tem um inimigo; a partir
  do capítulo 2, com aliado, a campanha pode superar o jogador em número (e supera).
- **Nenhum inimigo nasce dentro do próprio alcance da party.** `buildInitialState` drena os
  turnos de IA anteriores à primeira unidade humana na iniciativa (M7, sub-sessão 6), o que
  era inofensivo com inimigos parados e deixou de ser: no primeiro traçado do capítulo 4 a
  party já apanhava um round inteiro **antes do primeiro comando do jogador**. Vira teste:
  nenhuma unidade sai ferida da montagem.
- **Dificuldade graduada por nível de inimigo** (cap. 1: nível 8; 2: 8; 3–5: 9; 6: 10 com
  chefe 11), tudo em dado. É o único lever de dificuldade que não toca regra.

**As duas skills de mapa em área** (`skill-salva-arcana`, `skill-luz-do-alvorecer`) dão a
`areaRadius` o consumidor que M11 sub-sessão 2/N deixou registrado como pendente ("a skill
de mapa em área é conteúdo da fatia 3/N, junto dos mapas que a justificam"). Nenhuma das
duas é só um número de dano (critério de M12): cada uma carrega um `EffectDef` que muda o
round seguinte. A duração é em **rounds de mapa**, não `'duel'` — uma skill lançada no mapa
não está em duelo nenhum. A tag `heal` continua sendo o discriminador de lado (M10, 7/N):
com ela a área mira aliados, sem ela mira inimigos.

**Os 5 arquétipos de §9.1 ganham consumidor real** (`aggressive`, `guard-tile`,
`hold-position`, `flank`, `support-nearest`), com teste travando isso.

**O arnês que prova "jogável".** `packages/content/tests/campaignPilot.ts` é um piloto
automático de regras fixas que assume o lado do jogador; `campanha.test.ts` joga os 6
capítulos com ele e exige `victory` em todos. Não é IA de jogo e por isso **não mora em
`packages/core`** — é arnês de teste. Ele não escolhe skill, não gasta Valor e não lança
skill de mapa: é o **piso** do que um humano faz. Duas regras dele mereceram cuidado, e as
duas por medida: (a) mede distância ao objetivo por **rota BFS sobre o terreno**, não por
Manhattan — com Manhattan ele empacava na muralha do capítulo 2, porque a passagem fica
*para trás* em linha reta, e o teste passaria a medir a burrice do piloto em vez da
jogabilidade do mapa; (b) a unidade escoltada só avança para tile que nenhum inimigo
alcança no turno seguinte — sem isso ela se entregava na emboscada do capítulo 5 no round
2. O portador do objetivo em `seize`/`defend` é reavaliado a cada comando: fixá-lo no
início deixava o mapa sem ninguém indo ao objetivo assim que ele morria.

**Correção no cliente, arrastada pelo conteúdo:** `MapCanvas.tsx` pintava terreno por
`plain`/`forest`/`mountain` — os ids dos fixtures de M6 — e **nenhum batia** desde que M9
trocou o conteúdo de demonstração pelo catálogo real (`terrain-planicie` etc.), então o mapa
inteiro caía no cinza de fallback. Ficou invisível enquanto todo mapa era planície pura;
com terreno real mudando movimento, defesa e evasão, o jogador precisa ver onde ele está. A
altura ganhou um véu branco por nível pelo mesmo motivo.

`RULES_VERSION` **não subiu** (segue `0.12.0`): nenhuma regra do motor mudou — a fatia é
conteúdo mais um arnês de teste. `pnpm balance -- --runs 10000` **idêntico** ao da
sub-sessão 2/N (Espadachim 59,9% … Arcanista 42,5%, `spd` em 20,0% das vencedoras): o
torneio usa `map-arena-coliseu` e os comps, nada do que esta fatia tocou.

Pendente de M12: o aceite ponta a ponta **no cliente** (4/N) — a UI ainda não mostra qual é
o objetivo do mapa nem quantos rounds faltam, o que com `rout` era dispensável e com
`surviveRounds`/`defend` não é. Continua fora de escopo, e agora registrado: a campanha não
recebe `valorSkills` (`buildBattleSetupFromHeroes` não tem o parâmetro), então Valor segue
sem uso fora de teste.

### M12 — sub-sessão 4/N: o aceite no cliente — objetivo, skill de mapa e Valor

Fecha M12. As três fatias anteriores autoraram conteúdo que o cliente não sabia mostrar nem
usar; esta liga as pontas.

**Três lacunas encontradas ao olhar o cliente com a campanha real na mão:**

- **O objetivo do mapa não existia na tela.** Enquanto toda condição era `rout` não havia o
  que explicar; com a campanha de M12 o jogador entrava num mapa de `defend` sem saber que
  tile segurar nem por quantos rounds, e num de `escort` sem saber quem não podia morrer.
  `ObjectivePanel` descreve a condição em português, mostra o progresso (rounds restantes,
  inimigos de pé) e o `MapCanvas` marca o tile do objetivo em amarelo — `rout` e
  `surviveRounds` não marcam nada, porque a condição delas não é sobre lugar nenhum.
- **Não havia ação de `mapSkill`.** O comando existe no core desde M3 e resolve área desde
  M11, mas o cliente só sabia mover e engajar: as duas skills de mapa autoradas na
  sub-sessão 3/N eram **inalcançáveis por um humano**. Agora aparecem como botão na barra
  de ações da unidade, com custo em AP e raio no rótulo.
- **Valor era saldo no HUD sem nada que o gastasse.** `applyUseValor` resolve contra
  `state.valorSkills` desde M11, mas **`buildBattleSetupFromHeroes` não tinha o parâmetro**
  — ou seja, ninguém que monta batalha a partir de heróis (cliente, servidor,
  `tools/balance`) conseguia declarar as skills de Valor do mapa. Decisão do usuário:
  ligar agora. A mudança no core é **aditiva** (campo opcional repassado ao `BattleSetup`,
  onde já existia desde M11) e não altera nenhum cálculo.

**Decisões de implementação registradas:**

- **`mapSkill` e `useValor` compartilham um estado de mira só** (`TargetingMode`). São os
  dois únicos comandos cujo alvo é uma COORDENADA e não uma unidade, e o gesto é o mesmo:
  escolher a habilidade, ver os tiles legais, clicar num. O que muda é o alcance —
  `mapSkill` usa `skill.duelRange ?? unit.duelRange`, a mesma leitura que `applyMapSkill`
  faz no core; Valor é "artilharia **de mapa**" (§5.6) e aceita qualquer tile — e quem
  paga. Em mira, o clique é o alvo mesmo em cima de unidade: artilharia mira o tile.
- **O cliente recalcula o alcance só para desenhar.** Quem valida continua sendo o core:
  clicar fora do overlay não monta comando, e o que escapar é rejeitado por
  `applyCommandAndAdvance` com o motivo aparecendo na barra de ações (regra 3).
- **Valor não limpa a seleção; skill de mapa limpa.** §5.6 diz que usar Valor **não
  consome o turno de ninguém**, então a unidade selecionada segue selecionada e com o
  alcance de movimento recomputado — enquanto `mapSkill` encerra o turno de quem lançou.
- **`summonReinforcement` aparece desabilitado, não escondido.** Continua sem resolução
  (decisão de M11 3/N) e o core rejeita alto; o botão diz isso antes de o jogador tentar,
  em vez de a skill sumir sem explicação.
- **O canvas passou a redimensionar.** O `Application` do Pixi era inicializado uma vez com
  o tamanho do primeiro mapa; com mapas de 16×16, 18×18 e 20×15 na campanha, os capítulos
  maiores apareceriam cortados ao avançar.
- **Rocha intransponível é desenhada DEPOIS dos overlays.** O overlay de ameaça cobre o
  tile inteiro e fazia a muralha do capítulo 6 se ler como zona de perigo em vez de parede.
  Terreno que decide o traçado do mapa não pode ser apagado por um véu.
- **Gancho de diagnóstico só em dev** (`__pathsBeyondStore`, sob `import.meta.env.DEV`).
  O cliente não tem suíte automatizada e a verificação é um roteiro real de navegador desde
  M9; sem um jeito de saltar de capítulo, conferir os mapas maiores exigiria vencer os
  anteriores clicando. Não é API de jogo — nada no app lê daqui e o bloco não existe em
  produção.

**Verificação real, no navegador** (Vite + Playwright/Chromium headless, mesmo método de M9
sub-sessão 3/4, já que `pnpm test` não cobre UI): o capítulo 1 foi **jogado até a vitória por
cliques** (selecionar, mover, engajar, confirmar preview, avançar de mapa); `useValor`
executado ponta a ponta (Valor 5→3, herói de AP 3→5 e PP 2→3); no capítulo 2 o Clérigo
lançou `Luz do Alvorecer` em área pelo botão novo, sem erro; e os **6 capítulos** foram
abertos conferindo tamanho de canvas contra o tamanho do mapa (540×540, 576×576, 720×540,
648×648) e o texto do objetivo de cada condição. **Zero erros de console ou de página** nos
dois roteiros.

`RULES_VERSION` **não subiu** (segue `0.12.0`): o repasse de `valorSkills` é encanamento —
nenhum cálculo mudou, e nenhum chamador existente passa o campo novo. `pnpm balance`
inalterado pelo mesmo motivo.

Pendências que sobrevivem a M12, todas fora dos critérios de aceite: o **servidor** não
passa `valorSkills` (Valor em PvP é decisão de §9.2, não de campanha); `Tile.object`
(`wall`/`fort`/`gate`/`chest`/`camp`) continua sem leitor no motor; `lifesteal` continua
inerte; e o cliente segue sem tela de replay e sem persistência entre mapas — **escopo
declarado de M13** (§11).

## M13 — Superfície jogável completa

### M13 — sub-sessão 1/N: replay — gravar e reproduzir passo a passo

Primeira fatia de M13, escolhida por destravar a perna de PvP também: "rever" uma partida
de PvP é reproduzir um `Replay` vindo do servidor, então a mesma tela serve as duas.

Estado anterior: o core tem `Replay {rulesVersion, seed, initialState, commands}` e
`simulate()` desde M3, e o servidor persiste replays desde M7 — mas **o cliente nunca
gravava comando nenhum**. Não havia replay de campanha para reproduzir, nem tela.

**Decisão do usuário: a edição de táticas trava durante a batalha.** O editor altera o
script fora do fluxo de comandos (M6 o tratou como configuração de fora do combate, e §11
o descreve como ferramenta de preparação — "Testar contra um manequim configurável"). Só
que um `Replay` reaplica `initialState + commands`: um script trocado no meio da batalha
não estaria em nenhum dos dois, e a reprodução mostraria duelos que não aconteceram. As
alternativas foram descartadas por ela: um `BattleCommand` novo seria **regra nova**
(§5.4 não lista edição entre as ações de turno, e obrigaria a decidir se consome turno,
se custa AP e se o inimigo também pode); regravar do zero a cada edição deixaria o replay
de cobrir a batalha inteira, que é justamente o que o critério de aceite pede.

**A janela de edição é a preparação do capítulo** — antes do primeiro comando. E editar
ali **reconstrói a batalha a partir de um setup com o script aplicado**, em vez de mexer
só no `battleState`. Isso não é detalhe: um furo real apareceu na verificação. O replay
grava o `BattleSetup` do capítulo, e a edição pré-batalha vivia só no estado, então o
replay reproduzia a batalha com o script ORIGINAL. Com `tacticsOverrides` entrando no
setup, o que foi gravado é o que foi jogado — verificado no navegador desligando o script
do herói antes do primeiro comando e comparando o estado final byte a byte.

**Outras decisões registradas:**

- **Comandos de IA não são gravados, e não podem ser.** `applyCommandAndAdvance` resolve
  os turnos de IA por dentro (M7, sub-sessão 6), então reaplicar só os comandos humanos
  reproduz a batalha inteira — é o mesmo contrato que `simulate` usa desde M3. Gravar os
  comandos da IA duplicaria as ações dela na reprodução.
- **O comando de `engage` entra na gravação no CONFIRMAR, não no preview.** Cancelar um
  preview não aconteceu na batalha; o `DuelPreview` passou a carregar o comando que o
  gerou justamente pra que o registro seja o da ação de fato.
- **O estado do passo N é recomputado do início, sem cache de snapshots.** Só é legítimo
  porque o core é determinístico (mesma seed + mesmo prefixo = mesmo estado), e é o que
  garante que rebobinar mostre exatamente o que a ida mostrou; um cache poderia divergir em
  silêncio. Há teste travando isso (o passo N reproduzido duas vezes é idêntico).
- **O timer da reprodução automática vive na tela, não no store.** Velocidade é
  apresentação; o estado do passo continua sendo função pura de `(replay, step)`.
- **Reiniciar o mapa preserva os overrides de tática, trocar de capítulo zera.** Quem
  perdeu e ajustou o script não deve ter que reconfigurar a cada tentativa; capítulo novo
  tem elenco novo.

**Testes:** `packages/content/tests/replay.test.ts` (15) grava a jogada REAL do piloto
automático dos 6 capítulos — com IA de mapa, duelos, reações, cura, gatilho de morte e as
5 condições de vitória — e prova que o replay bate: em lote (`simulate`) e **passo a
passo**, que é como a tela reproduz; que todo prefixo é estado válido; e que a
`rulesVersion` gravada é a corrente (§9.4 recusa replay de outra versão). O piloto passou a
devolver o log de comandos, e o setup dele agora inclui `valorSkills` — um replay só vale
como prova se a batalha for montada igual à de verdade.

**Verificação no navegador** (Vite + Playwright headless): capítulo 1 jogado por cliques,
"Rever batalha" abrindo a tela, os 2 comandos percorridos um a um pelo botão "Próximo", o
estado do último passo **idêntico byte a byte** ao da batalha ao vivo, e a reprodução
automática em 4× chegando ao fim sozinha e parando. A trava do editor foi verificada nos
dois lados: editável antes do primeiro comando (1 → 2 linhas), recusada depois, com aviso
na tela, "Salvar" desabilitado e o "Testar contra manequim" seguindo disponível. Zero
erros de console.

`RULES_VERSION` **não subiu** (segue `0.12.0`): nada de regra mudou — a gravação é do
cliente e a reprodução usa o caminho que já existia.

Falta em M13: PvP ligando cliente ao servidor de M7, persistência entre mapas, e a
acessibilidade (modo daltônico nos overlays, fonte escalável).

### M13 — sub-sessão 2/N: PvP — o cliente contra o servidor real

Estado anterior: o servidor de M7 estava pronto e **ninguém falava com ele**. O cliente não
tinha um `fetch` sequer.

**O bloqueio não era de tela, era de contrato.** §9.1 diz que "o atacante joga a camada de
grid manualmente contra essa defesa", mas `POST /battles` (M7) recebe os comandos JÁ
prontos e só então sorteia a seed. O cliente não tinha como jogar antes de submeter: não
sabia a seed, e `/matchmaking/opponent` devolvia só `{playerId, displayName, elo, mapId}` —
nenhuma rota entregava os heróis nem a defesa pra montar o `BattleSetup`. Qualquer partida
"jogada" no cliente mostraria duelos diferentes dos que o servidor resolveria.

**Decisão do usuário: ticket de batalha.** `POST /battles/ticket` monta o confronto,
devolve `{nonce, seed, rulesVersion, setup, defenderPlayerId}`, e o cliente joga com a
seed real. Detalhes que valem registro:

- **A seed é derivada do nonce por HMAC** com um segredo do servidor
  (`battle/ticket.ts`), não guardada. Não exige tabela nem migração: `POST /battles`
  recomputa a mesma seed a partir do nonce que o cliente devolve, e o nonce já era
  obrigatório e já era a chave do replay persistido (anti-reenvio de M7). §9.4 ("zero RNG
  no cliente: seed vem do servidor") continua valendo ao pé da letra — ela só vem antes.
- **`generateSeed()` (crypto.randomInt) saiu.** A seed aleatória por requisição era
  incompatível com jogar antes de submeter.
- **Grinding de seed é risco residual, contido pelo rate limiter.** Pedir vários tickets e
  ficar com o melhor é o que um atacante faria; a emissão de ticket consome a mesma cota de
  `POST /battles` (§9.4), e há teste travando isso. Sem o segredo, o cliente não consegue
  procurar um nonce que produza uma seed favorável — o que sobra é reroll caro.
- **A montagem do confronto foi extraída** (`assembleArenaBattle`) e é a MESMA para o
  ticket e para a batalha. Se as duas divergissem, o cliente jogaria uma partida e o
  servidor resolveria outra — §9.1 chama isso de bug crítico.
- **`GET /me/heroes` (novo).** `POST /battles` sempre exigiu `attackerHeroIds` e não havia
  como o cliente DESCOBRIR os seus: os ids só existiam em fixture e em seed de banco.
  `HeroRepository.listHeroesByOwner` entrou nas duas implementações (memória e Postgres).
- **`BATTLE_TICKET_SECRET` é obrigatório em produção** (`index.ts` falha alto, como já
  fazia com `DATABASE_URL`) e injetado em `buildApp`, como `now` — teste precisa fixar.

**Identidade: campo de token na tela (decisão do usuário).** A auth do servidor é um token
opaco (stub de M7); o cliente não inventa um sistema de contas que §9 não especifica. A
alternativa (rota de cadastro de convidado) seria superfície de servidor nova sem nada na
spec que a descreva.

**Ferramentas que a verificação exigiu:**

- **`apps/server/src/devServer.ts`** — o mesmo `buildApp` com os repositórios em memória
  que só os testes usavam desde M7, semeado com dois jogadores, quatro heróis do catálogo
  REAL e uma defesa montada. `index.ts` exige Postgres, o que é certo pra produção e
  impraticável pro laço de trabalho: verificar "o cliente conversa com o servidor real" não
  deveria exigir subir banco.
- **Proxy `/api` no Vite** em vez de plugin de CORS no Fastify. O cliente fala por caminho
  relativo, que continua valendo atrás de qualquer proxy em produção.

**No cliente:** `data/api.ts` (transporte puro, nenhuma regra — regra 3), uma `PvpSession`
no store e a `PvpPanel`. A campanha e o PvP **compartilham o mesmo `battleState` e o mesmo
gravador de comandos**; o que muda é de onde veio o setup (`mode: 'campaign' | 'pvp'`) e o
que acontece no fim — o overlay de fim de mapa não aparece em PvP, porque lá quem decide o
resultado é o servidor. `buildReplay` usa o setup/seed do ticket quando em PvP.

**Verificação ponta a ponta, contra o servidor real** (dev server + Vite + Playwright): token
→ roster do servidor → matchmaking → ticket → **batalha jogada de verdade no cliente** (20
comandos, vitória em 6 rounds) → submissão → **o servidor resolveu igual** (mesma seed,
mesmo desfecho, mesmos 6 rounds), ELO 1200→1216 e 10 marcas de arena → **replay buscado do
servidor** e reproduzido até o fim, com as unidades finais idênticas às que o servidor
devolveu. Zero erros de console.

`RULES_VERSION` **não subiu** (segue `0.12.0`): nenhuma regra mudou — a seed passou a ser
derivada em vez de sorteada, o que é infraestrutura de servidor, e o resto é rota e tela.

Falta em M13: persistência entre mapas e acessibilidade (modo daltônico, fonte escalável).
Pendências registradas: em PvP os painéis de talento/inventário ficam vazios (dependem de
`classDefForUnit`, que é da campanha), e o servidor ainda não expõe rota para o jogador
montar a própria defesa pela UI (o `PUT /me/defense` existe desde M7 e não tem tela).

### M13 — sub-sessão 3/N: persistência/save entre capítulos

Estado anterior: **zero `localStorage` no cliente**. Recarregar a página devolvia o jogador
ao capítulo 1, com talentos, equipamento e táticas zerados. Era o último dos três critérios
de aceite de M13 em aberto — "progresso sobrevive a recarregar a página" (§11/§09-roadmap).

**Decisão do usuário: o save cobre o progresso ENTRE capítulos, não a batalha em
andamento.** Recarregar no meio de um capítulo reinicia o capítulo. A alternativa
considerada era guardar o log de comandos e reaplicá-lo na abertura (o determinismo do core
torna isso barato, e é o que a tela de replay de 1/N já faz) — descartada por escopo: o
critério pede que o progresso sobreviva, não que a partida corrente sobreviva.

**O save guarda ENTRADAS, nunca `BattleState`** (não foi perguntado; é a leitura direta da
regra 12 e do determinismo do core). Um `BattleState` serializado é o mapa inteiro a cada
gravação — centenas de `tiles` por capítulo — e é um snapshot que ninguém verifica: nada
garante que o estado escrito no disco seja um estado que o motor poderia ter produzido. O
que entra é o que o jogador ESCOLHEU (capítulo alcançado, táticas preparadas, equipamento,
talentos, preferências) e a batalha é sempre remontada do `BattleSetup` pelo core. O save
real medido no navegador tem **250 bytes**.

**Decisão do usuário: save de outra `rulesVersion` não é descartado inteiro.** O que cai é
só o que está preso à regra da batalha — os `tacticsOverrides`, que são skill + condições
avaliadas pelo motor que mudou. Capítulo, equipamento, talentos e preferências ficam:
perder progresso porque um número de balanceamento mudou seria punir o jogador por uma
decisão do desenvolvedor. Na mesma linha, e sem perguntar (conteúdo é dado, §10, e muda
entre sessões): capítulo fora de faixa é **clampado** no último que ainda existe em vez de
devolver ao começo; item que saiu do catálogo some do slot e o resto do equipamento fica; e
alocação de talento que a árvore atual não aceita mais é **zerada** — mantê-la travaria
toda edição seguinte, já que o cliente revalida a árvore inteira a cada +1/-1 (M6, 7/N).
Alocação de unidade de OUTRO capítulo é preservada: a árvore dela não é resolvível a partir
do capítulo corrente, então não há o que afirmar.

**Decisão do usuário: do PvP, só o token entra.** É digitado à mão numa caixa de texto e
redigitá-lo a cada recarga seria hostil. Ticket, oponente e batalha em curso não são
persistidos — um ticket guardado no disco do cliente é estado que o servidor não conhece.

**O save não é conteúdo de `packages/data`, então não ganha schema Zod** — o formato é
nosso, não autorado, e o cliente não depende de Zod. Em compensação **nada no parser confia
no que leu**: `parseSave` valida campo a campo e devolve `null` em qualquer desvio, e o
jogo começa do zero em vez de lançar no boot. As `Condition` (§6.3) são validadas variante
a variante, do mesmo jeito que `createDefaultCondition` as constrói no editor: validar por
"tem um campo `t` string" deixaria passar um `targetIsType` com tipo inexistente, que o
motor avaliaria como falso pra sempre — uma linha de tática morta em silêncio.

Encanamento: a hidratação é **síncrona, no boot do módulo do store** (o catálogo já é
síncrono desde M9), senão a tela abriria no capítulo 1 e saltaria para o capítulo salvo um
quadro depois. A gravação é **uma assinatura só** (`useBattleStore.subscribe`) e não uma
chamada em cada ação: com quinze pontos que mexem no progresso, espalhar "salvar" por todos
eles garantiria esquecer um; a projeção é pequena, então comparar o JSON gravado é mais
barato que comparar campo a campo. `localStorage` pode não existir (Node, SSR) e pode
LANÇAR mesmo existindo (navegação privada, cota estourada): sem armazenamento o jogo roda
igual e não salva.

**Um beco sem saída apareceu na verificação e foi corrigido:** a tela "Campanha concluída"
nunca teve botão nenhum — antes da persistência, recarregar era o que recomeçava a
campanha. Com o save, ela volta a cada recarga, e o overlay é `position: fixed; inset: 0`
com `z-index: 20`, então o "Apagar progresso" do cabeçalho fica **inalcançável** (provado
no navegador: o clique é interceptado). O painel ganhou a própria saída, "Recomeçar a
campanha".

`RULES_VERSION` **não subiu** (segue `0.12.0`) e `pnpm balance` não pode ter mudado:
`packages/core` e `packages/data` não têm uma linha alterada nesta fatia — ela é
inteiramente `apps/client`.

### M13 — sub-sessão 4/N: acessibilidade — modo daltônico e fonte escalável

Fecha M13. §11 pede três coisas em acessibilidade: "fonte escalável, modo daltônico nos
overlays, e modo resultado instantâneo". O terceiro existe desde M12; os outros dois não.

**Decisão do usuário: paleta segura E padrão, não só paleta.** Cor sozinha não bastava por
dois motivos concretos deste jogo: os overlays **se empilham** (um tile pode ser ameaça e
alcance de movimento ao mesmo tempo, e o que aparece é a mistura dos dois véus), e a
distinção mais importante do mapa — quem é meu, quem é inimigo — era azul contra vermelho,
exatamente o par que a deuteranopia comprime. No modo daltônico cada overlay de tile ganha
uma marca própria (hachura na ameaça, pontos no movimento, grade na mira, moldura no
objetivo) e o inimigo vira **quadrado** enquanto o jogador segue círculo. Com isso o mapa
continua legível até sem cor nenhuma.

**Decisão do usuário: a escala vale para o mapa também, não só para o HTML.** Todo o CSS do
cliente já estava em `rem` (47 declarações), então o HTML escala mudando a raiz; o mapa é
canvas, e sem escalar o tile junto o **rótulo de AP/PP no tile — que §11 exige legível sem
hover — continuaria em 10px enquanto o resto da tela dobra**. `TILE_SIZE` deixou de ser
constante e virou `36 × escala`, com a fonte do rótulo junto.

**Registrado sem perguntar:**

- **A paleta padrão não muda um byte.** Quem não liga o modo vê o mapa de M6–M12 idêntico;
  há teste travando as cores antigas uma a uma.
- **Os terrenos saíram da faixa de verdes** no modo daltônico e viraram uma rampa de
  LUMINÂNCIA (claro/médio/escuro) — luminância é o canal que nenhuma dicromacia afeta,
  enquanto verde e vermelho colapsam justamente contra o véu de ameaça.
- **Anel de seleção e anel de "dá pra engajar" viraram branco e preto.** Eram âmbar e
  laranja, indistinguíveis entre si em deuteranopia, e os dois aparecem sobre unidades ao
  mesmo tempo. Branco e preto não são cor: sobrevivem a qualquer condição.
- **"Apagar progresso" não desliga a acessibilidade.** Apagar progresso é sobre progresso;
  desligar o modo daltônico de quem depende dele seria hostil.
- **O formato do save NÃO subiu para v2.** As duas preferências entraram **opcionais na
  leitura**: um save gravado na fatia 3/N não tem os campos, e rejeitá-lo por isso apagaria
  capítulo, equipamento e talentos por causa de uma preferência nova. A regra que separa os
  tratamentos ficou explícita no parser: **erro de TIPO é formato malformado e rejeita;
  valor fora de faixa é preferência recuperável e cai no default.**

**A verificação é medida, não visual.** `overlayTheme.test.ts` simula deuteranopia e
protanopia (matrizes de Viénot 1999, em RGB linear) sobre cada cor que carrega significado
no mapa e exige distância mínima entre todos os pares; **o mesmo teste é virado contra a
paleta ANTIGA e exige que ela FALHE**, senão o limiar não estaria provando nada. O par
"ameaça × unidade inimiga" é declarado como colisão intencional em código (ameaça É o
alcance dos inimigos) em vez de escondido no teste.

**O teste pegou um erro meu na primeira execução:** a mira (roxo `CC79A7`) ficava a
distância 15 da montanha (cinza médio `9AA0A6`) em deuteranopia — o overlay de alcance de
skill sumia em cima de montanha. A montanha foi escurecida para `6E7378`, separando as duas
por luminância.

No navegador, a leitura de pixel **não pode sair do canvas direto**: ele é WebGL sem
`preserveDrawingBuffer` e volta preto. O roteiro fotografa o elemento e devolve a foto ao
navegador como data URL para ler com `getImageData` de um canvas 2D.

`RULES_VERSION` **não subiu** (segue `0.12.0`): `packages/core` e `packages/data` não têm
uma linha alterada — a fatia é inteiramente `apps/client`.

## M14 — Economia PvE

### M14 — sub-sessão 1/N: as regras e o conteúdo da economia

§10 são cinco linhas de prosa e **nenhum número**. Quase tudo desta fatia é decisão fora da
spec; as três maiores foram levadas ao usuário antes de qualquer código.

**Decisão do usuário: o estado de conta do PvE mora no SERVIDOR**, como o PvP de M7/M8 —
é o que §9.4 pede ("estado de conta recalculado a partir do inventário no banco") e evita
duas economias, já que as marcas de arena e o herói já vivem lá. Consequência aceita: a
campanha, hoje 100% local, passa a exigir o token de M7 para farmar. Esta fatia não
implementa nada disso: implementa as REGRAS puras que o servidor vai chamar em 2/N.

**Decisão do usuário: energia com regeneração contínua** (+1 a cada intervalo, até um teto
de conta), não recarga diária. §10 só diz "energia de conta limita o farm diário".

**Decisão do usuário: awakening por materiais de chefe, imprint por fragmento do herói.**
§10 diz "Imprint: duplicatas viram bônus permanente de stat", mas o projeto não tem coleção
de heróis e gacha está fora de escopo (§15), então a "duplicata" virou um consumível
(`MaterialDef.kind: 'heroFragment'`) que pertence a um herói nomeado (`forHeroId`) e dropa
na masmorra de Chefe — que §10 já define como a fonte de "materiais de promoção".

**Registrado sem perguntar:**

- **O tempo entra por parâmetro.** `resolveEnergy(estado, nowMs, regras)` é pura; quem lê o
  relógio é o servidor. Sem isso a regra 1 cairia — e é o que torna a regeneração testável
  sem esperar o tempo passar.
- **Energia é DERIVADA, não incrementada.** O estado guardado é `{stored, asOfMs}`: a
  energia atual sai da diferença até agora. Dispensa tarefa periódica no servidor. Três
  bordas viraram teste: relógio andando para trás não cria nem destrói energia; a fração de
  intervalo não se perde (o `asOfMs` só anda o que foi consumido em intervalos completos);
  e **no teto o relógio acompanha o agora**, senão um dia parado no teto viraria um dia de
  energia no instante em que o jogador gastasse a primeira unidade.
- **Custo de energia não positivo é rejeitado** — uma masmorra malformada não pode virar
  fonte de energia.
- **Cada tipo de rolagem de drop tem stream de RNG próprio** (`dungeon:gold`,
  `dungeon:gear:i`, `dungeon:material-amount:i`…): acrescentar material a uma masmorra não
  desloca o ouro dela nem os itens. A seed de cada item também é rolada por posição, senão
  os N itens de uma run sairiam do mesmo stream e viriam idênticos.
- **A run é identificada por `runId`,** não só pela seed da conta: duas entradas na mesma
  masmorra com a mesma seed precisam diferir, senão farmar seria repetir o mesmo drop para
  sempre.
- **O gate de awakening no talento é do DADO** (`TalentNode.minAwakening`), não do motor.
  §10 nomeia 5 para o caso que descreve, mas travar o 5 no código proibiria uma classe
  futura de exigir outro rank. O campo é opcional e `validateAllocation` trata awakening
  ausente como 0 — nenhuma alocação de M5 a M13 muda de resultado.
- **`intMul`/`intDiv` entraram em `math/fixed.ts`.** Energia por intervalo de tempo é
  contagem inteira fora da escala 1000, e `fpMul`/`fpDiv` não servem (multiplicar um
  instante em milissegundos por 1000 chega perto do limite seguro de inteiro do JS). Ficam
  nos helpers porque a regra do projeto é que multiplicação e divisão só acontecem lá.
- **Teto de imprint é 5 porque `ClassDef.imprintFlat` tem 6 entradas desde M1** (imprint
  0..5). Subir além não teria bônus algum para ler. O teto 6 do awakening é da spec.
- **Falhar alto em tabela curta:** se a tabela de custo não define o passo corrente, o
  motor recusa em vez de despertar de graça — erro de conteúdo não vira progressão grátis.

**Gap consciente, para 2/N:** `pedras` existe como moeda (§10 nomeia três) e a masmorra de
Chefe as dropa, mas **nada as gasta ainda** — a loja de M8 cobra em marcas de arena. Criar
um sumidouro de pedras é decisão de balanceamento do servidor, não desta fatia.

**"Nunca poder bruto" ainda não virou teste** — a definição verificável (nenhuma oferta
concede material de awakening, fragmento ou enhance garantido, e todo item vendido existe
no mesmo pool que dropa) pertence a 2/N, onde a loja vive.

`RULES_VERSION` `0.12.0` → **`0.13.0`**. `GOLDEN_HASH` intacto e `pnpm balance` idêntico: o
torneio não farma, não desperta e não aloca talento com gate.

### M14 — sub-sessão 2/N: a masmorra como batalha, e as tabelas que nunca existiram

**Decisão do usuário: a masmorra é uma BATALHA de verdade, com dificuldades.** As menores
precisam ser limpas manualmente uma vez e depois aceitam time automático — "que ainda sim
teria que ser forte o suficiente para passar"; a alta dá mais recursos, é **sempre manual**
e tem a entrada **travada por tempo**, resetando "em dias X da semana ou do mês dependendo
do conteúdo". A varredura custa **a mesma energia e dá a mesma recompensa** que a entrada
manual (segunda decisão do usuário): varrer é conveniência, não desconto nem pênalti.

Isso encaixou na máquina existente sem conceito novo: uma masmorra é um **encounter** (mapa
+ elenco, M12) com recompensa e custo por cima, e a varredura é `decideMapAiCommand` (§9.1,
M7) jogando **os dois lados** até o desfecho. **"Forte o bastante" cai fora da simulação** —
não existe número de dificuldade, não existe rolagem de sucesso: o time que não vence, não
vence, e perde a energia igual. Há teste com um time fraco perdendo de propósito.

**Decisão do usuário: enhance cobra pedras + ouro.** §7.3 define a mecânica e as chances e
nenhum custo. Isso fecha o gap declarado em 1/N: as pedras dropavam e nada as gastava.

**Registrado sem perguntar:**

- **Calendário civil próprio, sem `Date`.** Saber que dia é um instante é obrigatório para
  a trava de tempo, e a regra 1 proíbe `Date` no core — além de `Date` ser sensível ao fuso
  do processo, e cliente/servidor/`sim-cli` precisarem concordar byte a byte. A conversão é
  o algoritmo de Hinnant em aritmética inteira. **O reset é em UTC**, com hora opcional no
  dado: sem uma referência, "dia" não tem definição, e fuso por jogador é conceito que o
  projeto não tem.
- **Dia do mês declarado que não existe naquele mês simplesmente não acontece** (31 em
  fevereiro): nenhum reset naquele mês, em vez de escorregar para o dia 1 do seguinte.
- **A entrada é derivada, como a energia** (`{used, asOfMs}`): sem tarefa periódica, e
  atravessar o mesmo reset duas vezes não devolve entrada duas vezes.
- **Teto de comandos na varredura** (`AUTO_BATTLE_COMMAND_BUDGET`): não é regra de jogo, é
  o que impede um mapa mal autorado de rodar para sempre dentro do servidor. Comando
  recusado cai para `wait` em vez de virar laço infinito.
- **Masmorra é sempre `casual`** (§5.7 exige permadeath declarada, nunca hardcoded): um mapa
  repetível com morte permanente seria uma armadilha.
- **O encounter de masmorra declara VAGAS, não heróis.** Quem entra é o time que o jogador
  escolher (3/N monta o `BattleSetup` a partir do roster); um herói de referência ocupa cada
  vaga para o confronto ser jogável por si só, do mesmo jeito que o piloto testa a campanha.

**Dois erros meus que os testes pegaram, ambos corrigidos:**

1. **Encounter de masmorra em `encounters/` virou capítulo de campanha.** A campanha do
   cliente passaria de 6 para 14 capítulos, e o piloto de M12 passou a jogar masmorra. Virou
   tipo de conteúdo próprio (`dungeon-encounters/`, schema próprio **sem `chapter`** — a
   ausência de capítulo é exatamente o que separa os dois). O `chapter: 100 + índice` que a
   primeira versão usava era o cheiro do erro.
2. **Coordenadas de unidade escolhidas à mão caíram fora do mapa.** Agora o gerador
   **deriva as posições do layout**: os tiles passáveis mais próximos de cada canto oposto,
   em ordem determinística. Dois testes de conteúdo travam a regressão — ninguém nasce fora
   do mapa, ninguém nasce em rocha.

**Conteúdo que nunca existiu e entrou aqui por necessidade:** `substat-weights/`,
`mainstat-weights/` e `enhance-rates/`. Os três schemas existem desde M4, mas só havia
fixture em `test-fixtures/` — ou seja, **nada fora de teste conseguia gerar um item**, e o
drop de masmorra depende exatamente disso. Os três números que §7.3 dá (100%, 65%, 40%)
estão travados por teste.

`RULES_VERSION` `0.13.0` → **`0.14.0`**. Nenhum comportamento pré-existente mudou.

### M14 — sub-sessão 3/N: o servidor do farm

Estado de conta do PvE no servidor (energia, ouro, pedras, materiais, inventário, limpezas e
trava de entrada), o catálogo carregando a economia, e a masmorra jogável de ponta a ponta
pelo mesmo fluxo do PvP de M13 2/N: **ticket → jogar → submeter → o servidor reexecuta**.

**Registrado sem perguntar:**

- **O ticket não cobra energia; a submissão cobra.** Abandonar um ticket não pode custar
  recurso. Em compensação, pedir muitos tickets consome a mesma cota do rate limiter — o
  mesmo contorno (e o mesmo risco residual de procurar seed favorável) já registrado em M13.
- **Derrota gasta energia e não paga nada.** É o que dá peso à decisão de entrar com um time
  fraco, e o que faz a frase da decisão do usuário ("ainda sim teria que ser forte o
  suficiente") ter consequência em vez de ser only-flavor.
- **A seed da BATALHA e a seed do DROP saem do mesmo nonce, por sufixos diferentes.** Sem
  isso, conhecer um lado deixaria inferir o outro.
- **A entrada da elite é consumida ANTES da energia**: gastar energia e só então descobrir
  que não há entrada seria cobrar por uma partida que não aconteceu.
- **Só a vitória MANUAL marca a masmorra como limpa** — é ela que libera a varredura.
- **O encounter da masmorra declara VAGAS**: em produção elas são preenchidas pelo roster do
  jogador, e o elenco de referência do conteúdo só existe para o confronto ser jogável (e
  testável) sozinho.
- **`gold` e `energy_as_of` são `bigint` no banco** (ouro acumula; instante em ms não cabe em
  `integer`), e o driver `pg` devolve bigint como string — a conversão acontece na fronteira,
  em `rowToPlayer`, senão o core receberia `NaN`.

**Dois defeitos de conteúdo que só uma simulação pegaria, e que agora têm teste:**

1. **Três masmorras NUNCA TERMINAVAM.** Com a IA de mapa dos dois lados, os dois times
   paravam a dois tiles um do outro em lados opostos de uma crista: `mapAi` escolhe tile por
   distância de Manhattan e trava em mínimo local contra parede — limitação de M7 que a
   regra 6 ("nada de IA esperta") manda não resolver deixando a IA mais inteligente. **A
   correção foi de conteúdo:** as posições passaram a ser HERDADAS dos capítulos de M12, que
   o piloto automático já provou jogáveis nesses layouts; a Forja mudou de layout, porque o
   do capítulo 2 vira impasse com IA nos dois lados.
2. **A elite precisava ser dura, não impossível.** O teste afirma as duas metades: com o time
   de referência ela é derrota (é o que a torna elite), e com um time 20 níveis acima ela
   cai. Sem a segunda metade, "difícil" seria indistinguível de "inacabável".

O `referenceLevel` entrou no gerador por causa disso: o encounter declara o time contra o
qual a masmorra foi ajustada, o que transforma a dificuldade numa afirmação verificável.

Pendências para 4/N: enhance, equipar, awakening e imprint por rota (as três primeiras já
têm a regra no core desde 1/N e 2/N), mais a trava de "nenhuma moeda compra poder bruto". O
cliente é 5/N. `RULES_VERSION` **não subiu** (segue `0.14.0`): esta fatia é servidor e
conteúdo, sem regra nova.

### M14 — sub-sessão 4/N: progressão por rota e a trava de "poder bruto"

Enhance, equipar, awakening e imprint como rota, e o critério "nenhuma moeda compra poder
bruto" transformado em teste. As quatro regras já existiam no core (M4; M14 1/N): esta
fatia é autorização, ordem das operações e persistência.

**Registrado sem perguntar:**

- **Falhar no enhance cobra igual.** §7.3 define a chance decrescente como o freio do
  sistema; uma chance que não custa nada não é chance, é um botão de "+15 garantido".
- **A seed do enhance sai do nonce por HMAC**, como todo o resto. Sem isso o cliente
  escolheria QUANDO tentar e a chance de §7.3 viraria decoração.
- **O fragmento do imprint é resolvido pelo CATÁLOGO** (`forHeroId`), não aceito no corpo da
  requisição. O motor já recusaria o fragmento de outro herói — mas a rota não deve nem
  oferecer a pergunta.
- **O item substituído ao equipar volta para o inventário.** Nada some.
- **Uma tabela de idempotência genérica** (`economy_actions`, migração `0008`) para as
  quatro ações, pelo mesmo motivo do nonce da batalha: um reenvio de rede (o cliente não
  sabe se a primeira chegou) cobraria duas vezes. `dungeon_runs` não servia — ela é
  específica de masmorra.

**A definição verificável de "poder bruto"**, que 1/N deixou registrada e esta fatia
transformou em `apps/server/tests/poderBruto.test.ts`:

1. Nenhuma oferta da loja vende material, fragmento ou item já aprimorado/reforjado.
2. Todo item vendido existe no catálogo comum, e **todo set vendido também dropa em alguma
   masmorra** — a loja adianta o que se farmaria, não cria poder que só ela tem.
3. Awakening e imprint são cobrados em MATERIAL, e todo material cobrado dropa em masmorra:
   não existe rota que troque moeda por rank.
4. O enhance é uma CHANCE (nem todo marco é 100%), não uma compra garantida.

O ponto 3 é sobre o servidor, não sobre o dado, e por isso é lido do código das rotas: o que
garante a regra é **não existir** rota que converta moeda em progressão — inclusive não
existir conversão de ouro de PvE em marcas de arena, que compraria a loja por outro caminho.

`RULES_VERSION` **não subiu** (segue `0.14.0`).

### M14 — sub-sessão 5/N: a tela do farm (fecha M14)

O cliente ganha a masmorra, a conta e o resto do ciclo. A batalha de masmorra **reusa
inteira** a máquina que M13 2/N construiu para o PvP — ticket, `battleState`, `commandLog`,
submissão —, porque do ponto de vista do cliente as duas coisas são "jogar um confronto que
o servidor montou e devolver os comandos". Nenhuma regra nova no cliente (regra 3): a
disponibilidade de cada masmorra (trancada, sem energia, varredura liberada) chega
**resolvida** do servidor e o painel só desenha.

**Registrado sem perguntar:**

- **Submeter sai da masmorra.** Achado da verificação: com o ticket ainda em pé, o painel
  ficava preso na visão de batalha depois da run — sem lista e sem inventário, que é
  justamente o passo seguinte do ciclo.
- **O servidor de desenvolvimento passou a semear ouro, pedras e o herói `hero-jogador`**
  (o único com fragmento declarado no catálogo, portanto o único que pode ganhar imprint), e
  os heróis subiram para nível 40: um time nível 10 perderia toda masmorra e o roteiro
  falaria sobre dificuldade em vez de sobre tela.

**Um bug real que a verificação pegou:** o overlay de fim de capítulo aparecia **por cima de
uma masmorra vencida**, oferecendo "avançar para o próximo mapa" e interceptando os cliques
do painel de farm. Ele só se excluía do modo PvP (`mode === 'pvp'`); agora só a CAMPANHA o
mostra. O mesmo teria acontecido em qualquer modo futuro que não fosse campanha.

**Duas medições do meu roteiro que estavam erradas e foram corrigidas** (registradas porque
uma delas quase virou "verde falso"): contar itens equipados não prova nada, porque o drop
**substitui** o item do mesmo slot — a prova é o item aprimorado aparecer entre os
equipados; e o 400 do despertar sem material é provocado de propósito, então o roteiro
afirma que ele é o **único** erro de console, em vez de exigir zero.

`RULES_VERSION` **não subiu** (segue `0.14.0`).

### Auditoria 2026-08-14 — roadmap pós-M14 (M15, M16) e direção de arte

Sessão de auditoria, sem código. Mesmo papel dividido da auditoria de 2026-08-07: a auditoria
decide, um agente separado implementa. O usuário pediu a preparação dos próximos passos com
foco em começar a parte gráfica, precedida de pesquisa ampla sobre desenvolvimento gráfico
assistido por IA bem-sucedido.

**Estado verificado (rodado, não lido do `PROGRESS.md`):** M0–M14 completos, 14 componentes de
cliente, 1184 linhas de CSS. **A camada gráfica do jogo são 9 retângulos, 2 círculos e 3
linhas** em 358 linhas de `MapCanvas.tsx` — zero sprites, zero texturas, zero arquivos de
imagem no repositório.

**Achado que reordenou o milestone (mais urgente que gráficos):** `PUT /me/defense` existe em
`apps/server/src/battle/routes.ts:162` desde M7 e `grep -rn "defense" apps/client/src` não
retorna nada. O jogador não consegue montar o time que defende, então o PvP assíncrono inteiro
— servidor, ELO, matchmaking, replays, anti-cheat, fuzz de 1000 partidas — é inalcançável sem
`curl`. Decidido com o usuário: **M15 fecha esse loop, M16 é o gráfico.** Apresentação em cima
de um loop de jogo que não fecha é maquiagem.

**Correção de uma pendência mal registrada:** `PROGRESS.md` afirmava que `Tile.object` estava
"sem leitor no motor". Falso — `battle/commands.ts:120` lê `fort`/`camp` para +1 AP no `rest`.
O problema real, verificado: o tipo declara 5 valores, só 2 têm leitor, e nenhum mapa de
`packages/data` usa o campo. Requalificado no briefing de M15 (D3: implementar `wall`/`gate`,
remover `chest`, e autorar conteúdo que use os valores — campo que nenhum conteúdo usa é
código morto por outro nome). As outras 3 pendências (`lifesteal` inerte,
`summonReinforcement` rejeitando explicitamente, "+2 Valor ao capturar") foram confirmadas
reais.

#### Direção de arte — decisão e fundamentação da pesquisa

**Decisão: visual programático, definitivo, zero assets raster (M16).** Não é placeholder nem
consolo por não haver artista — é a direção de arte do jogo.

A pesquisa separou duas coisas que a discussão pública confunde, e que têm perfis de risco
opostos:

- **Arte raster generativa** (difusão/LoRA → sprites, retratos, tilesets): o agente produz
  imagens. Não determinístico, não diffável, procedência juridicamente cinzenta, **exige
  disclosure na Steam**, e risco reputacional documentado em casos nomeados — *Hardest*
  delistado pelo próprio autor após reviews chamarem a arte de "soulless"; *Postal: Bullet
  Paradise* cancelado **um dia** após o anúncio; *Clair Obscur: Expedition 33* teve o GOTY do
  Indie Game Awards **rescindido** e trocou texturas geradas em patch cinco dias após o
  lançamento — ou seja, punição mesmo para um jogo aclamado. Tecnicamente o problema é pior
  que o reputacional: jogo precisa de *sistema* (silhueta repetível, proporção estável, lógica
  de luz coerente, saída animável através de centenas de assets), e até as fontes favoráveis à
  IA convergem em que o paintover humano é etapa obrigatória. Não há artista humano neste
  projeto, então o estágio que faz o pipeline funcionar não existe.
- **Visual programático** (código que desenha: vetor, geometria, shader, animação): o agente
  produz **código** — determinístico, diffável, revisável, versionado, sem licença duvidosa, e
  **sem disclosure** (a reescrita do formulário da Steam de jan/2026 isenta explicitamente
  ferramentas de desenvolvimento, restringindo a exigência a conteúdo gerado que o jogador
  experimenta).

**Limitação central, de fonte primária, que vira regra de processo:** o LLM **não consegue
julgar o próprio resultado visual**. O relato de Three.js + Claude descreve um "text
bottleneck" — o modelo domina a API mas trabalho visual-espacial exige *representational
grounding*, e o modelo "não tem nada parecido com rotação mental"; ajustes que um humano faz
em segundos viram diálogo verboso. O paper de evolução de shaders GLSL confirma pelo outro
lado: funciona bem (menos de 3% de erro de compilação; novatos produziram 4,2 shaders vs. 0,6
sem a ferramenta) **precisamente porque o humano é o juiz estético** — juiz multimodal
autônomo é declarado trabalho futuro. Mitigação parcial: loop de screenshot via ferramenta de
browser reduz iteração de UI de 10+ para 2–3 ciclos. **Regra para M16: o agente gera, tira
screenshot e corrige o objetivo; o usuário julga o que é gosto. O agente nunca auto-certifica
estética.**

**O argumento decisivo é de design, não de risco.** Subset Games, sobre Into the Breach:
"sacrifique ideias legais em nome da clareza, toda vez" — inimigos mostram o que vão fazer,
mapa pequeno, regras legíveis; armas interessantes foram cortadas por prejudicarem a leitura.
A regra 6 do `CLAUDE.md` deste projeto diz "previsibilidade é o produto", e o requisito mais
importante de §11 é o preview de duelo — uma tela cujo valor inteiro é legibilidade. **Este é
um jogo cujo produto é a leitura, não o espetáculo.** Linguagem geométrica/vetorial feita com
capricho é a direção correta para este design, e por coincidência é a que um agente executa
bem.

**Hedge arquitetural exigido em M16:** o renderer ganha uma costura trocável de representação
de unidade, com uma segunda implementação de teste provando que é trocável. Adia o caminho
raster sem fechá-lo. **Limitação reconhecida e não resolvida:** retratos de personagem e key
art para loja/marketing não têm solução programática; se o jogo for para a Steam, a resposta é
artista humano ou pack licenciado (Kenney: ~60 mil assets CC0, uso comercial, sem atribuição).
Decisão adiada de propósito — não é problema de M16.

Briefing de M16 **não** foi escrito nesta sessão, seguindo o método estabelecido em
2026-08-07: briefing detalhado só quando o milestone vira o próximo. A pesquisa e a decisão
ficam registradas aqui para não se perderem.

Nenhuma mudança de código nesta sessão — só a auditoria, as entradas M15/M16 em
`docs/spec/09-roadmap.md`, o briefing `docs/milestones/M15-fechamento-do-loop-de-pvp.md` e a
atualização de `PROGRESS.md`.

## M15 — Fechamento do loop de PvP e pendências

### M15 — sub-sessão 1/N: as quatro pendências do motor

Só `packages/core` e o schema de mapa de `packages/data`, testes antes. Conteúdo é 2/N, a tela
de defesa de arena é 3/N, `pnpm balance` e o aceite são 4/N — ordem do §5 do briefing
`docs/milestones/M15-fechamento-do-loop-de-pvp.md`, que foi lido inteiro e cujas decisões
D1–D4 **não** foram reabertas.

**Duas coisas o briefing deixou em aberto de propósito, e as duas foram ao usuário antes de
qualquer código:**

**Decisão do usuário — o portão abre por um lado e QUEBRA pelo outro.** D3 dizia "`gate` como
bloqueio destrutível **ou** abrível" e deixava a escolha; a resposta acrescentou um requisito
que o briefing não previa: abrir pelo `wait` adjacente, "mas em algumas fases principalmente
de PvE esse gate poderia ser lockado a abrir apenas por um lado e pelo outro lado necessitar
ser quebrado". O tile declara `gate: { opensFor: 'player'|'enemy'|'any', durability: n }`;
quem o lado abre, abre de vez; quem não abre, bate, e o portão cai depois de `durability`
turnos-unidade. **Ausente = portão simples** (qualquer um abre, num turno), o que mantém
`{ object: 'gate' }` sozinho sendo conteúdo válido.

**Decisão do usuário — "objetivo" (§5.6) é o tile de controle.** A spec diz "+2 ao capturar
objetivo" e não define objetivo em lugar nenhum. Das três leituras apresentadas, a escolhida
foi `Tile.object` `fort`/`camp` — o mesmo par que §5.4 já trata como tile valioso (+1 AP no
`wait`), o que dá ao campo um segundo leitor e um motivo de existir no conteúdo, que é
justamente o que D3 exige. A alternativa "tile-alvo da `winCondition`" foi descartada com
medida, não por gosto: em `seize` a vitória é imediata (`winCondition.ts:32`), então o +2 seria
pago no instante em que a batalha acaba e nunca poderia ser gasto.

**Registrado sem perguntar (leituras diretas da spec ou do briefing):**

- **Vampirismo entra no ponto ÚNICO por onde dano vira HP no duelo**
  (`applyDamageWithLethalTrigger`, criado em M10 8/N), não em cada chamador — golpe principal e
  contra-ataque passam pelos dois caminhos e duplicar a regra garantiria divergência. A base é
  o dano **efetivamente aplicado**: um golpe de 5000 num alvo com 30 de vida vampiriza sobre
  30, não sobre 5000.
- **Assistência não vampiriza**, e isso é limitação declarada, não esquecimento: quem assiste
  não é participante do duelo, então seu HP não existe nessa camada — mesma limitação que M12
  2/N já registrou ao explicar por que reação e assistência não conseguem ser mais que um
  número de dano neste motor.
- **`heal` (cura dada/recebida) não multiplica o vampirismo**: são dois stats distintos em §4.1
  e D1 não os relaciona; empilhá-los seria inventar uma sinergia que ninguém pediu.
- **`wall` bloqueia movimento, não linha de visão.** `Terrain.blocksSight` existe desde M3 e
  **não tem um único consumidor no motor**; implementar visão seria sistema novo, fora do
  escopo declarado do briefing (§7: "nenhuma expansão além do mínimo").
- **Bloqueio por objeto é independente do terreno**, e é por isso que ele não podia ser escrito
  como `moveCost: 'impassable'`: §5.1 diz que voadores custam 1 em tudo exceto impassável,
  então um muro expresso como terreno seria atravessável por quem voa.
- **O estado do portão mora no `BattleState`, não no `GridMap`.** O mapa é a FASE (conteúdo
  imutável, compartilhado entre partidas); qual portão já caiu é da PARTIDA. Misturar os dois
  faria uma batalha editar o conteúdo da outra.
- **Durabilidade em turnos-unidade, não HP com fórmula de dano.** Arrombar não passa por
  `computeDamage`, não rola RNG, não vira alvo de duelo e não entra na matriz de `pnpm
  balance` — e "3 turnos para arrombar" é um número que o autor de fase controla direto. A
  alternativa (portão como unidade-objeto com HP) mexeria em duelo, preview, iniciativa e IA
  de mapa de uma vez, por um sistema que a spec não descreve.
- **Nenhuma ação nova**: §5.4 lista quatro (`engage`, `mapSkill`, `rest`, `wait`) e o `wait`
  **já** é condicional ao tile. Abrir/arrombar custa o turno, que é o preço; a quinta ação que
  seria necessária contradiria a tabela normativa.
- **A captura é uma vez por tile por batalha e só do jogador.** Sem o primeiro limite, entrar e
  sair do mesmo fort seria bomba de Valor infinita; o segundo é literal de §5.6, que define
  Valor como o recurso do exército do jogador. E é **encerrar o turno**, não pisar: capturar é
  ficar. A checagem fica num ponto só (`applyCommand`), porque espalhá-la pelas quatro ações
  que encerram o turno garantiria esquecer uma.
- **O blueprint da invocação chega pronto em `BattleSetup.summonBlueprints`**, espelhando como
  `valorSkills` entrou em M11: montar um `BattleUnit` a partir de `Hero`+catálogo é trabalho de
  `packages/content`, e o core não importa conteúdo (regra 1). É o que torna D2 executável sem
  violar a regra 4 — a unidade invocada é conteúdo.
- **A invocada recebe `unitId` próprio e determinístico** (`blueprint@rN:x,y`): reusar o id do
  blueprint criaria duas unidades com o mesmo `unitId` na segunda invocação, quebrando
  iniciativa, duelo e replay de uma vez. Round + tile são únicos por invocação, porque o tile
  fica ocupado logo depois.
- **A invocada não age no round em que nasce.** Dar um turno extra imediato seria regra que
  §5.6 não menciona; o preço em Valor já é a decisão.
- **A rolagem de iniciativa da invocada usa o round corrente** (a lista inicial usa 0), o que
  lhe dá stream próprio sem tocar no da montagem. **A regra 9 continua valendo byte a byte:**
  `insertIntoInitiativeOrder` INSERE, e nenhuma entrada existente é re-rolada nem reordenada —
  §5.3 autoriza isso explicitamente ("unidades que entram depois são inseridas na posição
  correspondente ao seu valor de iniciativa"), e há teste comparando a lista antiga inteira,
  entrada por entrada, antes e depois da invocação.
- **O +1 PP do terço final não vale para a invocada**: §5.3 dá esse bônus a quem "começa a
  batalha" na cauda da lista, e recalculá-lo a cada reforço mexeria no PP de terceiros.
- **O `MapContent` de `packages/content` passou a usar o `Tile` do core** em vez de redeclarar
  `{terrain, height}`: o loader sempre repassou os tiles por referência, então `object`/`gate`
  já sobreviviam em runtime, mas o tipo local afirmava o contrário — armadilha pronta para a
  fatia de conteúdo.

**Um erro meu que os testes pegaram, e um que quase virou sujeira permanente no repositório:**
(1) o teste do muro num 3×3 esperava contornar a parede com alcance 3, e a volta pela borda
custa 4 — a asserção estava errada, não o motor; (2) rodei `npx tsc -b` na raiz para conferir
tipos e ele **emitiu 171 arquivos `.js`/`.d.ts` CommonJS dentro de `src/`**, que o `pnpm test`
da raiz então carregou no lugar dos `.ts` ("exports is not defined in ES module scope") — a
suíte inteira "falhou" por um motivo que não tinha nada a ver com o código. Os artefatos foram
removidos por critério explícito (só arquivo com irmão `.ts` de mesmo nome), e a árvore foi
conferida depois. O comando de typecheck do projeto é `pnpm typecheck` (`tsc --noEmit` por
pacote), **nunca** `tsc -b` na raiz.

**O teste de M11 que travava `summonReinforcement` SEM resolução foi reescrito, não apagado:**
ele agora mede a metade que D2 manda preservar — quando a resolução falha, o Valor não é
debitado —, pelo caminho que ainda pode falhar (blueprint ausente do catálogo).

**Números:** 64 testes novos (58 no core: 7 de vampirismo, 11 de objeto de mapa, 12 de portão,
12 de captura de Valor, 16 de invocação; 6 no data, travando o schema do tile depois de D3).
Suíte: **92 arquivos, 1192 testes** (era 87/1128). `RULES_VERSION` `0.14.0` → **`0.15.0`**.
`GOLDEN_HASH` **intacto** (`c3a404a0`) e `pnpm balance` idêntico ao baseline — 42,5%–59,9% com
`spd` em 20,0%, os dois critérios de M8 batendo: o torneio e o replay canônico têm
`lifesteal: 0` em todo stat sheet, nenhum mapa com `object` e nenhum `useValor`.

**Pendências desta fatia, todas por desenho:** nenhum mapa de `packages/data` usa `wall`/`gate`
ainda e nenhuma valor-skill do catálogo invoca — é exatamente o que D3 ("autore pelo menos um
mapa usando os valores implementados") e D2 exigem da **sub-sessão 2/N**, e sem isso os quatro
consumidores novos continuam sendo código sem conteúdo. O cliente ainda não desenha portão nem
objetivo capturado, e não sabe que `openGateCoords` existe (3/N).

### M15 — sub-sessão 2/N: o conteúdo que D2 e D3 exigem

A fatia 1/N ligou quatro campos no motor. Esta autora o conteúdo que os exerce, que é o que
separa "código com teste" de "código vivo" — o §7 do briefing chama um campo sem conteúdo de
"código morto por outro nome". Escopo: `packages/data` + o repasse mínimo em `packages/core`
que torna a invocação alcançável por quem monta batalha.

**Decisão do usuário: a fortaleza do capítulo 6 vira alvenaria de verdade.** A pergunta foi
feita porque a leitura mais forte REVERTE uma decisão registrada em M12 3/N. Estado medido
antes de perguntar: a muralha do capítulo 6 era montanha, montanha custa 1 para `flying`
(§5.1), e por isso a Sentinela Alada **sobrevoava a fortaleza** — M12 3/N escolheu isso de
propósito ("a party não pode tratar a muralha como segurança"). `wall` barra quem voa; é
metade da razão de ele existir ao lado de terreno impassável. O usuário escolheu a fortaleza
de verdade, com a consequência aceita: aquele inimigo sai pelo portão como todo mundo, e o voo
dele passa a valer no campo aberto. As outras duas opções (preservar o voo e pôr `wall` no
capítulo 2; ou não autorar `wall`) ficaram registradas na pergunta.

**A arena estava fora desde o começo, e foi verificado, não suposto:** `tools/balance` monta o
torneio no primeiro mapa de arena (`runTournament.ts`, `firstArenaMap`), então mexer em
`map-arena-coliseu` mudaria a matriz de winrate e a regra 10 exigiria rebalanceamento inteiro.

**Uma decisão de regra saiu de uma MEDIÇÃO, não de gosto: o portão trancado
(`GateOpensFor: 'none'`).** A primeira autoria deu o portão à guarnição (`opensFor: 'enemy'`),
que é a leitura óbvia — quem mora no castelo tem a chave. O teste "a fortaleza nasce fechada"
falhou na primeira execução: o portão já estava aberto **antes do primeiro comando do
jogador**. A causa é a IA de mapa de §9.1 resolvendo turno inteiro de uma vez: ela anda até o
portão e, sem ninguém ao alcance, cai em `wait` — que é justamente o comando que abre. Com
isso a fortaleza destrancava no round 1 e a durabilidade virava decoração. `'none'` conserta
sem IA nova (regra 6): a guarnição barrou a porta, ninguém tem a chave, os dois lados
arrombam. Fica também a lição geral: **num portão com dono, o dono o abre imediatamente** —
`opensFor` de um lado só serve para mapa onde aquele lado NÃO tem motivo de se aproximar.

**A evidência de que o conteúdo é exercido, e não só validado:** o piloto automático de M12
joga o capítulo 6 e o **Couraçado arromba o portão em 3 pancadas, no round 2** — a mesma
unidade que o conteúdo descreve desde M12 como "quem aguenta o portão enquanto o resto entra".
Nada disso foi roteirizado no piloto: ele anda em direção ao inimigo, descobre que não passa, e
o `wait` de fallback é o que bate na porta. **O capítulo não ficou mais difícil, ficou mais
longo:** medido contra a versão do último commit, antes 32 comandos / 5 rounds / 1 sobrevivente
de 5; depois 41 comandos / 7 rounds / 1 sobrevivente de 5.

**Registrado sem perguntar:**

- **O piloto de teste aprendeu que portão é CAMINHO, muro não.** A rota dele (BFS de M12 3/N)
  passou a pular `wall` e a **continuar atravessando `gate` fechado**: um portão é caminho que
  custa abrir. Tratá-lo como parede faria o piloto dar a fortaleza por inalcançável e rondar a
  muralha. Não precisou de regra nova para ele arrombar — andando até o portão, o
  `computeReachableTiles` (que conhece o bloqueio de verdade) não devolve o tile, e o piloto
  cai no `wait`, que é o comando que bate na porta. Derrubar a porta da frente é o piso do que
  um humano faz, mesma justificativa que M12 3/N usou para ensiná-lo a contornar montanha.
- **`toSummonBlueprintPlacements` mora em `packages/content`, não em cada chamador.** São TRÊS
  que montam batalha a partir de heróis (cliente, servidor e o piloto) e a conversão é idêntica
  nos três; duplicá-la é o risco que `buildBattleSetupFromHeroes` existe para evitar (§9.1:
  "divergência = bug crítico"). Ela **falha alto** em blueprint com classe ou item ausente:
  silenciar produziria uma invocação recusada no clique, e o jogador leria "Valor insuficiente"
  onde o problema é um id errado num JSON.
- **O servidor repassa os blueprints nas DUAS rotas que montam batalha** (arena e masmorra).
  Não é simetria estética: o cliente joga e o servidor **reexecuta** para conferir (M13 2/N,
  M14 3/N) — se um lado montasse com blueprints e o outro sem, uma invocação do jogador viraria
  "comando inválido" na reexecução e derrubaria a run inteira. `tools/balance` fica de fora de
  propósito: o torneio não passa nem `valorSkills`, porque não emite `useValor`.
- **A invocação é a valor-skill mais cara do catálogo (custo 6).** Valor começa em 5 e rende +1
  por round, então ela nunca sai no round 1 — a não ser depois de capturar um objetivo (+2, a
  regra que 1/N implementou), que é o encaixe que faz as duas metades de §5.6 conversarem.
- **O guarda do portão saiu de cima dele.** Ele nascia em (9,8), o vão que virou portão; um
  tile bloqueado com unidade em cima é estado que o motor não valida e ninguém deveria autorar.
  Virou invariante de conteúdo testada para TODOS os encounters, de campanha e de masmorra:
  ninguém nasce sobre muro ou portão.
- **O `object`/`gate` não sobrevivia ao gerador.** `authorCampaign.ts` montava o tile como
  `{terrain, height}` e descartava o resto em silêncio — o primeiro mapa gerado saiu sem
  muralha nenhuma. As chaves entram condicionalmente, porque `undefined` viraria `null` no JSON
  e o schema recusaria.
- **`MapContent` (`packages/content`) passou a usar o `Tile` do core** em vez de redeclarar
  `{terrain, height}`: o loader sempre repassou os tiles por referência, então os campos novos
  já sobreviviam em runtime, mas o tipo local afirmava o contrário.

**Dois testes de M11/M12 foram reescritos, não apagados:** o que travava o payload solto de
`summonReinforcement` (agora exige `blueprintId`) e o que afirmava que o catálogo cobria "os
três kinds resolvidos" (agora são **quatro**, que é o critério de aceite 3 medido pelo lado do
dado — não basta o motor resolver, tem de existir conteúdo exercendo cada kind).

**Números:** conteúdo novo — 1 schema (`summon-blueprints`), 1 blueprint, 1 valor-skill de
invocação, e o capítulo 6 reautorado (23 schemas, 124 arquivos validando). 19 testes novos
(12 em `packages/data`, 7 em `packages/content`) + 1 no core (portão trancado). Suíte: **94
arquivos, 1211 testes** (era 92/1192). `RULES_VERSION` `0.15.0` → **`0.16.0`** (só pelo modo
`'none'`; o resto da fatia é aditivo). `pnpm balance` **idêntico** — 42,5%–59,9% com `spd` em
20,0%, os dois critérios de M8 batendo.

**Pendências para 3/N:** o cliente **não desenha** muro, portão nem objetivo capturado —
`MapCanvas` pinta o tile pelo terreno, então a muralha do capítulo 6 aparece como planície
pisável, o que é uma mentira visual sobre uma regra que já vale. É trabalho de cliente, que é a
fatia 3/N, e não é linguagem visual nova (D4): é fazer o renderer existente parar de mentir.

### M15 — sub-sessão 3/N: a tela de defesa de arena, e o mapa parando de mentir

A fatia que fecha o critério de aceite 1 e é a razão de o milestone existir: `PUT /me/defense`
existia desde M7 e `grep -rn "defense" apps/client/src` não retornava nada, então o jogador não
conseguia definir quem defendia o castelo dele e o PvP assíncrono inteiro — ELO, matchmaking,
replays, anti-cheat, fuzz de 1000 partidas — era inalcançável sem `curl`.

**Uma rota nova no servidor, e ela é o que torna o critério verificável: `GET /me/defense`.**
O `PUT` nunca teve par de leitura. Sem ele o cliente sabe o que acabou de enviar e nada mais —
e "a defesa **persiste**", que é metade do critério de aceite, não seria demonstrável pela tela,
só por inspeção do banco. Devolve **404 quando não há defesa montada**, e não um corpo vazio:
"ainda não montei" é um estado diferente de "montei um time sem ninguém", e a tela precisa
distinguir os dois para não oferecer "salvar" como se fosse "atualizar".

**Registrado sem perguntar:**

- **A tela impede os quatro erros do contrato antes de eles virarem requisição** (briefing §2),
  e ainda assim trata a resposta de erro: teto de 5 heróis, `mapId` do catálogo, um herói por
  tile, e — regra que só existe a partir de M15 — **nada de posicionar em muro, portão ou
  terreno intransponível**. Esta última é importante e nova: o motor **não valida colocação
  inicial**, então uma unidade posicionada dentro de uma parede nasceria presa e a batalha
  começaria quebrada. Quem tem de recusar é a tela.
- **A altura sai do TILE, nunca de um campo digitado.** Mesmo raciocínio de `move` no motor e da
  autoria de mapa em M12: um número à mão criaria vantagem posicional (§5.5) que o terreno não
  sustenta.
- **Só mapas de arena são oferecidos** (`map-arena-*`). O servidor aceita qualquer `mapId` do
  catálogo, mas o atacante nasce na borda esquerda por posição fixa desde M7, e um mapa de
  campanha não foi desenhado para isso — ofereceria uma defesa em que o atacante pode nascer
  dentro de uma floresta ou colado na muralha.
- **Trocar de mapa zera as posições.** Uma coordenada de um mapa não significa nada em outro;
  carregá-la adiante poria unidade fora do grid ou dentro de alvenaria.
- **`savedDefense` e `defenseDraft` são estados separados.** Um é o que o servidor tem, o outro
  é o que o jogador está montando. Sem a separação, a tela mostraria como persistido um
  rascunho que nunca subiu — e o jogador iria dormir achando que trocou a defesa.
- **A defesa é lida no login**, junto de `me`/`roster`: quem vai atacar precisa ver o que está
  defendendo por ele antes de decidir.
- **Os cinco arquétipos vêm TRADUZIDOS, com o que cada um faz** — "essa escolha é o conteúdo
  tático da tela" (briefing §2), não detalhe de formulário: é a única coisa que o defensor
  decide sobre uma batalha que ele não vai jogar. Mesma disciplina do editor de táticas de M6
  5/N, que traduz `Condition` em vez de mostrar o nome do campo.

**O mapa parou de mentir (a pendência que 2/N deixou registrada).** `MapCanvas` pintava o tile
pelo TERRENO e mais nada, então a muralha do capítulo 6 aparecia como planície pisável — uma
mentira visual sobre uma regra que já valia no motor desde 1/N. Agora:

- **muro** é bloco maciço; **portão** são batentes dos dois lados, com uma **tranca
  atravessada** quando fechado e só os batentes quando aberto. **A distinção é de FORMA, não de
  cor** — é o que mantém a garantia de M13 4/N valendo com um objeto novo no mapa, e o que faz
  muro, portão fechado e portão aberto continuarem distinguíveis em preto e branco. Uma única
  cor entrou na paleta (`structure`), e ela **passou pelo teste de simulação de dicromacia** que
  M13 4/N construiu, na paleta segura.
- **tile de controle** (`fort`/`camp`) ganhou moldura na cor de objetivo, com um quadrado cheio
  no canto quando já capturado. Sem isso o "+2 Valor ao capturar" de 1/N seria uma regra
  invisível: o jogador não teria como saber que aquele tile paga, nem que já pagou.
- **Dois pontos onde o cliente calculava alcance ignoravam os portões** e foram corrigidos: o
  alcance de movimento (o cliente desenharia um tile que o `move` do core recusa) e o overlay de
  ameaça (o jogador se acharia em perigo atrás de uma parede que o inimigo não pode cruzar).
  Regra 3 na prática: o desenho tem de ser a MESMA conta que a validação.

**A verificação é o ciclo de aceite inteiro, por CLIQUES no navegador** (Vite + servidor de dev
em memória + Chromium, método de M9 3/4). O defensor conecta, **lê do servidor** a defesa que
tinha, **tira os dois heróis e reposiciona os dois por clique** em (11,5) e (11,9), troca o
arquétipo de um deles para "Guarda o tile", salva — a tela passa de "há mudanças não salvas"
para "igual ao rascunho". **Recarrega a página**, reconecta, e posições e arquétipo voltam do
servidor. Então o **segundo jogador** conecta, acha esse oponente, inicia a batalha — e a lista
de iniciativa traz exatamente os dois heróis que o cliente do defensor posicionou —, joga até o
desfecho, **submete, e o servidor decide**: derrota em 9 rounds, ELO 1200→1184 (defensor 1216),
3 marcas. Por fim o **replay vem do servidor** e abre no passo 0 de 12. **Nenhum `curl` em
nenhum momento.** Erros de console: **um só, provocado de propósito** — o 404 de
`GET /me/defense` do atacante, que nunca montou defesa (o navegador registra todo fetch com
status de erro). Mesma disciplina de M14 5/N: o roteiro afirma qual é o erro esperado em vez de
exigir zero e fingir que não existe.

**Números:** 16 testes novos (12 no cliente, travando as recusas do rascunho que o roteiro de
navegador não prova de forma barata; 4 no servidor, para `GET /me/defense` — 401, 404 de quem
nunca montou, devolve o que o PUT salvou, e cada jogador lê a própria). Suíte: **95 arquivos,
1227 testes** (era 94/1211). `RULES_VERSION` **não subiu** (segue `0.16.0`): esta fatia não tem
uma linha de regra — é tela, rede e desenho. `packages/core` só ganhou os exports que o cliente
consome.

**Pendência para 4/N:** `pnpm balance` reexecutado e o fechamento do milestone. O ciclo de aceite
já foi medido aqui; falta consolidar os quatro critérios com a saída de cada comando.

### M15 — sub-sessão 4/N: balanceamento e aceite (fecha M15)

**O briefing (§5.4) avisava que "`lifesteal` e invocação mudam winrate, então os dois critérios
de M8 precisam ser reconfirmados, não assumidos".** Reconfirmados: `pnpm balance -- --runs
10000` devolve **42,5%–59,9%** com `spd` em **20,0%** das builds vencedoras — nenhuma
composição acima de 65%, e a concentração de `spd` bem abaixo do teto de 60% de §6.7.

**A matriz saiu idêntica ao baseline de M12 2/N, e a medição mostra POR QUE — que é mais
importante do que o número:**

- **Nenhum item, set, classe, comp ou tabela de substat do catálogo concede `lifesteal`.**
  Verificado por varredura, não presumido: `grep -rn "lifesteal" items/ item-sets/ classes/
  comps/ substat-weights/ mainstat-weights/` não devolve **nenhuma** ocorrência. O set
  "Vampiro" que §7.4 especifica (`+20% lifesteal`, 4 peças) **nunca foi autorado** — os seis
  sets do catálogo são Duelista, Força, Guardião, Imunidade, Reserva e Sentinela. Como o stat é
  zero em todo stat sheet do torneio, o vampirismo é matematicamente incapaz de mover a matriz.
- **O torneio não emite `useValor`.** O Modo 2/Coliseu resolve com `commands: []` e os dois
  lados 100% IA (`runTournament.ts`), então nenhuma invocação acontece — e `buildBattleSetupFromHeroes`
  no torneio nem recebe `valorSkills`, o que já era verdade desde M12.

**Consequência registrada como pendência, não corrigida aqui:** `lifesteal` está **vivo no
motor e ausente do conteúdo**. Autorar o set Vampiro fecharia o vão, e seria a mesma jogada que
2/N fez por `wall`/`gate`/invocação — mas o **§7 do briefing proíbe explicitamente**: "nenhuma
expansão de conteúdo além do mínimo que D2 e D3 exigem", e D1 (lifesteal) não pede conteúdo.
Autorar por conta própria seria decidir escopo no lugar de quem escreveu o briefing. Fica
declarado: quem for autorar equipamento a seguir tem um stat implementado, testado e sem
consumidor esperando.

**Os quatro critérios de aceite, um a um, com o que prova cada um:**

1. **"Um jogador monta a defesa pelo cliente, ela persiste, e um segundo jogador a enfrenta e vê
   o replay — sem nenhum `curl`."** Roteiro de navegador de 3/N (Vite + servidor de dev em
   memória + Chromium): defesa lida do servidor, refeita por cliques em (11,5)/(11,9) com
   arquétipo "Guarda o tile", salva, **página recarregada**, tudo de volta do servidor; segundo
   jogador acha o oponente, a lista de iniciativa traz exatamente aqueles dois heróis, joga,
   submete, servidor decide (derrota em 9 rounds, ELO 1200→1184, 3 marcas), replay buscado do
   servidor. Testes de apoio: `apps/client/tests/arenaDefense.test.ts` (12) e o bloco
   `GET /me/defense` em `apps/server/tests/battles.test.ts` (4).
2. **"`lifesteal` altera HP em teste determinístico."**
   `packages/core/tests/duel/lifesteal.test.ts`, 7 testes — entre eles a prova de que a cura é
   fração do dano **efetivamente aplicado** (alvo com 1 HP e golpe de milhares cura 1) e a de
   que o dano recebido pelo alvo **não muda** com o vampirismo ligado, o que também prova que
   nenhum stream de RNG foi deslocado.
3. **"Nenhum `kind` de valor-skill rejeita por falta de implementação."** Provado nas três
   camadas: motor (`summon.test.ts` → "`summonReinforcement` não devolve mais 'sem
   resolução'"), dado (`validate.test.ts` → "o catálogo real cobre os quatro kinds de §5.6,
   todos com resolução" — não basta o motor resolver, tem de existir conteúdo exercendo cada
   um) e conteúdo real (`m15Conteudo.test.ts` → invocar de verdade a partir do catálogo põe uma
   unidade jogável no mapa, com perfil de combate resolvido e lugar na iniciativa).
4. **"`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm validate:data` verdes; `pnpm balance`
   com os dois critérios de M8."** 95 arquivos / 1227 testes, 7 pacotes limpos, 23 schemas /
   124 arquivos, e a matriz acima.

**Correção de registro, exigida pelo §3 do briefing** ("corrija a linha de `PROGRESS.md` sobre
`Tile.object` ao fim do milestone — ela está errada hoje e vai enganar a próxima sessão"): a
linha de M14 que listava `Tile.object` sem leitor, `lifesteal` inerte, `summonReinforcement` sem
resolução, "+2 Valor" sem onde acontecer e `PUT /me/defense` sem tela foi marcada como
**histórica**, com a nota de que as cinco caíram em M15 e de que a de `Tile.object` já estava
mal descrita quando foi escrita.

**Um artefato visual pré-existente que a fortaleza tornou visível, registrado para M16:** o
padrão de hachura do overlay de ameaça (M13 4/N) desenha linhas diagonais que **transbordam o
tile**, e em cima de uma parede de 7 tiles isso mancha a alvenaria vizinha. Não é regressão de
M15 — é o desenho da hachura, que existe desde M13 e só não incomodava sem estrutura no mapa.
Candidato natural à milestone que trata apresentação como sistema.

**Um flake achado ao fechar o milestone, e ele nasceu em M14, não aqui.** A execução final de
`pnpm test` falhou em `apps/server/tests/economy.test.ts` depois de três execuções verdes.
Medido antes de concluir qualquer coisa: **1 em 8 execuções**. A causa não é regressão de M15 —
nenhuma masmorra usa `map-campanha-6`, o único mapa que 2/N alterou — e sim que o nonce do
ticket vira a **seed da batalha** (`deriveSeed`) e `generateNonce` é `crypto.randomUUID`: um
teste que afirma "este time vence esta masmorra" jogava uma partida diferente a cada execução,
e a elite é dura de propósito (§10).

A correção usa a costura que o próprio arquivo já tinha para o relógio: `newNonce?: () =>
string` injetável em `EconomyRoutesOptions`/`BuildAppDeps`, com default `generateNonce` — em
produção continua aleatório, no teste vira contador. **Consertar a aleatoriedade expôs a
pergunta que ela escondia:** com a primeira seed fixa o time de referência PERDE a elite. O
prefixo do nonce é, portanto, **fixture escolhida e declarada no código**, não sorteada: estes
testes são sobre o fluxo de recompensa, não sobre dificuldade, e a elite é marginal por
desenho. Fica escrito lá que trocar o prefixo troca a partida, e que um teste voltando a falhar
pede investigação do motor antes de troca de string. Depois da correção: **5 execuções seguidas
do arquivo e 3 da suíte inteira, todas verdes**.

Vale o registro de processo: um portão de aceite que falha 1 em 8 é pior que um bug conhecido,
porque corrói a confiança em toda afirmação de "suíte verde" — inclusive as dos milestones
anteriores que rodaram com ele.

`RULES_VERSION` **não subiu** nesta fatia (segue `0.16.0`): não há uma linha de regra aqui — a
costura do nonce é injeção de teste, com o comportamento de produção intacto.

### Auditoria 2026-08-15 — aceite do M15 e briefing do M16

Sessão de auditoria, sem código. Mesmo papel dividido: a auditoria verifica e requisita, um
agente separado implementa.

**M15 auditado contra o briefing, no código e não no relato — os 4 critérios batem.**
`ArenaDefensePanel.tsx` existe e consome o endpoint (mais `GET /me/defense`, rota nova que o
implementador acrescentou com razão: o `PUT` de M7 nunca teve par de leitura, e sem ele "a
defesa persiste" não seria demonstrável pela tela); `lifesteal` tem consumidor em
`resolveDuel.ts:303-315`, no ponto único por onde dano vira HP e sobre o dano efetivamente
aplicado (D1 respeitada); `summonReinforcement` resolve a partir de `payload.blueprintId` com
conteúdo em `packages/data/summon-blueprints/` (D2 respeitada); `chest` saiu do tipo,
`TILE_OBJECTS` fechou em 4, `wall`/`gate` são lidos no pathfinding **e usados em conteúdo real**
(23 muros e 1 portão no capítulo 6) — D3 cumprida além do pedido, com o requisito de portão que
o usuário acrescentou. Suíte **95 arquivos / 1227 testes** verde, `RULES_VERSION` em `0.16.0`,
`pnpm balance` idêntico ao baseline (42,5%–59,9%, `spd` 20,0%). A correção de registro que o §3
do briefing exigia foi feita, inclusive reconhecendo que a nota do `Tile.object` já estava
errada quando foi escrita.

**Briefing do M16 escrito** (`docs/milestones/M16-linguagem-visual-programatica.md`), seguindo
o método de 2026-08-07 — detalhe só quando o milestone vira o próximo. A direção de arte não
foi reaberta; ela está decidida na Auditoria 2026-08-14 e o briefing só a operacionaliza.

**Estado gráfico auditado:** `MapCanvas.tsx` tem 414 linhas de `g.rect()` e `g.circle()`, zero
arquivos de imagem no repositório, e **uma unidade é um círculo com rótulo de texto** — 10
classes, 5 tipos de unidade e 7 tipos de arma não aparecem na tela. Essa é a deficiência
central que M16 ataca.

**Achado que barateia M16, mesmo padrão de M9 e da correção de M13 4/N:** metade da fundação já
existe e uma frente nova a refaria. `overlayTheme.ts` já é sistema de tokens maduro (duas
paletas trocáveis, `TilePatternKind`, `UnitShape`, rampa de luminância, Okabe–Ito);
`meaningfulColors()` já é um **registro auditado por teste de dicromacia**, com a trava
declarada no próprio arquivo ("se um overlay novo entrar no mapa sem entrar aqui, ele escapa da
verificação"), o que dá a M16 um critério de acessibilidade executável de graça; e
`drawUnitShape` (`MapCanvas.tsx:111`) **já é a costura trocável em forma embrionária** — o
aceite pede a generalização dela, não uma abstração paralela.

**D4 registrada como regra de processo, e é a mais importante do briefing:** o agente não julga
estética. Vem da limitação de fonte primária levantada em 2026-08-14 (o LLM não avalia o
próprio resultado visual). Loop obrigatório: implementa → roda o cliente → screenshot → corrige
o objetivamente errado → **o usuário julga o gosto**. M16 é o único milestone do projeto cujo
aceite não é demonstrável por texto, então screenshot é parte da prova, não ilustração.

**Risco de processo reaberto e agravado.** A auditoria de 2026-08-07 levantou o repositório sem
histórico; a reconstrução aconteceu (24 commits). Desde então voltou a acumular: `git log`
parado em `6100fd0`, **102 caminhos não-commitados, M13 + M14 + M15 os três fora do histórico,
e `git remote -v` ainda vazio**. Era 1 milestone em risco em agosto; são 3 agora. Registrado
como Parte 0 do briefing de M16.

Nenhuma mudança de código nesta sessão — só a auditoria de aceite, o briefing de M16 e a
atualização de `PROGRESS.md`.

## M16 — Linguagem visual programática

### M16 — sub-sessão 1/N: a costura e o teste que trava a direção de arte

**Briefing escrito antes de uma linha de código**: `docs/milestones/M16-linguagem-visual-programatica.md`,
seguindo o método de 2026-08-07 (briefing quando o milestone vira o próximo). Ele registra as
cinco decisões que as fatias seguintes não devem reabrir — D1 glifo no cliente, D2 costura que
descreve em vez de desenhar, D3 segunda implementação como renderer alternativo de verdade, D4
nenhuma regra muda, D5 escopo é o tabuleiro e não os 13 painéis de HTML — e a **regra de
processo** que a auditoria fixou: o agente gera, tira screenshot e corrige o que é objetivamente
ilegível; **o gosto é do usuário, e o agente nunca autocertifica estética**.

**Esta fatia não muda um pixel — e isso foi MEDIDO, não afirmado.** Screenshot do capítulo 6 nas
duas paletas antes e depois da refatoração: **idênticos byte a byte** (`md5` igual nos dois
arquivos). É a evidência que uma extração de costura deveria sempre trazer e quase nunca traz.

**O que entrou:**

- **`data/unitRenderer.ts` — a costura.** Um `UnitRenderer` recebe estado + geometria + tokens e
  devolve uma **lista de primitivas** (`circle`/`rect`/`text`), dado puro e serializável, sem uma
  referência a Pixi. Quem traduz primitiva em `Graphics` é o `MapCanvas`, num ponto só
  (`paintUnitPrimitives`). Três coisas saem dessa inversão e nenhuma sairia com o desenho
  embutido no componente: a representação vira testável **sem browser e sem Pixi**; dá para
  AFIRMAR propriedades sobre o desenho em vez de olhar um screenshot e torcer; e uma camada de
  sprite pode entrar por cima trocando a implementação — o hedge que a auditoria exigiu.
- **`shapeUnitRenderer`**: o desenho de M6–M15 extraído tal como estava, número por número.
- **`minimalUnitRenderer`**: a segunda implementação (D3), só retângulos e texto, **sem círculo
  nenhum**, distinguindo os dois lados por forma (o inimigo leva um entalhe) e não por cor.
- **O teste de contrato roda os DOIS pelo mesmo conjunto de asserções**, e é aí que o critério de
  aceite 4 vira verificável: ambos desenham algo, ambos põem o rótulo de AP/PP no tile (§11 —
  "legíveis sem hover"), **nada transborda o tile** (uma unidade não invade o vizinho, senão a
  leitura do tabuleiro passaria a depender da ordem de desenho), os dois lados se distinguem sem
  depender de cor sob a paleta segura, **cada estado tem marca própria** (neutro, selecionada,
  engajável e "já agiu" produzem quatro saídas distintas entre si, não só distintas do neutro), a
  função é pura, e o rótulo acompanha a escala de UI de M13 4/N.
- **`semAssetsRaster.test.ts` — o critério de aceite 1 vira regra.** Hoje o repositório tem zero
  arquivos de imagem, medido antes de começar. O valor do teste não é constatar isso: é
  transformar "está zero" em "continua zero", porque a forma provável de a direção de arte se
  perder não é uma decisão explícita de mudar de rumo, é um `.png` entrando junto de um commit
  que fazia outra coisa. **Base64 embutido em código conta como asset** e é varrido também — é o
  mesmo arquivo com outro nome, e escaparia de uma busca por extensão. O terceiro teste do
  arquivo existe para o segundo não ser vacuamente verdadeiro: ele afirma que a varredura de
  fato enxerga os arquivos do cliente.

**Uma coisa do meu plano ficou de fora, de propósito, e é melhor dizer do que deixar passar:**
generalizar `overlayTheme.ts` em tokens. Ela estava na lista aprovada, mas fazê-la agora seria
inventar estrutura sem consumidor — exatamente o antipadrão que M10, M11 e M15 passaram o
projeto inteiro corrigindo ("campo declarado sem quem leia"). Os tokens que 2/N vai precisar
(métrica de glifo, espessura de traço, raio) só ficam definidos quando existir um glifo. Fica
para 2/N, junto de quem os use.

**17 testes novos** (14 de contrato — 7 asserções × 2 renderers — e 3 de assets) mais 3 no
arquivo de assets. Suíte: **97 arquivos, 1247 testes** (era 95/1227). `RULES_VERSION` **não
subiu** e não sobe em M16 (D4): `packages/core` e `packages/data` não têm uma linha alterada.

### M16 — sub-sessão 2/N: a linguagem visual

O que o briefing (§5.2) reservou para esta fatia: **glifo por classe, terreno e legibilidade de
estado**. Tudo em `apps/client`; `packages/core` e `packages/data` não têm uma linha alterada
(D4), e `RULES_VERSION` não subiu.

**Uma decisão de resolução que a fatia teve de tomar, porque D1 sozinho não a cobria.** D1 diz
que o glifo mora no cliente, mas não diz de onde o cliente tira a classe — e `BattleUnit` (core)
**não carrega `classId`**, com D4 proibindo acrescentá-lo. Resolução adotada, em três níveis:

1. **por `classId`**, quando quem monta a batalha sabe a classe (a campanha sabe, via
   `heroesByUnitId`). É o único nível capaz de separar **Espadachim de Mestre-Espadachim** — os
   dois são `infantry`/`sword`, nenhum campo de `BattleUnit` os distingue, e os dois aparecem no
   capítulo 6 ao mesmo tempo. Sem este nível, a promoção seria invisível no tabuleiro;
2. **por PERFIL** (`unitType`, depois `weaponType`), campos que TODO `BattleUnit` carrega. É o
   que impede que PvP, masmorra e replay — cujo `BattleSetup` vem pronto do servidor, sem classe
   — virem um tabuleiro inteiro do mesmo boneco genérico. `unitType` vem antes porque o que faz
   um Couraçado ser Couraçado é a armadura, não o machado;
3. **o fallback declarado**, para o que escapar dos dois.

O nível 1 é aplicado **só em `mode === 'campaign'`**: fora dela um `unitId` que por acaso
coincidisse daria a classe ERRADA, que é pior que cair no perfil.

**HP no tile entrou por decisão do usuário**, perguntada porque o briefing enumera a
legibilidade de estado como "AP/PP, efeitos ativos, quem já agiu, ameaça, objetivo" e HP não
está na lista. O argumento aceito: §1.1 põe "o jogador DEVE conseguir prever o resultado antes
de confirmar" entre os pilares, e a decisão de engajar acontece olhando o tabuleiro — uma
unidade a 5% de HP desenhada igual a uma cheia esconde exatamente o dado que decide.

**O que entrou:**

- **`data/shapes.ts` — o vocabulário.** Duas camadas: `NormShape` (forma em espaço normalizado
  0..1, o que um glifo ou uma marca DECLARA) e `Primitive` (a mesma forma já posicionada em
  pixels, com tinta, o que os renderers DEVOLVEM). `placeShapes` é o único ponto do cliente que
  converte um no outro, então "o desenho escala com a UI" virou propriedade de uma função em vez
  de promessa espalhada. `Primitive` ganhou `poly` — sem polilinha não há arco de arco nem asa.
- **`data/classGlyphs.ts` — os 10 glifos** (espada, espadas cruzadas, machado, escudo, lança,
  asa, arco, estrela, cruz, folha), mais os de perfil e o fallback. Completude no estilo de M9
  contra o catálogo real, **nos dois sentidos**: nenhuma classe sem glifo e nenhum glifo órfão —
  um glifo órfão é sinal de classe renomeada, e classe renomeada perde o desenho em silêncio.
- **`data/terrainMarks.ts` — a marca de terreno.** Terreno é REGRA (floresta dá +100 de def e
  bloqueia visão; montanha é intransponível a pé), e cor chapada obrigava o jogador a ter
  decorado a paleta. **As marcas vivem nas bordas do tile**, com o miolo (0.3–0.7 nos dois
  eixos) declarado faixa proibida por teste: o miolo é onde a unidade é desenhada, e textura por
  baixo dela não some — vira sujeira em volta do glifo.
- **`data/tilePatterns.ts` — os padrões extraídos, e a correção do transbordo.** A pendência
  registrada no fecho de M15 ("a hachura de ameaça transborda o tile e mancha a alvenaria
  vizinha") virou uma asserção de uma linha assim que a geometria saiu de dentro de uma chamada
  de Pixi. As diagonais são **recortadas** (Liang–Barsky) contra o tile **encolhido de meia
  espessura de traço** — traço é centrado na linha, e foi essa meia espessura que vazava.
  Recorte na fonte e não `mask` de Pixi, porque máscara conserta o pixel e deixa o teste cego.
  **A trava pegou o meu próprio desenho na primeira execução** (grid e frame vazavam nas escalas
  maiores), que é o melhor argumento a favor de tê-la escrito antes.
- **Os tokens em `overlayTheme.ts`** — a peça que 1/N deixou de fora por falta de consumidor,
  agora junto de quem a usa. Tudo que é medida em fração do tile, nunca em pixel, porque §11 vai
  de 100% a 175%. **`terrainMarkInkFor` escolhe a tinta da marca pela luminância do terreno**:
  os três terrenos ocupam uma rampa de luminância de propósito (foi assim que M13 4/N os separou
  sob dicromacia) e a consequência é que **nenhuma tinta única contrasta com os três** — escura
  some na floresta, clara some na planície. Cor por terreno voltaria a pôr significado na matiz,
  que é o que a paleta segura evita.
- **`unitRenderer.ts`** — corpo + glifo + pips de efeito + faixa de HP + rótulo. Buff e debuff se
  separam por **forma** (triângulo para cima contra para baixo) e **posição** (canto superior
  direito contra inferior esquerdo); HP crítico ganha **entalhe próprio** encostado na barra,
  porque em deuteranopia a barra vermelha e a verde podem virar o mesmo tom e sobraria só o
  comprimento — que sozinho não avisa que a unidade morre no próximo golpe.
- **O "fantasma" da animação passa pela mesma costura.** Antes ele desenhava o disco cru; com
  glifo, a unidade perderia a identidade justamente enquanto anda, que é quando o jogador está
  olhando para ela. A montagem da entrada do renderer virou uma função só, usada pelos dois
  pontos.

**A regra de processo (§3 do briefing) produziu uma correção de verdade, e é o registro mais
importante desta entrada.** O primeiro screenshot mostrou o número de AP/PP **caindo em cima do
glifo**: os dois viravam um borrão, e branco sobre o azul claro do jogador já tinha pouco
contraste desde M6. Correção: **plaqueta opaca** atrás do rótulo, `glyphBoxRatio` de 0.46 para
0.40 e `glyphOffsetY` de 0.06 para 0.085, de modo que o glifo **comece abaixo da plaqueta** em
vez de passar por baixo dela. Os dois invariantes viraram teste (um de paleta, nas duas escalas
extremas de §11, e um de contrato) — foi um defeito **visto**, não previsto, e travá-lo é o que
impede que um ajuste futuro de token o traga de volta em silêncio.

**O contrato de `UnitRenderer` cresceu, e os dois renderers continuam passando pelo mesmo.** As
asserções novas exigem o RESULTADO e não a técnica: "dá para saber a classe olhando", "buff e
debuff têm marca própria", "cheia e quase morta não se desenham igual". O de produção resolve
identidade por **glifo vetorial**; o alternativo (D3), por **rótulo em texto**, sem um `poly` e
sem um círculo. Os dois passam — e é exatamente essa folga que faz a costura valer alguma coisa.
Um contrato amarrado a glifo teria tornado o renderer alternativo impossível, e "trocável" seria
só uma palavra.

**Verificação em navegador** (o que o agente pode afirmar sozinho, §3): glifos distinguíveis
entre si nas duas paletas com as 10 classes do capítulo 6; plaqueta legível; marca de terreno
visível sem competir com a peça; **hachura de ameaça parando na borda do tile, com a alvenaria
limpa** (a pendência de M15, resolvida); barra de HP encurtando e trocando de cor numa unidade
ferida em jogo, com pip de debuff aparecendo. **O critério de aceite 2 continua aberto: quem
julga o gosto é o usuário.**

**62 testes novos** (3 arquivos novos — `classGlyphs` 14, `terrainMarks` 9, `tilePatterns` 16 —
mais o contrato de unidade de 14 para 34 e a paleta de 11 para 15). A simulação de dicromacia de
M13 4/N saiu para `tests/support/dicromacia.ts` **sem uma conta mudar**, porque o critério 3
exige que a tinta NOVA (glifo sobre o corpo, marca sobre o terreno) seja medida pelo MESMO
método — três cópias das matrizes seriam três cópias divergindo em silêncio. Suíte: **100
arquivos, 1309 testes** (era 97/1247).

### M16 — sub-sessão 3/N: animação com peso

O que o briefing (§5.3) reservou para esta fatia: **animação com peso** e o fechamento —
reverificação da garantia de daltonismo e validação no browser. Tudo em `apps/client`;
`packages/core` e `packages/data` **não têm uma linha alterada** (D4) e `RULES_VERSION` segue
`0.16.0`.

**A decisão estrutural: a mesma inversão do D2, aplicada ao TEMPO.** `data/motion.ts` **descreve**
o movimento e não anima — uma `Motion` é função pura de tempo decorrido para deslocamento, escala e
opacidade, e quem tem relógio (o `Ticker` do Pixi) é o `MapCanvas`, num ponto só. O motivo não é
simetria arquitetural: é que **movimento é a coisa que menos se deixa julgar por screenshot**. Um
quadro parado mostra a peça em algum lugar; ele não mostra se ela acelerou, se recuou antes de bater
ou se parou seca no destino. Com a descrição separada do relógio, "com peso" vira asserção:

- **a velocidade tem pico no meio do percurso** — medida por diferença finita, mais que o dobro da
  largada e da chegada. Com interpolação linear (o que o cliente fazia desde M6) as três seriam
  iguais, e é exatamente essa a diferença que o milestone pede;
- **o golpe recua antes de avançar**, e a antecipação é uma quantidade com sinal, não um adjetivo;
- **toda animação termina exatamente onde o core diz** — uma deriva de meio pixel entre o último
  quadro e o commit produz um salto no quadro em que o jogador está olhando;
- **o pesado é pesado:** o couraçado demora mais, recua mais fundo, assenta mais forte e **treme
  menos** ao apanhar que o grifeiro. Se os cinco perfis fossem o mesmo número com nomes diferentes,
  a fatia teria animação sem peso. A tabela cobre os 5 `UnitType` com completude nos dois sentidos
  (estilo M9), incluindo `cavalry`, que não tem classe no catálogo de hoje: sem a entrada, a
  primeira classe montada andaria com o peso do fallback em silêncio.

**Duas decisões do usuário, perguntadas antes de codar** (o briefing não cobre nenhuma das duas):

1. **Número de dano flutuante entra.** §11 não o pede e o preview de duelo já narra troca a troca,
   mas sem ele a batida diz que doeu e não diz quanto — e a decisão de engajar de novo acontece
   olhando o tabuleiro. Entrou **sem gastar uma cor nova**: branco com contorno na tinta da plaqueta
   de AP/PP. A matiz do mapa está toda ocupada com significado desde M13 4/N (ameaça, movimento,
   mira, objetivo, os dois lados), e pintar o dano de vermelho colidiria com a ameaça sob
   deuteranopia — num número que voa por cima de qualquer tile. O que o número precisa dizer está
   escrito nele; o que o separa do rótulo fixo é posição e movimento.
2. **Os turnos da IA inimiga ficam de fora**, registrados como pendência. `applyCommandAndAdvance`
   resolve o turno inteiro por dentro e os inimigos teletransportam — é a maior lacuna de leitura
   que sobra no tabuleiro, e animá-la exige diffar dois estados e reconstruir os caminhos que a IA
   andou. É fatia própria; enfiá-la aqui seria o alargamento que o briefing evita.

**A morte entrou junto, e não é enfeite:** até esta fatia a unidade morta simplesmente desaparecia
no quadro em que o duelo era commitado, e o jogador via o tabuleiro com uma peça a menos e tinha de
deduzir qual. §1.1 põe legibilidade tática entre os pilares, e quem caiu é a informação que decide o
turno seguinte.

**A coreografia LÊ o log, não decide nada.** O duelo já aconteceu inteiro no core antes do primeiro
quadro (§6: até 3 trocas resolvidas de uma vez). `duelBeats` transforma o `DuelResult` em batidas na
ordem cronológica, com a reação vindo **depois** do golpe que a disparou e **no sentido inverso**
(§6.4 — desenhá-la no mesmo sentido faria o contra-ataque parecer parte do ataque). Ação que não
causou dano não vira batida: sacudir a peça num golpe que a evasão de `spd` fez errar seria a
animação afirmando o contrário do que o core decidiu.

**§11 — "modo resultado instantâneo (pula animações)" virou propriedade do módulo puro.** `instantly`
devolve a mesma animação com duração zero e já no estado final, o que dá ao teste como afirmar que
**pular e assistir até o fim terminam no mesmo lugar**. Um `if` espalhado pelo componente não teria
como provar isso. Medido também em navegador: do "Confirmar" ao "Vitória!" em **3225 ms** com
animação e **392 ms** com o modo ligado.

**A regra de processo (§3 do briefing) pegou TRÊS defeitos, e os três são do tipo que nenhum
teste desta fatia pegaria — dois vivem na costura entre a descrição pura e o relógio, e o terceiro
só existe no encontro entre duas coisas que, separadas, passam em todos os testes:**

- **o overlay de "Vitória!" cobria o golpe que venceu a batalha.** O estado é commitado no primeiro
  quadro da animação (é dele que a animação sai), então o desfecho aparecia imediatamente e a
  sequência inteira rodava atrás de um modal. Verificado matando o último inimigo do capítulo 1.
  Correção: `boardAnimating` no store, escrito só por quem desenha e com **um consumidor só** — o
  overlay espera o tabuleiro terminar de contar. Não vai para o save (não é progresso);
- **a peça sumia por alguns quadros no fim de todo movimento.** O fim da sequência apagava a camada
  de FX, mas o `redraw()` do tabuleiro só acontece no efeito que reage ao commit — e no meio disso o
  tabuleiro estava desenhado *sem* a unidade (ela seguia escondida) e a camada de FX já vazia.
  Correção: o último quadro **fica** na tela até o `redraw()` seguinte apagá-lo, o que é seguro
  justamente porque a animação termina exatamente no destino (propriedade já travada em teste);
- **o número de dano subia atravessando a plaqueta de AP/PP.** Ele nascia no centro do tile e
  subia quase uma altura de tile — passando exatamente por cima da plaqueta opaca do canto
  superior esquerdo, e os dois viravam um borrão. É **o mesmo defeito que 2/N corrigiu entre o
  número e o glifo**, reaparecendo entre duas peças que, isoladas, passam em todos os testes: a
  plaqueta tem teste de posição, o número tem teste de curva, e nenhum dos dois sabe do outro.
  Correção: o número nasce **acima** do tile do alvo (o espaço livre mais próximo da pancada, e
  onde todo jogo de tática o põe) com a subida encurtada de 0.9 para 0.55 do tile, de modo que a
  excursão total continue a mesma. A lição que 2/N já tinha dado e esta fatia repetiu: **num tile
  de 36 px, tudo que é desenhado disputa espaço com tudo, e o encontro só aparece rodando.**

**Verificação em navegador** (o que o agente pode afirmar sozinho, §3): as três sequências gravadas
do cliente em execução, quadro a quadro, nas duas paletas, com os tempos originais — movimento,
duelo com números de dano e contra-ataque, e a morte desabando antes do desfecho. Zero erro de
console em todas as execuções. Mais a passagem para julgamento do **critério 2**, montada a pedido
do usuário: capítulo 6 nas duas paletas em 100% (o tamanho real de leitura) e em 175% (a maior
escala que §11 oferece), com as sete classes em tela, a alvenaria, o portão trancado e o alcance de
movimento sobre o véu de ameaça; o estado de batalha durante um duelo (plaqueta, barra de HP
encurtando, número, véu de "já agiu", a peça morta desabando); e as animações em velocidade real.
**O critério de aceite 2 continua aberto: quem julga o gosto é o usuário.**

**49 testes novos** (`motion.test.ts` com 31, mais 3 de reverificação de dicromacia levando a paleta
de 15 para 18). O critério 3 foi reverificado do jeito que o texto dele exige — "reverificada, não
assumida" — e a pergunta certa não era "mudei a paleta?" e sim **"entrou tinta nova sem passar pela
medição?"**: o registro de `meaningfulColors` está **congelado por teste**, e o contorno do número de
dano é medido contra todo terreno, contra a estrutura e contra os dois lados, sob deuteranopia e
protanopia. Suíte: **101 arquivos, 1343 testes** (era 100/1309).


### M16 — sub-sessão 4/N: os turnos da IA parando de teletransportar

O que o briefing (§5) NÃO reservou para nenhuma fatia, e 3/N registrou como pendência própria:
os turnos da IA inimiga não eram animados. `applyCommandAndAdvance` drenava o turno inteiro por
dentro e devolvia só o estado final, então o jogador confirmava a jogada dele, o tabuleiro
piscava, e os inimigos estavam noutros tiles — sem percurso, sem duelo na tela, às vezes com uma
peça a menos e sem dizer qual. Medido no capítulo 4 ao fechar esta fatia: **um turno de IA que
agora leva 9,3 s acontecia em UM quadro**, e nele quatro inimigos andaram, quatro duelos
resolveram, dois heróis morreram e um inimigo caiu. §1.1 põe legibilidade tática entre os
pilares, e a ameaça do round seguinte se decide olhando exatamente por onde o inimigo veio.

**A decisão da fatia, perguntada antes de codar: D4 foi aberto para uma adição SEM regra.** O
cliente não tinha como saber o que a IA fez — o relato era descartado dentro de
`resolveAiTurns`. As três saídas foram postas na mesa com o custo de cada uma, e o usuário
escolheu a primeira:

1. **`resolveAiTurnsLogged` (escolhida).** A função passa a devolver, junto do estado, os passos
   que aplicou: o comando, o estado imediatamente ANTES dele e o `DuelResult` quando o comando
   foi um `engage`. `resolveAiTurns` vira essa função com o relato jogado fora, e as duas
   devolvem exatamente o mesmo estado (travado por teste). **Nenhuma regra muda e
   `RULES_VERSION` fica em `0.16.0`** — o texto de D4 é "nenhuma regra muda em M16", e relatar
   não é decidir. Quem não quer o relato chama `resolveAiTurns` e não paga por ele.
2. **Diffar dois estados no cliente.** Zero linhas no core, e o motivo de ter sido recusada não
   é elegância: a animação passaria a **inferir**. O caminho teria de ser reconstruído por
   pathfinding e pode não ser o que a IA andou (dois caminhos mínimos empatados dão o mesmo
   destino por esquinas diferentes), e um duelo de IA viraria indistinguível de qualquer outra
   perda de HP. É a animação afirmando o que não sabe — o oposto do §3 do briefing.
3. **Reexecutar o laço da IA no cliente.** Exato e sem inferência, mas duplicaria lá a lógica
   que M7 6/N centralizou no core justamente para cliente e servidor não divergirem ("§9.1:
   divergência = bug crítico"), e rodaria a IA duas vezes por turno.

**`data/aiNarration.ts` é a mesma inversão de 1/N e 3/N aplicada à SEQUÊNCIA.** 1/N inverteu a
forma (o renderer descreve, não desenha), 3/N inverteu o tempo (a `Motion` descreve, não anima);
aqui o módulo converte o relato numa lista ordenada de CENAS e não toca no relógio. O ganho é o
mesmo dos outros dois — **a propriedade que dá nome à fatia vira asserção**: *toda peça que
mudou de tile tem uma cena que a leva até lá, começando onde ela estava e terminando onde o core
diz que ela ficou; e quem não saiu do lugar não ganha cena nenhuma* (o recíproco importa tanto
quanto — uma cena para quem não andou faria a peça ir e voltar, mentindo sobre o core). Provada
com um, com dois inimigos e com o caso "anda e engaja", sem browser e sem Pixi. Um `wait` não
vira cena: parar o tabuleiro sem nada na tela é o tabuleiro travando, não uma jogada.

**A cadeia inteira roda num `runFx` só, e isso é uma correção e não uma economia.** Um `runFx`
por cena seria mais simples de escrever e traria de volta o defeito que 3/N corrigiu:
`boardAnimating` desceria na fresta entre duas cenas e o desfecho caberia ali. Duas mudanças
sustentam a cadeia:

- **origem e retrato passaram da faixa para o TRECHO** (`FxSegment`). Numa cadeia a mesma peça
  anda numa cena, apanha na seguinte e cai na terceira, cada uma partindo de um tile diferente e
  com o HP daquele instante. Presos à faixa, a peça saltaria de volta ao tile inicial no começo
  de cada cena e a barra de HP mostraria o turno inteiro o valor de antes da primeira pancada;
- **`boardAnimating` passa a subir no STORE**, no mesmo `set()` que commita o estado, e a descer
  sempre no canvas. Se o turno da IA acaba de matar o último herói, levantar a trava só quando o
  canvas reage já seria tarde: o "Derrota!" apareceria no quadro do commit e a sequência rodaria
  atrás do modal — o defeito de 3/N reaparecendo pela porta da IA. Os dois lados usam o **mesmo
  predicado** (`narrateAiTurns(steps).length > 0`), senão a trava poderia subir sem que ninguém
  a baixasse e o desfecho nunca apareceria.

**O relato pendente guarda o ESTADO junto, e é isso que o torna seguro.** `aiTurnReport` só é
consumido quando `state === battleState`. Trocar de capítulo, entrar numa masmorra ou abrir um
replay troca o `battleState`, e um relato velho deixa de casar **sozinho** — sem um `reset` em
cada um dos nove pontos do store que começam batalha, que é exatamente o tipo de lista que se
esquece de atualizar. A outra metade ("já contei este") é uma ref no canvas, porque o efeito
também roda quando só a seleção muda.

**A regra de processo (§3) pegou um defeito, e de novo do tipo que nenhum teste desta fatia
pegaria.** O número de dano nascia sempre ACIMA do tile do alvo (a correção de 3/N), e num corpo
a corpo as duas peças são **verticalmente adjacentes**: no capítulo 1 o bandido bate no herói
logo abaixo dele, e o número do golpe nasceu exatamente sobre a plaqueta de AP/PP e o glifo do
próprio bandido — os três viraram um borrão. **É o mesmo defeito de 2/N e 3/N pela terceira vez,
com uma causa nova cada vez** (lá o número disputava espaço com o glifo do alvo e depois com a
plaqueta dele; aqui, com a peça do VIZINHO). É pré-existente, não nasceu em 4/N — um duelo do
jogador entre peças verticalmente adjacentes sempre o produziu; o que mudou foi passar a haver
verificação de um turno inteiro de IA para vê-lo. Correção: `damageAnchorDirection` escolhe a
saída entre cima e as duas diagonais de cima, pela distância à pancada, descartando tile ocupado
e tile fora do tabuleiro — com a saída declarada (a de cima) quando nenhuma serve, porque um
número sobreposto ainda é lido e um número fora do tabuleiro não. **A lição de 2/N e 3/N,
repetida: num tile de 36 px tudo que é desenhado disputa espaço com tudo, e o encontro só
aparece rodando.**

**Verificação em navegador** (o que o agente pode afirmar sozinho, §3): capítulo 1 nas duas
paletas com a cadeia completa (o bandido anda 3 tiles, golpeia, leva o contra-ataque e desaba),
capítulo 4 com os quatro inimigos em sequência, e a passagem do critério 2 refeita — capítulo 6
nas duas paletas e nas duas escalas de §11. **Zero erro de console em todas as execuções**, e a
timeline de `boardAnimating` com **uma única transição** por cadeia, inclusive na de 9,3 s. Uma
medição para o usuário julgar, não para o agente: **quatro inimigos custam 9,3 s de turno**, e
se isso é lento é decisão dele — §11 já oferece o modo resultado instantâneo, que continua
pulando tudo.

**Fora de escopo, registrado:** o primeiro turno de IA, o que `buildInitialState` drena antes do
primeiro clique, não é relatado nem animado. Ali não há "antes" que o jogador tenha visto, então
não existe teletransporte a corrigir; e a tela de replay continua sem animação nenhuma, como
desde M13 1/N.

**25 testes novos** (12 em `packages/core/tests/battle/aiTurnLog.test.ts`, 13 em
`apps/client/tests/aiNarration.test.ts`) mais 6 em `motion.test.ts` para a saída do número.
Suíte: **103 arquivos, 1374 testes** (era 101/1343).


### P1.1 (handoff de 2026-08-28) — a assimetria de alcance ligada, medida e revertida

**O que foi feito:** `packages/data/weapon-duel-ranges/tabela-arena.json` declarava `1` para as
sete armas, o que desligava a assimetria de duelo ranged (§6.1) no torneio inteiro. Os valores
reais não precisaram ser inventados: a fixture `test-fixtures/weapon-duel-ranges/valid/
tabela-teste.json`, autorada em M7 4/N, já declara `sword/axe/spear = 1` e
`bow/arcane/nature/holy = 2` — o catálogo real é que ficou com o placeholder.

**A medição (regra 10), 10.000 partidas por pareamento, 72 pareamentos:**

| | antes (tudo 1) | depois (ranged 2) |
| --- | --- | --- |
| Faixa de winrate global | 42,5% – 59,9% | **26,5% – 79,6%** |
| Comps acima de 65% | 0 | **4** (Arqueiro 79,6, Clérigo 74,6, Druida 74,0, Arcanista 71,9) |
| Comps abaixo de 40% | 0 | **5** (Couraçado 36,2, Espadachim 31,8, Guerreiro 28,1, Grifeiro 27,2, Lanceiro 26,5) |
| Counters absolutos | 10 de 72 (13,9%) | **16 de 72 (22,2%)** |
| `spd` acima da mediana nas vencedoras | 20,0% | 22,0% |

**A causa não é fórmula, e isso foi separado por medição em vez de suposto.** Quebrando a matriz
por eixo: **ranged vence melee em 20 de 20 pareamentos** (67,3% a 99,7%), enquanto ranged-vs-ranged
(21,8%–99,6%) e melee-vs-melee mantêm a mesma dispersão de antes — a dispersão do triângulo de
armas, que é o comportamento esperado. O empilhamento de multiplicadores que o relatório sugere
investigar não é o problema.

**O problema é que as 9 composições são MONOCLASSE.** O handoff pedia "3 heróis cada" e foi
entregue como 3 heróis da *mesma* classe. §6.1 diz que a resposta tática ao alcance é "fechar
distância" — e três arqueiros contra três espadachins é justamente o tabuleiro onde essa resposta
não existe. Com o alcance uniforme em 1 a distorção era invisível; ligar o alcance real a
detonou.

**Medido, não afirmado:** uma composição MISTA de experimento (espadachim + couraçado na frente,
arqueiro atrás), rodada com `ranged = 2`, fica em **50,3% de winrate global — a única das dez
dentro da faixa de 40–60%**, enquanto as nove monoclasse ficam todas fora. Ela também aguenta o
arqueiro muito melhor que a linha melee pura (65,3% para o atacante, contra 82,8%–90,2% das
monoclasse). A comp de experimento foi apagada depois da medição; o relatório está em
`balance-experimento-mista.txt`.

**Decisão: o valor foi REVERTIDO para 1, e P1.1 NÃO fecha.** Manter `ranged = 2` deixaria o
`pnpm test` vermelho e violaria os dois lados do critério de aceite do M8 que a spec acabou de
ganhar (P1.2, faixa 40–60%). O número certo é 2 — é o que §6.1 manda e o que a fixture já dizia —,
mas ele só pode entrar junto de três coisas que são fatia própria de conteúdo:

1. **as 9 comps da arena viram mistas** (é o que a medição acima mostra ser a correção);
2. **`encounter-campanha-4` reposicionado** — `unit-cerco-3` é arqueiro e nasce em (11,8), a dois
   tiles do `ally-arcanista` em (9,8). Com alcance 2 ele abre duelo **antes do primeiro comando do
   jogador** (arcanista a 167/640, o próprio arqueiro a 60/580 no contra-ataque). O teste
   `packages/content/tests/encounters.test.ts` já dizia o que isso é: "erro de posicionamento no
   encounter, não do motor";
3. **`dungeon-campo-de-treino` rebalanceada** — o time de referência deixa de vencer o piso da
   dificuldade na seed 2 (`packages/content/tests/dungeons.test.ts`).

**O aceite do P1.1 dizia:** "se os counters persistirem acima de 10%, aí sim é problema de regra —
investigar antes de mexer em números". Investigado: não é regra, é composição. Fica registrado
para a fatia que fizer o conteúdo.

### P1.1 (parcial, FECHADO) — a contagem de assistências no relatório

O outro lado do P1.1 fechou. `tools/balance` não tinha como afirmar que a janela de assistências
(§6.5) dispara: no Coliseu (§9.2) os dois lados são IA, então a batalha inteira resolve dentro de
`buildInitialState` e o laço de `simulate` nunca roda — não havia um único `DuelResult` observável
de fora do core.

**Decisão do usuário: `buildInitialStateLogged`**, mesma adesão aditiva de `resolveAiTurnsLogged`
(M16 4/N). `buildInitialState` passa a ser essa função com os passos jogados fora; nenhuma regra
muda e `RULES_VERSION` segue `0.16.0`. Em M16 4/N esta variante ficou de fora de propósito por não
haver consumidor — agora há, e o consumidor não é animação, é medição.

**A instrumentação não mexeu na medição, e isso foi verificado e não assumido:** a rodada de
`--runs 20` depois da troca de `simulate` por `buildInitialStateLogged` devolve os nove winrates,
a mediana de `spd` e a concentração **número por número idênticos** aos de antes.

**O resultado:** com as comps de 3 heróis, **88,5% das batalhas têm ao menos uma assistência,
média de 2,44 por batalha**. A mecânica que substituiu o esquadrão do Unicorn Overlord está viva
no torneio pela primeira vez. O relatório passa a trazer os três números e ALERTA quando o total
é zero — que era o estado silencioso de todas as rodadas até M8.

### P1.2 (FECHADO) — o piso de 40% na spec

`tools/balance/src/report.ts` media teto (65%) e piso (40%) desde a revisão do M8, mas
`docs/spec/09-roadmap.md` só tinha o teto: uma composição em 31% passava no aceite e mesmo assim
ninguém a levaria para a arena. O critério do M8 passou a ser a faixa **40–60%**. A ferramenta não
mudou; a spec alcançou a ferramenta.


### M16 — sub-sessão 5/N: os elementos do mapa se distinguindo entre si

Fatia nascida de um veredito: o usuário julgou o critério de aceite 2 e **reprovou o grid**, com
estas palavras — "dá pra perceber diferença mas não necessariamente distinguir totalmente,
principalmente elementos do mapa". Unidades e estado de batalha passaram ("até que dá"). O
critério exige *legíveis*, não *diferenciáveis*.

**A queixa tinha lado mensurável, e a medição achou o culpado.** Na paleta padrão, floresta
(`0x2f5d34`) e alvenaria (`0x6b4f3a`) estavam a **1,03 de contraste WCAG** — a mesma luminância,
com a distinção inteira apoiada na matiz. Um bosque e uma muralha liam-se como o mesmo tile, e
sob o véu de movimento caíam para 1,02. `planície × montanha` estava em 1,57, e 1,36 sob véu.

**Correção em dois canais, porque um só não bastava:**

1. **Tinta — os três terrenos foram para uma rampa de luminância**, a mesma inversão que M13 4/N
   aplicou à paleta segura, agora trazida para a padrão. As matizes de antes foram preservadas
   (planície verde, floresta verde-escura, montanha pedra); o que mudou foi o espaçamento. Pior
   par: **1,03 → 2,05** cru, **1,01 → 1,54** com overlay por cima.
2. **Forma — o muro ganhou fiada de blocos.** Ele era a única coisa do tabuleiro desenhada apenas
   com cor (um `g.rect` chapado). Forma é o que sobrevive quando um véu semitransparente empurra
   toda a tinta para a mesma direção, e é por isso que a correção de tinta sozinha seria frágil.

**`data/structureMarks.ts` inverte a mesma costura de 1/N e 2/N**: declara a marca de muro e
portão como `NormShape[]` e não desenha. O portão de M15 3/N (batentes + tranca) saiu de `g.rect`
solto no canvas e virou declaração, o que permite ao teste afirmar que muro, portão e portão
aberto não se leem como a mesma coisa.

**Uma regra nova, e ela é o oposto da regra de 2/N:** a marca de estrutura ocupa o **miolo** do
tile. A marca de TERRENO vive nas bordas porque uma unidade é desenhada no meio e a textura
viraria sujeira em volta do glifo. Muro e portão são intransponíveis (§5.1, M15 1/N): nenhuma
unidade jamais fica em cima deles, então eles podem — e precisam — texturizar o tile inteiro.

**O teto de escuridão da alvenaria não é estético, é o número de dano.** A primeira tentativa
levou a alvenaria a `0x150f0b` e o teste de M16 3/N reprovou: o contorno do número (`labelPlate`,
`0x111827`) ficava a 49 de distância redmean da pedra, e o número sumiria ao voar por cima de um
muro. As duas restrições se opõem — a alvenaria precisa ser mais escura que a floresta para
contrastar com ela, e mais clara que o contorno para não engoli-lo. A busca com as duas travas
juntas devolveu `0x040406` (padrão) e `0x10101e` (segura).

**A paleta segura NÃO teve os terrenos alterados**, por decisão de escopo: ela passa o piso, e foi
afinada em M13 4/N sob a restrição de dicromacia — reabrir aquilo de leve era o caminho para
desfazer um trabalho medido. Só a alvenaria dela escureceu, de `0x1f242b` para `0x10101e`, porque
contra a floresta ela estava em 1,67.

**Duas travas do projeto fizeram o trabalho delas nesta fatia, e é o argumento a favor de tê-las
escrito antes:** o congelamento da paleta padrão (M13 4/N) reprovou a mudança e obrigou a
atualização a ser consciente em vez de silenciosa; e a reverificação de dicromacia (M16 3/N)
pegou a colisão entre a alvenaria e o contorno do número de dano, que nenhum teste desta fatia
procurava.

**Uma correção de reimplementação, registrada porque quase virou erro:** ao procurar a paleta eu
reimplementei a simulação de dicromacia num script solto e ela reprovou a paleta segura ATUAL,
que o teste real aprova. A causa era a distância — o projeto usa **redmean** (Riemersma), não
euclidiana. Passei a rodar a busca importando `tests/support/dicromacia.ts`, o código do próprio
projeto. A lição é a mesma de M15 2/N: medir com uma segunda implementação da conta é medir outra
coisa.

**16 testes novos** (`mapElements.test.ts`), mais `contrastRatio` no helper compartilhado. O
critério de aceite 2 **continua aberto** — quem julga é o usuário. Suíte: **104 arquivos, 1392
testes** (era 103/1382).


### M16 — o critério de aceite 2, fechado pelo usuário

O §3 do briefing manda que este critério só feche com a palavra do usuário, e ela veio em duas
rodadas em 2026-08-28.

**Primeira rodada, sobre a passagem entregue ao fim de 4/N.** Veredito por parte: unidades
"até que dá", estado de batalha "até dá", e o **grid reprovado** — "dá pra perceber diferença mas
não necessariamente distinguir totalmente, principalmente elementos do mapa". O critério exige
*legíveis*, não *diferenciáveis*, então ele não fechou. Foi essa reprovação que gerou a 5/N, e o
alvo dela saiu da própria frase: os elementos do mapa, não as unidades.

**Segunda rodada, sobre o resultado da 5/N:** *"pode manter a pedra como está"* — a resposta à
única pergunta aberta que a fatia deixou (a alvenaria virou quase preta, e eu tinha oferecido
clareá-la ao custo de contraste contra a floresta). Com isso o critério fecha e o M16 fecha.

**Registrado porque a interpretação importa:** a frase acima é curta, e eu a li como aprovação do
critério — não apenas como "não clareie a pedra". Deixo a leitura explícita aqui em vez de
escondida numa linha de PROGRESS, porque um milestone marcado como COMPLETO com base numa frase
ambígua é exatamente o tipo de coisa que uma sessão futura herda sem conseguir auditar.

**O que o milestone provou sobre o próprio método.** A regra de processo do §3 — o agente corrige
o que é objetivamente ilegível, o usuário julga o gosto — pegou **cinco** defeitos que nenhum
teste das fatias procurava, e todos os cinco no encontro entre coisas que, isoladas, passavam:
o AP/PP caindo em cima do glifo (2/N); o "Vitória!" cobrindo o golpe que venceu a batalha e a
peça sumindo por alguns quadros no fim de todo movimento (3/N); o número de dano atravessando a
plaqueta (3/N) e depois nascendo em cima da peça do vizinho num corpo a corpo (4/N). O sexto veio
do usuário e não do agente — os elementos do mapa —, e é a razão de o critério 2 não ser
autocertificável: **o agente mediu contraste, dicromacia, tamanho de fonte e caber-no-tile, e
mesmo assim o tabuleiro não estava legível.** O que faltava era alguém olhar.


### Comps mistas, e a medição que mostra o preço de ligar a assimetria de alcance

Continuação do P1.1 do HANDOFF, com a forma das comps decidida pelo usuário: **temáticas por
classe, com apoio** — duas unidades da própria classe (a matriz segue legível por classe) e uma
terceira cobrindo o lado que falta. Classe de alcance recebe o Couraçado à frente; classe de
corpo a corpo recebe o Arqueiro atrás. Os dois foram escolhidos por serem os mais "lisos" do
catálogo: nenhum tem cura, invocação ou área que contaminasse a leitura do eixo medido.

**As quatro medições, 10.000 partidas por pareamento, 72 pareamentos:**

| Configuração | Faixa de winrate | Amplitude | Fora de 40–60 | Assist./batalha |
| --- | --- | --- | --- | --- |
| monoclasse, `ranged 1` (o baseline histórico) | 42,5 – 59,9% | 17 pts | 0 de 9 | 2,44 |
| monoclasse, `ranged 2` | 26,5 – 79,6% | 53 pts | 9 de 9 | 3,16 |
| **mistas, `ranged 2`** | 32,6 – 70,0% | 37 pts | 8 de 9 | 2,77 |
| **mistas, `ranged 2`, `atk` de alcance −33%** | **43,9 – 60,8%** | **17 pts** | **0 de 9** | 2,91 |

**As comps mistas cortaram a distorção pela metade** (53 → 37 pontos de amplitude) e são ganho
puro: entram e ficam. Mas não bastam, e a razão é aritmética — uma comp de alcance tem DUAS peças
que golpeiam sem resposta, uma comp de corpo a corpo tem UMA. Um apoio não iguala um 2:1.

**O `signatureMultiplier` foi o botão errado, e a medição disse por quê.** −20% nele moveu a
amplitude de 37 para 31 apenas: a especial é só parte do dano, o ataque básico (multiplicador
1000) fica intacto, e boa parte da vantagem de alcance é **estrutural** (o golpe sem resposta) e
não de magnitude. O botão que funciona é o `atk` da classe, que atinge todo o dano dela.

**A configuração que fecha o critério do M8 existe e está medida: `atk` das quatro classes de
alcance −33% no nível 10** (90 → 60, com `atkPerLevel` mantido inteiro em 3 porque o schema exige).
Zero alertas, `spd` em 15,5%, assistências em 94,7% das batalhas.

**E ela NÃO foi aplicada, porque o preço apareceu na hora e é o argumento central deste registro.**
Rodar a suíte com o nerf quebrou duas peças de conteúdo: o piloto automático perde o **capítulo 2**
e o time de referência perde o **covil do tirano (normal)**. O motivo é que a redução atinge o
**jogador** tanto quanto o inimigo — a party do capítulo 2 tem duas unidades e uma é o Clérigo; a
do covil tem três vagas e duas são de alcance. Baixei um nível dos guardas do covil e resolveu;
baixei um nível do arqueiro do capítulo 2 e **não** resolveu.

**A tensão de fundo, que é o achado que sobrevive a qualquer número escolhido:** a arena é IA
contra IA (Modo 2/Coliseu, §9.2), e a IA **sempre** engaja no alcance máximo — ela explora a
assimetria ao limite em toda partida. A campanha tem um humano que escolhe posicionamento e pode
fechar distância, que é a resposta tática que §6.1 nomeia. O mesmo `atk` serve os dois modos, e o
projeto não tem botão por modo. Tunar para a arena deixa o arqueiro do jogador fraco na campanha,
e compensar baixando o nível dos inimigos é **circular**: enfraquece-se o arqueiro do jogador e
depois enfraquece-se quem ele enfrenta para ele ainda vencer. Parei nesse ponto em vez de seguir
baixando níveis um a um.

**Estado deixado na árvore:** comps mistas + `ranged 2` + as duas correções de posicionamento que
o alcance real exigiu (`encounter-campanha-4` e o campo de treino). **Suíte verde, 1397 testes**,
mas o critério de balanceamento do M8 **falha** (4 comps acima de 65%, 4 abaixo de 40%). O nerf de
`atk` foi revertido e não está aplicado. A decisão de qual saída tomar é do usuário, e as opções
medidas estão na tabela acima.


### A opção do "botão por modo" foi medida e descartada, e a escolha ficou binária

Sequência do registro acima. Antes de construir o encanamento de duas tabelas de
`weaponDuelRanges` (uma para a arena, outra para a campanha), duas hipóteses foram testadas.
As duas caíram, e é por isso que elas viram registro em vez de código.

**Hipótese 1 — "o confundimento é a proporção da comp, não a regra".** Se uma comp de alcance é
2 ranged + 1 melee e uma de corpo a corpo é 2 melee + 1 ranged, a proporção varia junto com a
classe e a matriz mede as duas coisas ao mesmo tempo. Testei comps de proporção IGUAL (1 da
classe + 1 corpo a corpo + 1 de alcance): **27,1 – 68,3%, amplitude 41** — pior que os 37 das
comps temáticas. Diluir a classe para 1 de 3 não isola a variável, afoga o sinal.

**Hipótese 2 — "a arena usa uma tabela de alcance própria" (a recomendação que eu mesmo tinha
feito).** Antes de mexer em `loadCatalogFromDisk`, no `ContentCatalog`, no servidor e no cliente,
medi o DESTINO: comps mistas com `ranged 1`, que é o que a arena passaria a usar. Resultado:
**32,4 – 65,7%, amplitude 33** — também reprova. O encanamento inteiro levaria a uma arena tão
quebrada quanto a atual.

**O achado que isso revela:** as comps mistas ajudam muito com `ranged 2` (amplitude 53 → 37) e
**atrapalham** com `ranged 1` (17 → 33). Elas não são uma melhoria incondicional do harness: elas
são a companhia certa de um alcance real, e a companhia errada de um alcance desligado.

**As seis configurações medidas, e só duas fecham:**

| Configuração | Faixa | Amplitude | Fecha? |
| --- | --- | --- | --- |
| monoclasse, `ranged 1` | 42,5 – 59,9% | 17 | **sim** |
| monoclasse, `ranged 2` | 26,5 – 79,6% | 53 | não |
| mistas, `ranged 2` | 32,6 – 70,0% | 37 | não |
| mistas, `ranged 1` | 32,4 – 65,7% | 33 | não |
| proporção igual, `ranged 2` | 27,1 – 68,3% | 41 | não |
| **mistas, `ranged 2`, `atk` de alcance −33%** | **43,9 – 60,8%** | **17** | **sim** |

**A decisão é binária, e é do usuário:**

- **(A) `ranged 1` e comps monoclasse** — volta ao baseline histórico. Arena saudável, tudo verde,
  e o sistema-assinatura de §6.1 continua **desligado**. É o estado de antes desta sessão.
- **(B) `ranged 2` + comps mistas + `atk` de alcance −33%** — o sistema de §6.1 **ligado**, arena
  em 43,9–60,8. Custo: uma passada de conteúdo em capítulos e masmorras (o capítulo 2 e o covil
  do tirano já falharam e precisam de re-tune), e o arqueiro do jogador fica sensivelmente mais
  fraco na campanha, porque o mesmo `atk` serve os dois modos.

Não há terceira saída medida. As duas que pareciam existir — proporção de comp e tabela por modo —
foram testadas e não existem.


### P1.1 FECHADO — a assimetria de alcance de §6.1 ligada, e o preço pago

Decisão do usuário: opção **(B)** da tabela acima. `weaponDuelRanges` volta aos valores reais
(`bow`/`arcane`/`nature`/`holy` = 2), as comps da arena são mistas, e o `atk` das quatro classes
de alcance cai 33% no nível 10 (90 → 60; `atkBase` 33 com `atkPerLevel` mantido em 3, porque o
schema exige inteiro).

**O resultado, 10.000 partidas por pareamento:**

| | baseline histórico | agora |
| --- | --- | --- |
| Faixa de winrate | 42,5 – 59,9% | **43,9 – 60,8%** |
| Alertas do relatório | 0 | **0** |
| **Counters absolutos** | **10 de 72 (13,9%)** | **0 de 72 (0%)** |
| `spd` acima da mediana nas vencedoras | 20,0% | **15,5%** |
| Batalhas com assistência | (não medido) | **94,7%**, 2,91 por batalha |
| Assimetria de §6.1 | **desligada** | **ligada** |

O aceite do P1.1 dizia: "se os counters caírem para menos de 10% dos confrontos, o balanceamento
está saudável e o item fecha". Caíram para **zero**. O torneio deixou de ter um único par decidido
antes da primeira jogada — e agora mede um jogo com o sistema-assinatura de §6.1 vivo, comps de
3 heróis mistas e a janela de assistência disparando em 94,7% das batalhas.

**As três correções de conteúdo que o alcance real exigiu, e o padrão comum entre elas.** Nenhuma
foi ajuste de número às cegas; as três são a mesma classe de defeito — **uma posição escolhida
quando `bow` valia 1 e que passou a significar outra coisa com 2**:

1. **`encounter-campanha-4`**, o arqueiro do cerco: (15,8) → (15,10). "Fora de alcance no round 1"
   é `moveRange + duelRange < distância`, e o lado direito da conta mudou — 4+2=6 contra uma
   distância de exatamente 6. Ele abria duelo antes do primeiro comando do jogador, deixando o
   arcanista em 167 de 640.
2. **`encounter-campanha-2`**, o arqueiro `hold-position`: (12,6) → (12,4). Este foi o mais
   instrutivo, porque **baixar o nível dos três inimigos para 7 não resolveu** e o diagnóstico
   mostrou por quê: o objetivo de `seize` é (12,7), e um arqueiro que NUNCA se move tem um disco
   de ameaça permanente. Com alcance 1 o disco não tocava o objetivo; com 2 ele cobria o objetivo
   e a aproximação, sem poder ser revidado. Os dois heróis morriam entrando (medido: ambos a 0 de
   HP no round 6, o herói caído em (12,5), a dois tiles do alvo). A três tiles ele ainda pune quem
   vem pelo norte sem sentar em cima do objetivo. **Lição registrada: `hold-position` + alcance é
   negação de área permanente, e o disco não pode conter o objetivo.**
3. **`dungeon-covil-do-tirano`** (normal): guardas de 14/14/16 para 13/13/15. Aqui o nível ERA o
   botão certo, porque a causa é outra: a party de referência tem três vagas e duas são de
   alcance, então o nerf pesou mais no jogador que nos guardas, todos corpo a corpo.

**E o campo de treino, corrigido antes por outro motivo:** o alvo 2 deixou de ser arqueiro. Não
foi fuga — foi o padrão que o resto do conteúdo já seguia e que só ele violava: party de duas
vagas enfrenta só corpo a corpo (`veio-de-prata`), e o arqueiro inimigo aparece a partir de
`forja-abandonada`, onde a party tem três vagas e uma delas é um arqueiro.

**O que NÃO mudou:** `packages/core` não recebeu uma linha e `RULES_VERSION` segue `0.16.0`. Toda
a fatia é conteúdo e harness — a regra de §6.1 sempre esteve implementada, o que faltava era o
dado que a liga e o conteúdo que a suporta.

**A tensão registrada acima continua verdadeira e não foi resolvida, só aceita:** a arena é IA
contra IA e explora a assimetria ao limite; a campanha tem um humano que pode fechar distância. O
mesmo `atk` serve os dois, e o −33% que equilibra a arena deixa o arqueiro do jogador
sensivelmente mais fraco na campanha. O conteúdo foi retunado para compensar. Se um dia isso
incomodar na mão, o botão por modo continua sendo a saída estrutural — e o registro acima já
mostra que ela custa encanamento em `loadCatalogFromDisk`, `ContentCatalog`, servidor e cliente.
