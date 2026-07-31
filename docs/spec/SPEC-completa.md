# SPEC — "Project Vanguard" (nome provisório) — v2

> **Tactical RPG com grid e heróis individuais tipo Fire Emblem, duelos automáticos por script tático e economia de recursos tipo Unicorn Overlord, ordem de turno tipo Dofus, equipamento tipo Epic Seven e árvore de classes/talentos tipo World of Warcraft — arquitetado desde o dia 1 para suportar PvP.**

Este documento é a especificação de implementação. Onde houver "DEVE", trate como requisito rígido. Onde houver "PODE", é escolha livre do implementador.

**Mudanças da v1 → v2:** esquadrões removidos (cada peça no grid é **um herói**); combate é um **duelo 1v1** com assistências de aliados adjacentes; ordem de turno passou de fases alternadas para **lista única de iniciativa fixa (modelo Dofus)**; `spd` foi rebaixado de stat dominante para **desempate ordinal com benefícios limitados e enumerados**; AP/PP viraram **pools de mapa** (recurso persistente, tipo Unicorn Overlord) e substituíram o sistema de stamina.

---

## 0. Como usar esta spec com o Claude Code

1. Coloque este arquivo na raiz do repositório como `SPEC.md`.
2. Crie um `CLAUDE.md` na raiz com as **Regras Invioláveis** (seção 12).
3. Implemente **milestone por milestone** (seção 13). Não vá para o cliente visual antes do núcleo determinístico estar testado.
4. Um milestone só termina quando os **critérios de aceite** passam com testes automatizados.

---

## 1. Visão do produto

O jogador comanda um exército de **heróis individuais** em batalhas táticas em grid. Cada peça no tabuleiro é um herói — posicionamento, alcance de movimento e zona de ameaça funcionam como em Fire Emblem.

Quando dois heróis se enfrentam, abre-se um **duelo**: um confronto automático de até 3 trocas, resolvido por **scripts táticos** que o jogador programa antes da batalha, limitado por uma **economia de recursos (AP/PP) que dura a batalha inteira**. O jogador não dá input durante o duelo. Ele decide *quem ataca quem, de onde, com quais recursos disponíveis e sob quais regras*.

A profundidade que em Unicorn Overlord vem da composição de esquadrão, aqui vem de duas fontes:
- **Assistências**: aliados próximos com PP disponível intervêm no duelo automaticamente, conforme seus próprios scripts. Posicionamento no grid vira composição de encontro.
- **Economia de recursos escassos**: AP e PP não regeneram sozinhos. Cada skill gasta de um pool que precisa durar o mapa inteiro.

Fora da batalha, o jogador constrói heróis com **equipamento com substats aleatórios** (Epic Seven) e **árvores de talento com escolhas exclusivas** (World of Warcraft). O **PvP** é a validação final da build.

### 1.1 Pilares de design (usar para resolver ambiguidades)

| Pilar | Significado prático |
|---|---|
| **A decisão acontece antes do combate** | Erro de build, posicionamento, script ou gasto de recurso é punido. Não há input reativo durante o duelo. |
| **Recurso escasso > stat alto** | Vencer é saber quando *não* gastar. Nenhum sistema pode permitir spam da melhor skill. |
| **Determinismo total** | Mesmo estado inicial + mesma seed + mesmos comandos = mesmo resultado em qualquer máquina. É o que viabiliza PvP assíncrono e replays. |
| **Tudo é data-driven** | Nenhuma classe, skill, item, mapa ou inimigo é hardcoded. |
| **Legibilidade tática** | O jogador DEVE conseguir prever o resultado antes de confirmar: preview do duelo, zona de ameaça, lista de iniciativa e pools de recurso sempre visíveis. |
| **Nenhum stat pode ser obrigatório** | Se um stat vira pré-requisito de toda build, ele é um bug de design. Vale especialmente para `spd` (seção 6.7). |

---

## 2. Stack técnica

| Camada | Escolha | Justificativa |
|---|---|---|
| Linguagem | **TypeScript** (strict) | Um único idioma para core, cliente e servidor. |
| Núcleo de simulação | Pacote puro, **zero dependências**, sem DOM, sem I/O | Roda idêntico no browser, no Node e em testes. |
| Renderer | **PixiJS v8** (WebGL) + React para HUD/menus | Grid 2D com muitos sprites; React é ruim para grid, ótimo para UI. |
| Estado de UI | **Zustand** | Simples, não impõe estrutura no core. |
| Build | **Vite** + **pnpm workspaces** | Rápido, suporta monorepo. |
| Testes | **Vitest** | Mesma toolchain. |
| Validação de dados | **Zod** | Valida os JSON de conteúdo em build-time e runtime. |
| Servidor (M7+) | **Node + Fastify**, Postgres, Redis | Reaproveita o core para validar PvP. |

**Não usar** engine pesada (Unity/Godot). O risco do projeto é a simulação determinística e o volume de dados, não a renderização.

### 2.1 Estrutura do monorepo

