import {
  buildBattleSetupFromHeroes,
  buildInitialStateLogged,
  nextUint32,
  seedRng,
  type ArtifactInstance,
  type BattleUnit,
  type EquippedArtifact,
  type Hero,
  type HeroPlacement,
  type Id,
  type ItemInstance,
  type RngState,
  type SoulInstance,
} from '@paths-beyond/core';
import { firstArenaMap, type Composition, type ContentCatalog } from '@paths-beyond/content';

// §9.5 — "a defesa recebe +1 AP inicial por herói e o bônus de terreno do mapa" (o
// bônus de terreno já vem de onde as unidades pisam no mapa; o +1 AP é aplicado aqui,
// fora de packages/core — mesma categoria de decisão de posicionamento específica de
// modo de jogo já tomada em apps/server/src/battle/routes.ts, M7).
const DEFENDER_AP_BONUS = 1;

// Desloca o time defensor pra não colidir com as posições do time atacante — os dois
// comps de um fixture usam as mesmas coordenadas pequenas (0,0)/(0,1) porque cada
// composição é autocontida e não sabe contra quem vai lutar.
const DEFENDER_POSITION_OFFSET_X = 6;

export interface BattleOutcomeRecord {
  readonly attackerCompId: Id;
  readonly defenderCompId: Id;
  // Exposta pra reproduzir uma batalha específica fora do torneio (debug) e pra testar
  // a geração de seed diretamente, sem depender de o resultado do combate variar (com
  // composições muito desiguais, o vencedor pode ser o mesmo em toda seed, mesmo com
  // rolagens de dano diferentes por baixo).
  readonly seed: number;
  readonly outcome: 'victory' | 'defeat' | 'ongoing';
  readonly winningCompId: Id | null;
  readonly winningUnitsSpd: readonly number[];
  readonly allUnitsSpd: readonly number[];
  // §6.5 — quantas assistências foram APLICADAS nesta batalha, somando os dois lados de cada
  // duelo. A assistência é a mecânica que substituiu o esquadrão do Unicorn Overlord quando o
  // design trocou para heróis individuais; enquanto as comps tinham 1 unidade cada, ela não
  // podia disparar em partida nenhuma, e o torneio media um jogo mais simples que o real.
  // Contar é o que transforma "agora deve disparar" em número.
  readonly assists: number;
}

// M8, sub-sessão 3/N: `hero.equipment` (6 slots, ids ou null) passa a ser resolvido de
// verdade em `ItemInstance[]` a partir do catálogo carregado por `loadCatalogFromDisk()` —
// antes, `equippedItems` era sempre `[]`, então nenhum item jamais entrava na conta do
// torneio, mesmo quando um comp referenciava um item de verdade em `hero.equipment`.
function resolveEquippedItems(hero: Hero, content: ContentCatalog, compId: Id): readonly ItemInstance[] {
  const equipped: ItemInstance[] = [];
  for (const itemId of Object.values(hero.equipment)) {
    if (itemId === null) continue;
    const item = content.items[itemId];
    if (!item) throw new Error(`item desconhecido: ${itemId} (herói ${hero.id}, composição ${compId})`);
    equipped.push(item);
  }
  return equipped;
}

// M38 5/N — o TIER em que o artefato entra na medição. A decisão do usuário é awakening 3,
// imprint 0: o mínimo em que todo artefato fica no rank corrente Hero (D53 item 7).
export interface ArtifactTier {
  readonly awakening: ArtifactInstance['awakening'];
  readonly imprint: ArtifactInstance['imprint'];
}

// O artefato que a unidade DECLARA na comp (`artifactId`, da classe dela), numa instância
// sintética no tier da medição. Sem `artifactId`, a medição COM artefato falha alto: uma
// unidade sem artefato no meio de um time com artefato mediria um time misturado em silêncio.
function artefatoDaUnidade(unit: Composition['units'][number], content: ContentCatalog, compId: Id, tier: ArtifactTier): EquippedArtifact {
  if (!unit.artifactId) throw new Error(`a unidade ${unit.hero.id} (composição ${compId}) não declara artefato`);
  const def = content.artifacts[unit.artifactId];
  if (!def) throw new Error(`artefato desconhecido: ${unit.artifactId} (composição ${compId})`);
  return {
    def,
    instance: { id: `${unit.hero.id}-artefato`, artifactId: def.id, awakening: tier.awakening, imprint: tier.imprint },
  };
}

