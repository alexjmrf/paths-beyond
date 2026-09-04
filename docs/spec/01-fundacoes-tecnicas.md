<!-- Stack, determinismo, ponto fixo, RNG, comandos -->
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
| Shell desktop (M21+) | **Electron** | Ver abaixo: a escolha é sobre ENGINE, não sobre tamanho de download. |

**Não usar** engine pesada (Unity/Godot). O risco do projeto é a simulação determinística e o volume de dados, não a renderização.

**A plataforma alvo é desktop — Steam, Epic e possivelmente launcher próprio. Não há build web.**
Isso não invalida nenhuma linha da tabela acima: o argumento delas nunca foi distribuição, foi que
o risco do projeto é simulação determinística e volume de dados. O que muda é que o empacotamento
deixa de ser implícito.

### Electron e não Tauri — o argumento, e não só o resultado

A decisão é sobre **qual engine de JavaScript roda na máquina do jogador**, e ela importa aqui mais
do que importaria em quase qualquer outro projeto:

- O servidor roda **Node (V8)** e **re-simula todo replay** (§9.4). Cliente e servidor comparando
  hash só é seguro se comparam na mesma engine.
- **Electron embute Chromium (V8)**, numa versão que nós congelamos e atualizamos quando quisermos.
  A engine do jogador é a engine que testamos.
- **Tauri usa a webview do SISTEMA**: WebView2/V8 no Windows, mas **JavaScriptCore no macOS e no
  Linux/Steam Deck**. Isso reintroduz em produção, a cada batalha, exatamente a divergência de
  runtime que a aritmética de ponto fixo (§3.2) e o job `determinismo-navegadores` existem para
  eliminar.
- O job de CI prova que o core aguenta três engines, então a divergência **não é fatal** — mas o
  modo de falha, quando vier, chega como *"ganhei e o servidor disse que perdi, e gastou minha
  energia"*, que é o pior formato possível para um bug de simulação.
- O preço do Electron é ~130 MB de download. Numa loja de desktop isso é irrelevante, e é o preço
  de eliminar uma classe inteira de bug.

**O que este argumento NÃO diz:** que Tauri é ruim. Ele é a escolha melhor para quase todo app que
não compara hash de simulação entre máquina do jogador e servidor. Este compara.

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