```
/
├── CLAUDE.md                  # regras invioláveis para o agente
├── SPEC.md                    # este arquivo
├── DECISIONS.md               # log de decisões não previstas na spec
├── packages/
│   ├── core/                  # simulação pura e determinística
│   │   ├── src/
│   │   │   ├── rng/           # PRNG seedado
│   │   │   ├── math/          # aritmética de ponto fixo
│   │   │   ├── grid/          # mapa, pathfinding, zonas
│   │   │   ├── battle/        # loop de mapa, iniciativa, rounds
│   │   │   ├── duel/          # resolução do duelo 1v1 + assistências
│   │   │   ├── tactics/       # interpretador de scripts táticos
│   │   │   ├── stats/         # agregação de stats, equipamento, talentos
│   │   │   ├── commands/      # comandos e replay
│   │   │   └── index.ts
│   │   └── tests/
│   ├── data/                  # conteúdo JSON + schemas Zod
│   │   ├── schemas/ classes/ skills/ items/ heroes/ maps/
│   │   └── validate.ts        # CI falha se algum JSON quebrar o schema
│   ├── sim-cli/               # batalhas e duelos headless
│   └── ui/                    # componentes React compartilhados
├── apps/
│   ├── client/                # jogo (Pixi + React)
│   └── server/                # API + validação de PvP (M7+)
└── tools/
    └── balance/               # simulação em massa, relatórios de winrate
```

---

## 3. Fundações não negociáveis

### 3.1 Aritmética de ponto fixo

Ponto flutuante DEVE ser proibido em qualquer cálculo que afete o resultado da batalha — a ordem de operações em `float` pode divergir entre plataformas e quebrar replays de PvP.

- Todo stat, dano, multiplicador e porcentagem é **inteiro em escala 1000** (`FP_SCALE = 1000`). Ex.: 45,7% → `457`.
- `packages/core/src/math/fixed.ts` expõe `fpMul(a,b)`, `fpDiv(a,b)`, `fpPct(value, pct)`, sempre truncando com `Math.trunc`.
- Teste de CI rejeita `/` e `*` diretos em `duel/`, `stats/` e `battle/` fora dos helpers.

### 3.2 RNG seedado

- PRNG DEVE ser **xoshiro128\*\*** ou **PCG32**, implementado à mão, com estado serializável.
- `Math.random()` é **proibido** em `packages/core`. Teste de CI faz grep e falha.
- Sub-streams derivados por contexto: `rngFor(battleSeed, round, unitId, purpose)`.
  Assim, adicionar uma rolagem em um sistema não desloca as rolagens de outro.

### 3.3 Simulação orientada a comandos (base do PvP e do replay)

```ts
type BattleCommand =
  | { t: 'move'; unitId: Id; path: Coord[] }
  | { t: 'engage'; unitId: Id; targetId: Id }      // abre um duelo
  | { t: 'mapSkill'; unitId: Id; skillId: Id; target: Coord }
  | { t: 'rest'; unitId: Id }                      // recupera AP/PP
  | { t: 'useValor'; skillId: Id; target: Coord }
  | { t: 'wait'; unitId: Id };

interface Replay {
  rulesVersion: string;   // versão das regras + versão dos dados
  seed: number;
  initialState: BattleSetup;
  commands: BattleCommand[];
}
```

- O estado da batalha é derivado **exclusivamente** de `initialState + seed + commands`.
- `simulate(replay) => BattleResult` DEVE ser pura.
- Teste obrigatório: rodar o mesmo replay 1000 vezes e comparar hash do estado final; e rodar em Node e em browser headless comparando o hash.

---

## 4. Modelo de dados

### 4.1 Stats

| Stat | Código | Tipo | Notas |
|---|---|---|---|
| Vida | `hp` | flat | |
| Ataque | `atk` | flat | |
| Defesa | `def` | flat | |
| Velocidade | `spd` | flat | **Ordinal.** Ver seção 6.7 — benefícios enumerados e limitados. |
| Chance de crítico | `chc` | % (cap 1000) | |
| Dano crítico | `chd` | % | Base 1500. |
| Efetividade | `eff` | % | Chance de aplicar debuffs. |
| Resistência a efeito | `efr` | % | |
| Penetração de defesa | `pen` | % | Cap 700. |
| Cura dada/recebida | `heal` | % | |
| Vampirismo | `lifesteal` | % | |
| Concentração | `focus` | flat | **Substitui `cdr`.** Aumenta o pool máximo de AP a cada 100 pontos (cap +2). |
| Vigor | `vigor` | flat | Aumenta o pool máximo de PP a cada 150 pontos (cap +2). |

`focus` e `vigor` existem para dar um eixo de build alternativo a `spd` e `atk`: uma build de recurso alto pode gastar mais skills ao longo do mapa, mesmo perdendo cada duelo isolado por pouco.

**Ordem de agregação (DEVE ser exatamente esta):**

```
1. base do herói no nível N (curva no JSON da classe) × multiplicador de awakening
2. + flat de classe/promoção + imprint
3. + flat de equipamento (mainstats e substats flat)
4. × (1 + soma das % de equipamento)
5. + flat de talentos
6. × (1 + soma das % de talentos)
7. + bônus de set de equipamento (2/4 peças)
8. × (1 + buffs/debuffs ativos)      ← só dentro do duelo, não persiste no sheet
```

Passos 1–7 produzem o **stat sheet estático**; cacheie e invalide só quando equipamento/talento/nível/awakening mudarem. Passo 8 é o único recalculado dentro do duelo.

### 4.2 Entidades

```ts
interface Hero {
  id: Id;
  classId: Id;
  level: number;              // 1..60
  exp: number;
  awakening: 0|1|2|3|4|5|6;
  imprint: 0|1|2|3|4|5;
  talents: TalentAllocation;
  equipment: Record<GearSlot, ItemInstanceId | null>;
  duelSkills: Id[];           // até 5 conhecidas; o script escolhe entre elas
  mapSkills: Id[];            // até 2
  tacticsScript: TacticsScript;
}

interface UnitOnMap {          // instância viva na batalha — 1 herói = 1 tile
  unitId: Id;
  heroId: Id;
  pos: Coord;
  hp: number;
  ap: number;                  // pool de mapa; ver 6.2
  pp: number;                  // pool de mapa; ver 6.2
  initiative: number;          // fixo na batalha; ver 5.3
  hasActedThisRound: boolean;
  effects: ActiveEffect[];
  cooldowns: Record<Id, number>;  // em rounds de MAPA, não de duelo
}
```