// M39 6/N — A SOUL DA MEDIÇÃO (decisão do usuário, 2026-09-28): a MEDIANA determinística, sem
// sorte de craft. Uma opção de mainstat do personagem e os dois substats de maior peso da tabela
// da Soul (fora o stat do mainstat; empate fica com a ordem da tabela), todos no ponto médio da
// faixa. É o equivalente do tier fixo do artefato. Personagem sem Soul no catálogo falha alto:
// uma unidade sem Soul num time com Soul mediria um time misturado em silêncio.
//
// D63, fechamento (decisão do usuário): a medição passa por TODAS as opções com peso igual — a
// partida i usa a opção `i mod n` — em vez de só a primeira, cuja ordem no dado não foi escolhida
// para medir e enviesava a matriz.
const SUBSTATS_DA_SOUL = 2;
const meio = (faixa: { readonly min: number; readonly max: number }) => Math.trunc((faixa.min + faixa.max) / 2);

export function soulMediana(characterId: Id, content: ContentCatalog, unitId: Id, opcaoIndex = 0): SoulInstance {
  const def = content.characterSouls[characterId];
  if (!def) throw new Error(`personagem sem Soul no catálogo: ${characterId}`);
  const regras = content.economyRules.soul;
  if (!regras) throw new Error('o catálogo não declara as regras da Soul (economy.json, bloco `soul`)');
  const opcao = def.mainstatOptions[opcaoIndex % def.mainstatOptions.length];
  if (!opcao) throw new Error(`a Soul de ${characterId} não declara opção de mainstat`);
  const substats = regras.substats
    .map((entrada, ordem) => ({ entrada, ordem }))
    .filter(({ entrada }) => entrada.stat !== opcao.stat)
    .sort((a, b) => b.entrada.weight - a.entrada.weight || a.ordem - b.ordem)
    .slice(0, SUBSTATS_DA_SOUL)
    .map(({ entrada }) => ({ stat: entrada.stat, value: meio(entrada.valueRange) }));
  return {
    id: `${unitId}-soul`,
    soulOf: characterId,
    mainstat: { stat: opcao.stat, value: meio(opcao.valueRange) },
    substats,
    crafts: 1,
  };
}

// M39 6/N — o que muda na medição além do artefato. `souls`: toda unidade leva a Soul mediana
// do seu personagem. `nivel`: o nível de TODA unidade na medição, sobrescrito aqui e não no JSON
// das comps (a base do nível 10 continua reproduzível). A trava de nível da Soul não entra: a
// medição monta a batalha direto pelo core, sem `equipSoul`.
export interface ExtrasDaMedicao {
  readonly souls?: boolean;
  readonly nivel?: number;
  // Qual opção de mainstat a Soul mediana usa (módulo o número de opções do personagem).
  readonly opcaoDaSoul?: number;
}

export function toPlacements(
  comp: Composition,
  content: ContentCatalog,
  side: 'player' | 'enemy',
  positionOffsetX: number,
  artefatos?: ArtifactTier,
  // M38 5/N — no ESPELHO (a comp contra ela mesma, no delta do artefato), os dois lados teriam
  // os mesmos ids de unidade e de herói, e o motor os trataria como a mesma peça. O sufixo
  // separa o lado espelhado; fora do espelho ele é vazio e nada muda.
  unitIdSuffix = '',
  extras: ExtrasDaMedicao = {},
): HeroPlacement[] {
  return comp.units.map((unit): HeroPlacement => {
    const classDef = content.classes[unit.hero.classId];
    if (!classDef) throw new Error(`classe desconhecida: ${unit.hero.classId} (composição ${comp.id})`);
    const unitId = `${unit.hero.id}${unitIdSuffix}`;
    const hero = {
      ...unit.hero,
      ...(unitIdSuffix ? { id: unitId } : {}),
      ...(extras.nivel !== undefined ? { level: extras.nivel } : {}),
    };
    const characterId = unit.hero.characterId;
    if (extras.souls && !characterId) {
      throw new Error(`a unidade ${unit.hero.id} (composição ${comp.id}) não é personagem e não tem Soul`);
    }
    return {
      unitId,
      hero,
      classDef,
      equippedItems: resolveEquippedItems(unit.hero, content, comp.id),
      ...(artefatos ? { artifact: artefatoDaUnidade(unit, content, comp.id, artefatos) } : {}),
      ...(extras.souls && characterId ? { soul: soulMediana(characterId, content, unitId, extras.opcaoDaSoul ?? 0) } : {}),
      side,
      pos: { x: unit.pos.x + positionOffsetX, y: unit.pos.y },
      height: unit.height,
      aiArchetype: unit.aiArchetype,
    };
  });
}

const extrasDoNivel = (nivel: number | undefined) => (nivel !== undefined ? { nivel } : {});

function applyDefenderBonus(units: readonly BattleUnit[]): readonly BattleUnit[] {
  return units.map((unit) => (unit.side === 'enemy' ? { ...unit, ap: unit.ap + DEFENDER_AP_BONUS } : unit));
}

// Modo 2/Coliseu (§9.2): os dois lados são 100% IA — a batalha inteira resolve dentro de
// `buildInitialState`, via `resolveAiTurns` (M7, sub-sessão 6). Nenhum comando precisa ser
// submetido, e é por isso que `simulate()` com `commands: []` fazia o trabalho até aqui.
//
// A variante COM RELATO (`buildInitialStateLogged`) é usada em vez de `simulate` por um motivo
// só: contar assistências. Como tudo acontece dentro da construção do estado inicial, o laço de
// `simulate` nunca roda e não há um único `DuelResult` observável do lado de fora. O estado
// devolvido é o mesmo — `simulate` com `commands: []` é literalmente `buildInitialState` mais a
// montagem do `BattleResult`, e os campos usados aqui (`outcome`, unidades finais) saem
// igualmente do estado. Travado por teste em `packages/core`.
function runOneBattle(
  attacker: Composition,
  defender: Composition,
  content: ContentCatalog,
  seed: number,
  artefatos: { readonly atacante?: ArtifactTier; readonly defensor?: ArtifactTier } = {},
  // M39 6/N — a Soul por LADO (o delta a põe de um lado só) e o nível, que vale para os dois.
  extras: { readonly soulsAtacante?: boolean; readonly soulsDefensor?: boolean; readonly nivel?: number; readonly opcaoDaSoul?: number } = {},
): BattleOutcomeRecord {
  const espelho = attacker.id === defender.id ? '-espelho' : '';
  const comum = { ...extrasDoNivel(extras.nivel), opcaoDaSoul: extras.opcaoDaSoul ?? 0 };
  const attackerPlacements = toPlacements(attacker, content, 'player', 0, artefatos.atacante, '', {
    ...comum,
    souls: extras.soulsAtacante ?? false,
  });
  const defenderPlacements = toPlacements(
    defender,
    content,
    'enemy',
    DEFENDER_POSITION_OFFSET_X,
    artefatos.defensor,
    espelho,
    { ...comum, souls: extras.soulsDefensor ?? false },
  );
  // Coliseu (§9.2) só conhece uma arena — ver `firstArenaMap` em `@paths-beyond/content`
  // pra saber por que "o primeiro mapa carregado" ainda é seguro nesta sub-sessão.
  const map = firstArenaMap(content);

  const setup = buildBattleSetupFromHeroes({
    placements: [...attackerPlacements, ...defenderPlacements],
    map: map.grid,
    permadeath: 'classic',
    winCondition: map.winCondition,
    effectDefs: content.effects,
    initialValor: map.initialValor,
    itemSets: content.itemSets,
    skillsCatalog: content.skills,
    weaponDuelRanges: content.weaponDuelRanges,
    baselineReactionSkillIds: content.baselineReactionSkillIds,
    // §8.1 (M17, 2/N) — as comps da arena deixaram de ser sintéticas e passaram a ser
    // heróis do ELENCO (D6), então cada `hero.characterId` só resolve talento com a
    // árvore dele em mãos. Sem este repasse o torneio mediria o roster real com zero
    // talento alocado, que é justamente a medição que D6 mandou refazer.
    characterTalentTrees: content.characterTalentTrees,
  });

  const buffedSetup = { ...setup, units: applyDefenderBonus(setup.units) };

  const { state, steps } = buildInitialStateLogged(buffedSetup, seed);

  let assists = 0;
  for (const step of steps) {
    const duel = step.duelResult;
    if (!duel) continue;
    assists += duel.attackerAssists.length + duel.defenderAssists.length;
  }

  const winningSide = state.outcome === 'victory' ? 'player' : state.outcome === 'defeat' ? 'enemy' : null;
  const winningCompId = winningSide === 'player' ? attacker.id : winningSide === 'enemy' ? defender.id : null;

  return {
    attackerCompId: attacker.id,
    defenderCompId: defender.id,
    seed,
    outcome: state.outcome,
    winningCompId,
    winningUnitsSpd: winningSide ? state.units.filter((u) => u.side === winningSide).map((u) => u.stats.spd) : [],
    allUnitsSpd: state.units.map((u) => u.stats.spd),
    assists,
  };
}