Não existe `Squad`. Não existe formação interna. **Adjacência no grid é a formação.**

---

## 5. Camada tática: o grid

### 5.1 Mapa

- Grid **quadrado** ortogonal, 15×15 a 30×30. Distância = **Manhattan**.

```ts
interface Tile {
  terrain: TerrainId;
  height: 0|1|2|3;
  object?: 'wall'|'fort'|'gate'|'chest'|'camp';
}

interface Terrain {
  id: TerrainId;
  moveCost: Record<MoveType, number | 'impassable'>;
  defBonus: number;   // % de mitigação, escala 1000
  evaBonus: number;
  blocksSight: boolean;
}
```

`MoveType` DEVE incluir `foot`, `cavalry`, `flying`, `heavy`, `aquatic`. Voadores custam 1 em tudo exceto `impassable`, mas sofrem `+25%` de dano de arqueiros.

### 5.2 Movimento

- Alcance = **Dijkstra** com custo de terreno, limitado por `moveRange` da classe.
- **Zone of Control**: tiles ortogonalmente adjacentes a inimigo. Entrar encerra o movimento. Flag por mapa (`zocEnabled`).
- Atravessar aliados é permitido; terminar sobre aliado não.
- O caminho vem inteiro no comando `move` e é **revalidado** pelo simulador. Nunca confie no cliente.

### 5.3 Ordem de turno — lista única de iniciativa (modelo Dofus)

**Não há fase do jogador e fase do inimigo.** Todas as unidades, dos dois lados, ficam em uma única lista ordenada e agem uma vez por round, alternando conforme a lista.

```
iniciativa = spd + rand(0, 99)     // stream 'initiative', rolado UMA vez no início da batalha
```

- A lista é calculada **no início da batalha e NÃO é recalculada** entre rounds. Buffs de `spd` durante a batalha **não** reordenam a lista (só afetam o duelo, seção 6.7). Isso é deliberado: impede que buff de velocidade vire bola de neve.
- Unidades que entram depois (reforços, invocações) são inseridas na posição correspondente ao seu valor de iniciativa.
- Empate resolvido de forma determinística por `(unitId)`, nunca por RNG adicional.
- O round termina quando todas as unidades vivas agiram. Então `hasActedThisRound` reseta, cooldowns de mapa decrementam, e efeitos com duração em rounds tickam.
- A lista de iniciativa completa DEVE ser visível ao jogador o tempo todo, com destaque de quem age em seguida (requisito de UI, não opcional).

**Compensação para quem age tarde:** unidades no terço final da lista começam a batalha com **+1 PP**. Agir cedo dá tempo de iniciativa; agir tarde dá informação e recurso reativo. Isso é o principal freio contra builds de `spd`.

### 5.4 Ação da unidade

No seu turno, uma unidade faz: `mover?` **+ uma** das opções:

| Ação | Efeito |
|---|---|
| `engage` | Abre um duelo com inimigo adjacente (ou à distância, se a arma for ranged — ver 6.1). |
| `mapSkill` | Usa skill de mapa (cura em área, artilharia, buff de zona). Custa AP. |
| `rest` | Não pode ter movido mais que metade do alcance. Recupera **+1 AP e +1 PP**. |
| `wait` | Encerra o turno. Se terminar sobre `fort` ou `camp`: **+1 AP**. |

Uma unidade **pode ser engajada quantas vezes for por outros**; o limite de participação em duelos é o próprio recurso (PP para reagir) e o HP.

### 5.5 Modificadores posicionais do duelo

Calculados no momento do `engage` e passados para o duelo como constantes:

| Situação | Efeito |
|---|---|
| **Flanco**: um aliado do atacante também está adjacente ao defensor | Atacante `+10%` de dano; defensor **não pode gastar PP na primeira troca**. |
| **Cerco**: dois ou mais aliados adjacentes ao defensor | Como flanco, e defensor `-15%` de evasão. |
| **Altura**: diferença de `height` | `+10%` de acurácia e `+5%` de dano por nível de diferença. |
| **Terreno do defensor** | Aplica `defBonus` e `evaBonus` do tile. |
| **Emboscada**: defensor com 0 PP | Atacante `+15%` de dano crítico no duelo. |

Isso faz o grid importar de verdade sem precisar de esquadrões.

### 5.6 Pontos de Valor

Recurso de exército, tipo Unicorn Overlord. Começa em 5, +1 por round, +2 ao capturar objetivo. Gasto em: restaurar AP/PP de uma unidade, invocar reforço, artilharia de mapa, buff global de 1 round. Definidos em `data/valor-skills/*.json`.

### 5.7 Condições de vitória/derrota

Data-driven por mapa: `rout`, `seize`, `survive N rounds`, `escort`, `defend`. Permadeath é flag do `BattleSetup` (`casual | classic | ironman`), nunca hardcoded.

---

## 6. O duelo (Unicorn Overlord, 1v1)

Este é o coração do jogo e o sistema de maior risco. Implemente-o **primeiro**, headless, com testes, antes de qualquer pixel.

### 6.1 Estrutura

Quando A engaja B:

1. Monta-se um `Duel` com os dois heróis, seus stat sheets, seus **pools atuais** de AP/PP e os modificadores posicionais (5.5).
2. Resolve-se a **janela de assistências** (6.5).
3. O duelo dura no máximo **`MAX_TROCAS = 3`**. Em cada troca, cada participante age **uma vez**, na ordem definida em 6.7.
4. O duelo termina quando: alguém morre, ou as 3 trocas acabam.
5. Aplica-se o resultado ao mapa: HP, pools de AP/PP gastos, efeitos com duração `battle`, EXP, mortes.

**Alcance.** Cada arma tem `duelRange`:
- `melee` (1): ambos podem agir normalmente nas 3 trocas.
- `ranged` (2–3): se o alcance do atacante é maior que o do defensor e a distância excede o alcance do defensor, **o defensor não age no duelo** — não pode contra-atacar, só sofre. Isso torna arqueiros e magos fortes e cria a resposta tática óbvia: fechar distância. Se o defensor também é ranged com alcance suficiente, o duelo é normal.

### 6.2 AP e PP — a economia de recursos (regra central)

**AP e PP são pools de batalha inteira, não de duelo.** Este é o ponto de tradução do Unicorn Overlord: o recurso é escasso e precisa durar o mapa.

| | AP (Pontos de Ação) | PP (Pontos Passivos) |
|---|---|---|
| Base | 3–5 por classe (+ `focus`, cap +2) | 1–3 por classe (+ `vigor`, cap +2) |
| Gasto em | Skills ativas no duelo; skills de mapa | **Reações**: contra-atacar, esquivar, cobrir aliado, cura reativa, **assistir** um duelo aliado |
| Recuperação | `rest` (+1), `wait` em `fort`/`camp` (+1), Valor, itens | `rest` (+1), Valor, itens, alguns talentos |
| Regeneração passiva | **Nenhuma** | **Nenhuma** |

Regras duras:
- O **ataque básico custa 0 AP** e está sempre disponível. Um duelo sempre resolve, mesmo com pools zerados.
- **Contra-atacar custa 1 PP.** Não é grátis. Um defensor sem PP apanha de graça — e sofre "Emboscada" (5.5).
- Uma unidade **não pode gastar mais de 2 AP em um mesmo duelo**, mesmo tendo pool. Isso impede que um duelo consuma o mapa inteiro e mantém a leitura do preview simples.

Consequência de design pretendida: agressão constante drena recursos. Escolher **quando** duelar é a decisão do jogo.

### 6.3 Scripts táticos (a mecânica-assinatura)

Cada herói tem uma lista **ordenada** de até 6 linhas. Cada linha:

```ts
interface TacticsLine {
  enabled: boolean;
  skillId: Id;
  conditions: Condition[];   // AND entre elas; 2 no início, até 3 com talentos
}

type Condition =
  // sobre o oponente
  | { t: 'targetHpBelow'; pct: number }
  | { t: 'targetHpAbove'; pct: number }
  | { t: 'targetHasDebuff'; debuffId: Id }
  | { t: 'targetHasBuff'; buffId: Id }
  | { t: 'targetIsType'; type: UnitType }        // infantry, cavalry, flying, armored, caster
  | { t: 'targetWeaponIs'; weapon: WeaponType }  // permite counter-pick pelo triângulo
  | { t: 'targetPpBelow'; n: number }            // "ele não pode revidar: gaste tudo"
  // sobre si
  | { t: 'selfHpBelow'; pct: number }
  | { t: 'selfBuffAbsent'; buffId: Id }
  | { t: 'apAtLeast'; n: number }
  | { t: 'ppAtLeast'; n: number }
  // sobre o contexto
  | { t: 'isAttacker' }                          // eu iniciei o duelo
  | { t: 'isDefender' }
  | { t: 'hasPositionalBonus' }                  // flanco, cerco ou altura
  | { t: 'trocaAtLeast'; n: 1|2|3 }
  | { t: 'battleRoundAtLeast'; n: number }       // economia de recurso no início do mapa
  | { t: 'alliesAdjacentAtLeast'; n: number }
  | { t: 'not'; c: Condition };
```

**Algoritmo de decisão (DEVE ser implementado literalmente):**

```
para cada linha do script, de cima para baixo:
  se !enabled                                  → pula
  se skill em cooldown                         → pula
  se AP insuficiente no pool                   → pula
  se gasto excederia o limite de 2 AP no duelo → pula
  se a skill é reação e PP insuficiente        → pula
  avalia todas as conditions
  se todas passam → executa a skill e encerra a decisão desta troca
se nenhuma linha passar → ataque básico (0 AP)
se não puder atacar (sem alcance / não pode agir) → nada acontece nesta troca
```

**Nunca** adicione heurística, busca ou "IA inteligente" por cima disso. A previsibilidade é o produto: o jogador precisa conseguir simular o duelo de cabeça.

### 6.4 Scripts de reação

As reações têm um script separado, também ordenado, avaliado quando a unidade **sofre** uma ação:

```ts
type ReactionTrigger = 'onAttacked' | 'onDamaged' | 'onDebuffed' | 'onAllyEngagedNearby' | 'onLethal';
```

Reações padrão que toda unidade tem: `Contra-atacar` (1 PP), `Defender` (1 PP, `-40%` de dano na troca). Classes e talentos adicionam outras: `Cobrir aliado`, `Esquiva`, `Escudo reativo`, `Cura de emergência`.

Uma unidade gasta **no máximo 1 PP por troca**.

### 6.5 Assistências — a substituição do esquadrão

Depois que o duelo é declarado e antes da primeira troca:

1. Percorre-se a lista de iniciativa (ordem determinística).
2. Cada aliado do atacante e do defensor que esteja **dentro do `assistRange` da sua arma** em relação ao duelo, tenha **PP ≥ 1** e tenha uma linha de reação com trigger `onAllyEngagedNearby` cujas condições passem, **assiste**.
3. Assistir gasta **1 PP** do assistente e executa uma ação reduzida: `50%` do dano da skill, ou cura/buff em efeito integral.
4. **Máximo de 2 assistências por lado, por duelo.** Prioridade pela ordem de iniciativa.
5. Assistir **não** consome o turno do assistente no mapa. Consome o recurso dele.

Isso é o que faz posicionamento virar composição: um arqueiro atrás da linha de frente e um clérigo no alcance certo transformam um duelo perdido em vitória — mas cada intervenção custa PP que não volta.

### 6.6 Fórmula de dano (normativa)

Todos os valores em ponto fixo, escala 1000.

```
1.  base        = fpMul(ATK_atacante, skill.multiplier) + skill.flat
                  (ou DEF/HP se skill.scalesWith != 'atk')
2.  defEfetiva  = fpPct(DEF_defensor, 1000 - min(pen, 700))
3.  mitigacao   = fpDiv(300000, 300000 + defEfetiva * 300)   // ~50% aos 1000 DEF
4.  posMitig    = fpMul(base, mitigacao)
5.  triangulo   = × 1100 / 1000 / 900 conforme 6.8
6.  posicional  = × (flanco, cerco, altura, terreno)         // constantes vindas de 5.5
7.  crit        = rolagem chc → se crítico × chd, senão × 1000
8.  buffs       = × (1 + Σ %dano) × (1 - Σ %redução)
9.  variancia   = × rand(970, 1030)     // ±3%, stream 'damage-variance'
10. final       = max(1, trunc(resultado))
```

**Acurácia:** `hit = clamp(acc_atacante - eva_defensor + terrenoEva + alturaMod, 50, 1000)`. Rolagem única — não use o "2RN" de Fire Emblem, ele quebra a legibilidade do preview em combate automático.

### 6.7 O papel de `spd` — benefícios enumerados e fechados

`spd` é **ordinal e limitado**. Esta lista é **exaustiva**; adicionar qualquer benefício novo a `spd` exige atualizar esta seção da spec.

1. **Posição na lista de iniciativa** (5.3), calculada uma vez no início da batalha.
2. **Ordem dentro do duelo:** o atacante age primeiro por padrão. O defensor **preempta** (age primeiro na troca 1) se `spd_defensor ≥ spd_atacante × 1,15`. Só isso — não concede troca extra.
3. **Evasão:** `eva += (spd - 100) × 0,5`, com **cap rígido de +150** (15%).

`spd` **NÃO** concede, em nenhuma hipótese: turno extra, troca extra, AP ou PP extra, redução de cooldown, ou reordenação da lista de iniciativa por buff.

Por que isso funciona: benefício ordinal tem retorno decrescente natural — passar o rival na lista vale muito, ficar 300 pontos acima dele não vale nada a mais. E quem age tarde ganha +1 PP (5.3), o que dá vantagem reativa. O objetivo de balanceamento é que `spd` fique como um stat **bom em builds específicas** (assassinos que precisam matar antes de apanhar), não como pré-requisito universal.

**Sinal de alerta para o balanceamento:** se, no relatório de `tools/balance`, mais de 60% das builds vencedoras tiverem `spd` acima da mediana, o sistema falhou — reduza o cap de evasão ou aumente o limiar de preempção antes de mexer em qualquer outra coisa.

### 6.8 Triângulo de armas e tipos

- `Espada > Machado > Lança > Espada`; `Arcano > Natureza > Sagrado > Arcano`.
- Arqueiros: `+25%` contra `flying`.
- `armored`: `-20%` de dano físico, `+20%` de dano mágico.
- Afeta dano **e** acurácia (`±100` de acurácia).

### 6.9 Efeitos

```ts
interface ActiveEffect {
  id: Id;
  duration: number | 'duel' | 'battle';   // número = rounds de MAPA
  stacks: number; maxStacks: number;
  dispellable: boolean;
}
```

- Aplicação: `chanceFinal = clamp(base × (1 + eff_atacante) × (1 - efr_defensor), 0, 1000)`.
- Ordem no início do turno de mapa da unidade: DoT → tick de duração → regeneração → ação.
- Efeitos `battle` persistem entre duelos no mesmo mapa (veneno, marca, quebra de armadura). São a forma de "acumular vantagem" ao longo da batalha sem depender de `spd`.

---

## 7. Equipamento e itens (Epic Seven)

### 7.1 Slots e mainstats

6 slots: `weapon`, `helmet`, `armor`, `necklace`, `ring`, `boots`.

| Slot | Mainstat |
|---|---|
| Weapon | sempre `atk` flat |
| Helmet | sempre `hp` flat |
| Armor | sempre `def` flat |
| Necklace | aleatório: `atk%`, `hp%`, `def%`, `chc`, `chd` |
| Ring | aleatório: `atk%`, `hp%`, `def%`, `eff`, `efr` |
| Boots | aleatório: `atk%`, `hp%`, `def%`, `spd`, **`focus`**, **`vigor`** |

Botas deixam de ser "o slot de `spd`" e passam a ser o slot de **eixo de build**: velocidade, ação ou reação. Distribua os pesos de forma equilibrada — não repita o erro do E7, onde botas sem `spd` são lixo.

### 7.2 Instância de item

```ts
interface ItemInstance {
  id: Id; setId: Id; slot: GearSlot;
  rarity: 'common'|'rare'|'heroic'|'epic';   // substats iniciais: 1/2/3/4
  ilvl: number;                               // 58..100
  mainstat: { stat: StatKey; value: number };
  substats: Array<{ stat: StatKey; value: number; rolls: number }>;  // máx 4
  enhance: number;                            // 0..15
  lockedBy?: HeroId;
  reforged: boolean;
}
```