export interface RunTournamentOptions {
  readonly runsPerPairing: number;
  readonly masterSeed: number;
  // M38 5/N — presente, TODA unidade dos dois lados leva o artefato declarado neste tier.
  // Ausente, o torneio é o de sempre.
  readonly artefatos?: ArtifactTier;
  // M39 6/N — presentes, TODA unidade dos dois lados leva a Soul mediana / fica neste nível.
  readonly souls?: boolean;
  readonly nivel?: number;
}

// PRNG só pra gerar seeds distintas de batalha — não é RNG de regra (isso continua
// sendo `rngFor` dentro de `simulate()`). Reusa `seedRng`/`nextUint32` do core em vez
// de `Math.random`, pra o torneio inteiro ser reproduzível a partir de um masterSeed.
function nextBattleSeed(state: RngState): { seed: number; state: RngState } {
  const result = nextUint32(state);
  return { seed: result.value, state: result.state };
}

// Roda `runsPerPairing` batalhas pra cada par ORDENADO de composições distintas
// (A ataca B, B ataca A são pareamentos diferentes — a vantagem do atacante em
// escolher o engajamento, §9.5, é assimétrica por natureza).
export function runTournament(content: ContentCatalog, options: RunTournamentOptions): readonly BattleOutcomeRecord[] {
  const records: BattleOutcomeRecord[] = [];
  let rngState = seedRng(options.masterSeed);

  for (const attacker of content.comps) {
    for (const defender of content.comps) {
      if (attacker.id === defender.id) continue;

      for (let i = 0; i < options.runsPerPairing; i++) {
        const picked = nextBattleSeed(rngState);
        rngState = picked.state;
        records.push(
          runOneBattle(
            attacker,
            defender,
            content,
            picked.seed,
            { atacante: options.artefatos, defensor: options.artefatos },
            { soulsAtacante: options.souls ?? false, soulsDefensor: options.souls ?? false, ...extrasDoNivel(options.nivel), opcaoDaSoul: i },
          ),
        );
      }
    }
  }

  return records;
}

// M38 5/N — O DELTA DO ARTEFATO: cada comp com artefato contra ELA MESMA sem. É o número que
// responde "sidegrade ou upgrade?" (roadmap do M38): no espelho, tudo é igual menos o artefato,
// então 50% seria sidegrade puro e o quanto passa de 50% é o poder que o artefato compra.
//
// Os dois lados do mapa separados, porque o defensor tem +1 AP e o terreno (§9.5): medir só
// um confundiria a vantagem do artefato com a do lado.
export interface ArtifactDeltaSide {
  readonly vitoriasComArtefato: number;
  readonly vitoriasSemArtefato: number;
  readonly total: number;
}