### 7.3 Upgrade (o loop de endgame)

- **Enhance +0 → +15.** Em `+3, +6, +9, +12, +15`: adiciona um substat novo se houver menos de 4; senão **rola um substat existente** para cima, valor sorteado em `[min, max]` da tabela do stat naquele `ilvl`.
- Chance de sucesso decrescente (`+0→+3` 100%, `+9→+12` 65%, `+12→+15` 40%). Falha **não destrói** o item, só consome recurso.
- **Reforge** em `enhance=15` e `ilvl=100`: bônus fixo garantido em todos os substats, uma vez por item.
- Substats vêm de `data/items/substat-weights.json`. Nunca hardcoded.
- Toda rolagem usa `rngFor(seed, 'gear', itemId, enhanceStep)` — reprodutível e verificável server-side.

### 7.4 Sets

Mínimo para o M4 — 2 peças dão stat, 4 peças mudam comportamento:

| Set | Peças | Efeito |
|---|---|---|
| Ataque | 4 | `+35% atk` |
| Vida / Defesa | 2 | `+20% hp` / `+20% def` |
| Velocidade | 4 | `+25% spd` |
| Crítico | 2 | `+12% chc` |
| Perfuração | 2 | `+20% pen` |
| Vampiro | 4 | `+20% lifesteal` |
| **Duelista** | 4 | Contra-atacar custa 0 PP na primeira troca. |
| **Reserva** | 4 | `+1 AP` máximo e `rest` recupera `+2 AP`. |
| **Sentinela** | 4 | Assistir custa 0 PP uma vez por round de mapa. |
| Imunidade | 4 | Imune a debuffs na troca 1 do duelo. |

Os três sets em negrito atacam diretamente a economia de recursos — são o que dá identidade ao sistema e o principal contrapeso a builds de `spd`.

### 7.5 Poder de Combate (CP)

Métrica única e transparente, exibida na UI e usada para matchmaking. **Nunca** usada dentro da simulação.

```
CP = (atk × 1.6 + def × 2.2 + hp × 0.3)
   × (1 + chc/1000 × chd/1000)
   × (1 + spd/4000)                      // peso reduzido: spd é ordinal
   × (1 + focus/1200 + vigor/1500)
   × (1 + eff/2000 + efr/2000)
```

---

## 8. Classes e talentos (World of Warcraft)

### 8.1 Estrutura

```
Classe Base (nv 1-20)  →  Especialização (nv 20-40)  →  Mestria (nv 40-60)
   Soldado             →   Cavaleiro | Berserker      →  Paladino | Senhor da Guerra ...
```

Promoção exige item + nível mínimo, e é irreversível sem item raro de reset. Cada classe define: curva de stat base, `moveType`, `moveRange`, armas permitidas, **pools base de AP/PP**, e a árvore de talentos.

### 8.2 Árvores

Duas árvores por herói: **Classe** (8 pontos, compartilhada entre specs) e **Especialização** (8 pontos). 1 ponto por nível a partir do 5, alternando. ~16 pontos no nível 60.

```ts
interface TalentNode {
  id: Id;
  tree: 'class'|'spec';
  row: number;              // 1..8; gate por pontos gastos na árvore
  requires?: Id[];
  exclusiveWith?: Id[];     // choice nodes
  maxRank: 1|2|3;
  effects: TalentEffect[];
}

type TalentEffect =
  | { t: 'stat'; stat: StatKey; flat?: number; pct?: number }
  | { t: 'grantSkill'; skillId: Id }
  | { t: 'grantReaction'; reactionId: Id }
  | { t: 'modifySkill'; skillId: Id; patch: Partial<SkillDef> }
  | { t: 'extraTacticsSlot' }
  | { t: 'extraTacticsCondition' }
  | { t: 'maxAp'; n: number }
  | { t: 'maxPp'; n: number }
  | { t: 'apRefund'; on: 'kill'|'duelWon'|'assist'; n: number }
  | { t: 'duelApCap'; n: number }         // eleva o teto de 2 AP por duelo
  | { t: 'assistRangeBonus'; n: number }
  | { t: 'passive'; passiveId: Id };
```

**Regras de design das árvores:**
- Cada árvore DEVE ter no mínimo **3 choice nodes** que mudem o papel do herói de verdade. Ex.: "contra-atacar custa 0 PP, mas você perde 1 AP máximo" vs "seu ataque básico aplica sangramento".
- No máximo **30%** dos nós podem ser preenchimento de `+2% stat`.
- Ao menos **2 nós por árvore** DEVEM tocar a economia de AP/PP ou o sistema de assistência. Talento que só dá número é talento fraco neste jogo.
- **Reset barato** (ouro). Experimentar build é conteúdo, não punição. Bloqueado durante batalha e durante partida de PvP em andamento.

### 8.3 Skills

```ts
interface SkillDef {
  id: Id; name: string;
  kind: 'duel' | 'map' | 'reaction';
  apCost: number;          // 0 = ataque básico
  ppCost?: number;         // reações
  cooldown: number;        // em rounds de MAPA
  multiplier: number;      // escala 1000
  flat: number;
  scalesWith: 'atk'|'def'|'hp';
  duelRange?: number;      // herda da arma se ausente
  effects: EffectApplication[];
  trigger?: ReactionTrigger;
  tags: string[];          // 'physical','magic','pierce','heal','buff','aoe'
}
```

Cooldown em rounds de **mapa**, não de duelo: uma skill forte usada em um duelo fica indisponível pelos próximos duelos daquele round e do seguinte. Mais uma trava contra spam.

---

## 9. PvP (planejar agora, entregar no M7)

Nada pode precisar ser reescrito para ligar o PvP: núcleo determinístico, comandos serializáveis, zero regra no cliente.

### 9.1 Modo 1 — Arena Tática (assíncrona, o modo principal)

- O defensor monta um time de até 5 heróis, posiciona-os em um mapa simétrico pequeno (**9×11**), define o `tacticsScript` de cada um e uma **IA de mapa declarativa** por herói: `aggressive | hold-position | guard-tile | flank | support-nearest`.
- O atacante joga a camada de grid manualmente contra essa defesa. Todos os duelos resolvem automaticamente pelos scripts dos dois lados.
- Servidor executa `simulate()` com o **mesmo pacote `core`**; o cliente simula só para animar. Divergência = bug crítico.
- ELO, temporadas de 14 dias.

### 9.2 Modo 2 — Coliseu (totalmente automático)

Ataque e defesa rodam por IA declarativa. Serve para ranking passivo, recompensa diária e — principalmente — como **motor de balanceamento** (`tools/balance` reusa este modo).

### 9.3 Modo 3 — Tempo real (futuro, não implementar)

Se um dia existir: mesma simulação, lockstep com input delay. A arquitetura de comandos já suporta. **Não desenhe nada dependente de tempo real agora.**

### 9.4 Segurança (aplicar desde o M1)

| Requisito | Implicação |
|---|---|
| Servidor autoritativo | Cliente envia `BattleCommand[]`; servidor simula e devolve o resultado. |
| Zero RNG no cliente | Seed vem do servidor. |
| Estado de conta recalculado | Servidor recalcula stat sheets a partir do inventário no banco; nunca aceita stats do cliente. |
| Versionamento | `rulesVersion` no replay; recusar replays de versão diferente. |
| Anti-replay | Nonce por partida + rate limiting. |

### 9.5 Balanceamento de PvP

- **Cap de CP por tier** de arena.
- Vantagem do atacante existe (ele escolhe os engajamentos), então a defesa recebe: **+1 AP inicial por herói** e o bônus de terreno do mapa. Ajustar via `tools/balance` até o winrate do atacante ficar em **52–58%**.
- `tools/balance` roda ≥10.000 partidas entre composições e emite matriz de winrate **e** um relatório de distribuição de stats das builds vencedoras (para checar o alerta de `spd` da seção 6.7). Nenhum ajuste de número entra sem esse relatório.

---

## 10. Progressão e economia (PvE)

- **Campanha** em capítulos: 6–10 mapas, diálogo, desbloqueio de heróis.
- **Masmorras de farm** com foco definido: Equipamento (drop por set), Experiência, Ouro, Chefe (materiais de promoção). Energia de conta limita o farm diário.
- **Awakening (0–6)**: multiplica a curva base e libera nós avançados de talento a partir de 5.
- **Imprint**: duplicatas viram bônus permanente de stat.
- Moedas: `ouro`, `pedras`, `marcas de arena`. Na loja de PvP venda gear de set específico e cosméticos — **nunca poder bruto**.

---

## 11. UI/UX — requisitos funcionais mínimos

| Tela | Requisitos duros |
|---|---|
| Mapa | Overlay de movimento e de ameaça; **lista de iniciativa sempre visível** com a ordem completa do round; AP/PP de cada unidade legíveis no próprio tile (sem hover). |
| Preview de duelo | Antes de confirmar, rodar `simulateDuel` com a **seed real** e exibir troca a troca: quem age, qual linha do script disparou, dano previsto, HP final, assistências que vão entrar e recursos que serão gastos. **Este é o recurso mais importante do jogo.** |
| Editor de táticas | Drag & drop das linhas, condições em dropdown, e botão **"Testar"** contra um manequim configurável (HP, tipo, arma, PP). |
| Painel de recursos | Visão do exército inteiro: AP/PP de todos, quem pode `rest`, quem está sem PP (vulnerável a Emboscada). |
| Inventário | Filtro por set/slot/substat, comparação lado a lado, **ganho de dano real** (não só CP) ao equipar. |
| Talentos | Grafo, preview do efeito, string de build compartilhável. |
| Replay | Reprodução passo a passo com controle de velocidade a partir do `Replay`. |

Acessibilidade: fonte escalável, modo daltônico nos overlays, e **modo resultado instantâneo** (pula animações) — essencial para farm.

---

## 12. Regras Invioláveis (copiar para `CLAUDE.md`)

1. **`packages/core` não importa nada** além de si mesmo. Sem DOM, `fetch`, `Date`, `Math.random`, nem dependências externas.
2. **Nenhum ponto flutuante** em cálculo de regra. Use os helpers de ponto fixo.
3. **Nenhuma regra no cliente.** O cliente só renderiza o resultado do core.
4. **Nada de conteúdo hardcoded**: classes, skills, itens, mapas, inimigos e números vivem em `packages/data` como JSON validado por Zod.
5. **Todo sistema entra com testes de determinismo** (mesma seed → mesmo hash) antes de entrar com UI.
6. **Não adicione IA "esperta"** ao duelo. O algoritmo da §6.3 é a regra; previsibilidade é o produto.
7. **AP e PP nunca regeneram passivamente.** Qualquer fonte de recuperação é explícita, declarada em dados e visível na UI.
8. **`spd` só concede os três benefícios da §6.7.** Adicionar qualquer outro exige alterar a spec primeiro.
9. **A lista de iniciativa não é recalculada** durante a batalha.
10. **Não mude fórmula ou número de balanceamento** sem rodar `tools/balance` e anexar o relatório.
11. **Toda mudança de regra incrementa `rulesVersion`.**
12. Funções do core são **puras**. Sem mutação in-place fora de um reducer explícito.
13. Decisão de design fora da spec: **pergunte ou registre em `DECISIONS.md`**. Não invente em silêncio.