export interface ArtifactDeltaRow {
  readonly compId: Id;
  // A comp COM artefato atacando a mesma comp SEM.
  readonly comoAtacante: ArtifactDeltaSide;
  // A comp COM artefato defendendo contra a mesma comp SEM.
  readonly comoDefensor: ArtifactDeltaSide;
}

export interface RunArtifactDeltaOptions {
  readonly runsPerPairing: number;
  readonly masterSeed: number;
  readonly artefatos: ArtifactTier;
}

export function runArtifactDelta(content: ContentCatalog, options: RunArtifactDeltaOptions): readonly ArtifactDeltaRow[] {
  let rngState = seedRng(options.masterSeed);
  const rows: ArtifactDeltaRow[] = [];

  for (const comp of content.comps) {
    const lado = (comArtefatoAtacando: boolean): ArtifactDeltaSide => {
      let com = 0;
      let sem = 0;
      for (let i = 0; i < options.runsPerPairing; i++) {
        const picked = nextBattleSeed(rngState);
        rngState = picked.state;
        const record = runOneBattle(
          comp,
          comp,
          content,
          picked.seed,
          comArtefatoAtacando ? { atacante: options.artefatos } : { defensor: options.artefatos },
        );
        // A comp é a mesma dos dois lados: quem venceu se lê pelo LADO, não pelo id.
        if (record.outcome === 'victory') comArtefatoAtacando ? com++ : sem++;
        else if (record.outcome === 'defeat') comArtefatoAtacando ? sem++ : com++;
      }
      return { vitoriasComArtefato: com, vitoriasSemArtefato: sem, total: options.runsPerPairing };
    };

    rows.push({ compId: comp.id, comoAtacante: lado(true), comoDefensor: lado(false) });
  }

  return rows;
}

// M39 6/N — O DELTA DA SOUL: cada comp com Soul contra ELA MESMA sem, no molde do delta do
// artefato. Os dois lados levam o mesmo artefato (quando pedido) e ficam no mesmo nível; a única
// diferença é a Soul. 50% seria Soul sem efeito; o quanto passa disso é o poder que ela compra.
export interface SoulDeltaSide {
  readonly vitoriasComSoul: number;
  readonly vitoriasSemSoul: number;
  readonly total: number;
}

export interface SoulDeltaRow {
  readonly compId: Id;
  readonly comoAtacante: SoulDeltaSide;
  readonly comoDefensor: SoulDeltaSide;
}

export interface RunSoulDeltaOptions {
  readonly runsPerPairing: number;
  readonly masterSeed: number;
  readonly artefatos?: ArtifactTier;
  readonly nivel?: number;
}

export function runSoulDelta(content: ContentCatalog, options: RunSoulDeltaOptions): readonly SoulDeltaRow[] {
  let rngState = seedRng(options.masterSeed);
  const rows: SoulDeltaRow[] = [];

  for (const comp of content.comps) {
    const lado = (comSoulAtacando: boolean): SoulDeltaSide => {
      let com = 0;
      let sem = 0;
      for (let i = 0; i < options.runsPerPairing; i++) {
        const picked = nextBattleSeed(rngState);
        rngState = picked.state;
        const record = runOneBattle(
          comp,
          comp,
          content,
          picked.seed,
          { atacante: options.artefatos, defensor: options.artefatos },
          { soulsAtacante: comSoulAtacando, soulsDefensor: !comSoulAtacando, ...extrasDoNivel(options.nivel), opcaoDaSoul: i },
        );
        // A comp é a mesma dos dois lados: quem venceu se lê pelo LADO, não pelo id.
        if (record.outcome === 'victory') comSoulAtacando ? com++ : sem++;
        else if (record.outcome === 'defeat') comSoulAtacando ? sem++ : com++;
      }
      return { vitoriasComSoul: com, vitoriasSemSoul: sem, total: options.runsPerPairing };
    };

    rows.push({ compId: comp.id, comoAtacante: lado(true), comoDefensor: lado(false) });
  }

  return rows;
}