---

## 13. Roadmap por milestones

### M0 — Fundação
Monorepo, TS strict, Vitest, Zod, CI.
**Aceite:** `pnpm test` e `pnpm validate:data` verdes; CI falha se achar `Math.random` em `core`.

### M1 — Núcleo determinístico
Ponto fixo, PRNG, agregação de stats (§4.1), schemas de herói/classe/skill/item.
**Aceite:** stat sheet de um herói fixo bate com snapshot; 1000 execuções do PRNG com a mesma seed dão sequência idêntica.

### M2 — Duelo headless (o mais importante)
Interpretador de tactics, trocas, AP/PP, reações, assistências, ordem de duelo, fórmula de dano, efeitos.
**Aceite:** `sim-cli duel A.json B.json --seed 42` imprime troca a troca com a linha do script que disparou; mesma seed → hash idêntico; teste cobrindo **cada** variante de `Condition` e cada regra de recurso (limite de 2 AP, contra-ataque sem PP, teto de 2 assistências).

### M3 — Camada de grid
Mapa, terreno, Dijkstra, ZoC, **lista de iniciativa fixa**, ações de turno, `rest`, modificadores posicionais, valor, vitória/derrota.
**Aceite:** batalha completa jogada via `BattleCommand[]` em teste sem UI; replay reproduz estado final idêntico; teste provando que buff de `spd` **não** reordena a iniciativa.

### M4 — Equipamento
Geração, enhance, substats, sets, reforge, CP.
**Aceite:** 100.000 itens gerados respeitam a distribuição de pesos declarada (±2%); enhance com seed fixa é reproduzível.

### M5 — Classes e talentos
Árvores, promoção, choice nodes, patch de skills, builds compartilháveis.
**Aceite:** alocar/resetar altera stat sheet e skills de forma reprodutível; validação rejeita alocação inválida (gate de linha, exclusividade).

### M6 — Cliente jogável
Pixi + React: mapa, movimento, **preview de duelo**, animação, painel de recursos, inventário, árvore, editor de táticas.
**Aceite:** campanha de 3 mapas jogável ponta a ponta; resultado exibido idêntico ao simulado no core.

### M7 — PvP assíncrono
Fastify, Postgres, times de defesa com IA declarativa, matchmaking por CP/ELO, replays.
**Aceite:** resultado do servidor idêntico ao do cliente em 1000 partidas de fuzz; manipulação de stats no cliente é rejeitada.

### M8 — Conteúdo e balanceamento
`tools/balance`, matriz de winrate, relatório de distribuição de stats, temporadas, loja de arena.
**Aceite:** nenhuma composição acima de 65% de winrate global em 10.000 partidas; **e** builds vencedoras não concentram `spd` acima da mediana em mais de 60% dos casos (§6.7).

---

## 14. Prompts sugeridos para o Claude Code

```
Leia SPEC.md e CLAUDE.md. Implemente o M0 exatamente como especificado.
Não implemente nada dos milestones seguintes. Ao terminar, liste os
critérios de aceite e mostre a saída dos testes provando cada um.
```

```
Leia SPEC.md seções 3 e 4. Implemente o M1: math/fixed.ts, rng/ e
stats/aggregate.ts seguindo a ordem de agregação da §4.1 exatamente.
Escreva os testes antes da implementação.
```

```
Leia SPEC.md seção 6 inteira. Implemente o M2. O algoritmo da §6.3 é
normativo — implemente-o literalmente, sem otimizações "inteligentes".
Ordem: interpretador de tactics → trocas e AP/PP → reações → assistências
→ fórmula de dano. Um teste por regra de recurso.
```

```
Leia SPEC.md §5.3 e §6.7. Escreva testes que provem que spd concede
exatamente os três benefícios listados e nenhum outro: um teste que
buffa spd em +500 no meio da batalha e verifica que a lista de
iniciativa não mudou; um que verifica o limiar de 1,15 na preempção;
um que verifica o cap de +150 de evasão.
```

```
Rode tools/balance com 10.000 partidas do Coliseu entre as composições de
data/test-comps/. Gere a matriz de winrate e o relatório de distribuição
de stats. Proponha ajustes apenas em packages/data, nunca em código.
```

---

## 15. Decisões em aberto (registrar em `DECISIONS.md` ao resolver)

- **`MAX_TROCAS = 3`** é um chute inicial. Com 2, o duelo vira "quem bate primeiro"; com 4+, o preview fica ilegível e `spd` volta a dominar. Teste 3 antes de mexer.
- **Limite de 2 AP por duelo:** se na prática ninguém chegar perto do limite, ele é decoração — reduza os pools base em vez de aumentar o limite.
- **Alcance de assistência:** começar em 2 tiles para melee e `duelRange` para ranged. Se assistências dispararem em mais de 70% dos duelos, elas viraram obrigatórias e não decisão — encareça o custo em PP.
- **Duelo ranged unilateral (§6.1):** é forte de propósito. Se arqueiros dominarem, a correção é reduzir o dano deles, não permitir contra-ataque — a assimetria é o que dá identidade tática ao alcance.
- **Permadeath:** sugestão de `classic` como padrão, com `casual` disponível desde o início.
- **Monetização:** fora do escopo. Se houver gacha, ele NÃO toca em `packages/core`.
