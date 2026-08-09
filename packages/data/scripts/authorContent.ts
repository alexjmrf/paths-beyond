import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import classSchema from '../schemas/classes.schema.js';
import compSchema from '../schemas/comps.schema.js';
import itemSchema from '../schemas/items.schema.js';
import itemSetSchema from '../schemas/item-sets.schema.js';
import skillSchema from '../schemas/skills.schema.js';

// M8, sub-sessão 2/N — conteúdo real balanceado. Ver DECISIONS.md pro roster completo
// e o raciocínio por trás do template de árvore de talentos.
//
// Escrever 60 níveis × 13 stats à mão × 7 classes seria ~5460 números digitados — este
// gerador aplica uma fórmula linear (mesmo padrão observado nos fixtures de M1:
// `class-soldado`/`class-cavaleiro`, hp/atk/def lineares por nível, spd em degraus de 5
// níveis) a partir de um `ClassProfile` compacto. O gerador é ferramenta de autoria, não
// parte do motor: roda uma vez, o JSON emitido é o conteúdo canônico versionado.

export type StatKey = 'hp' | 'atk' | 'def' | 'spd';
export type PartialStatSheet = Partial<Record<StatKey, number>>;
export type WeaponTag = 'physical' | 'magic';

export interface ClassProfile {
  readonly slug: string; // usado em ids: class-{slug}, skill-ataque-{slug}, etc.
  readonly name: string;
  readonly weaponType: 'sword' | 'axe' | 'spear' | 'bow' | 'arcane' | 'nature' | 'holy';
  readonly unitType: 'infantry' | 'caster' | 'flying' | 'armored';
  readonly moveType: 'foot' | 'flying' | 'heavy';
  readonly moveRange: number;
  readonly tag: WeaponTag;
  readonly basePools: { readonly ap: number; readonly pp: number };
  readonly hpBase: number;
  readonly atkBase: number;
  readonly defBase: number;
  readonly spdBase: number;
  readonly hpPerLevel: number;
  readonly atkPerLevel: number;
  readonly defPerLevel: number;
  readonly signatureMultiplier: number;
}

// Mesmo perfil de crescimento de spd observado em class-soldado.json (M1): degraus de
// +1 a cada 5 níveis (`floor(level/5)`), não uma reta contínua.
const SPD_STEP_EVERY_LEVELS = 5;
const LEVEL_COUNT = 60;

export function generateStatCurve(profile: ClassProfile): PartialStatSheet[] {
  const curve: PartialStatSheet[] = [];
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    curve.push({
      hp: profile.hpBase + (level - 1) * profile.hpPerLevel,
      atk: profile.atkBase + (level - 1) * profile.atkPerLevel,
      def: profile.defBase + (level - 1) * profile.defPerLevel,
      spd: profile.spdBase + Math.floor(level / SPD_STEP_EVERY_LEVELS),
    });
  }
  return curve;
}

// Mesma progressão padrão usada em class-soldado.json/class-cavaleiro.json (M1) — não é
// alavanca de balanceamento diferenciada por classe nesta fatia.
const STANDARD_AWAKENING_MULTIPLIERS = [1000, 1050, 1100, 1150, 1200, 1250, 1300] as const;
const STANDARD_IMPRINT_FLAT = [[], [{ stat: 'hp', flat: 20 }], [{ stat: 'hp', flat: 40 }], [{ stat: 'hp', flat: 60 }], [{ stat: 'hp', flat: 80 }], [{ stat: 'hp', flat: 100 }]] as const;

export function basicSkillId(profile: ClassProfile): string {
  return `skill-ataque-${profile.slug}`;
}

export function signatureSkillId(profile: ClassProfile): string {
  return `skill-especial-${profile.slug}`;
}

export function generateBasicSkill(profile: ClassProfile) {
  return {
    id: basicSkillId(profile),
    name: `Ataque Básico (${profile.name})`,
    kind: 'duel' as const,
    apCost: 0,
    cooldown: 0,
    multiplier: 1000,
    flat: 0,
    scalesWith: 'atk' as const,
    tags: [profile.tag],
  };
}

export function generateSignatureSkill(profile: ClassProfile) {
  return {
    id: signatureSkillId(profile),
    name: `Golpe Especial (${profile.name})`,
    kind: 'duel' as const,
    apCost: 1,
    cooldown: 2,
    multiplier: profile.signatureMultiplier,
    flat: 0,
    scalesWith: 'atk' as const,
    tags: [profile.tag],
  };
}

// §6.4 — "Reações padrão que TODA unidade tem: Contra-atacar (1 PP), Defender (1 PP,
// -40% de dano na troca)." Estas duas, e só estas, são `baseline: true`. Estavam em
// `packages/data/skills/` desde M8 sub-sessão 2 escritas à mão; passam pelo gerador a
// partir de M10 sub-sessão 4/N pra o campo `baseline` ficar num lugar só.
// A convenção `multiplier: 0 && flat: 0` = Defender é lida por `resolveDuel` (M2).
export const BASELINE_REACTIONS = [
  {
    id: 'skill-contra-atacar',
    name: 'Contra-atacar',
    kind: 'reaction' as const,
    apCost: 0,
    ppCost: 1,
    cooldown: 0,
    multiplier: 800,
    flat: 0,
    scalesWith: 'atk' as const,
    trigger: 'onAttacked' as const,
    baseline: true,
    tags: [],
  },
  {
    id: 'skill-defender',
    name: 'Defender',
    kind: 'reaction' as const,
    apCost: 0,
    ppCost: 1,
    cooldown: 0,
    multiplier: 0,
    flat: 0,
    scalesWith: 'atk' as const,
    trigger: 'onAttacked' as const,
    baseline: true,
    tags: [],
  },
];

// §6.5 — a assistência que "substitui o esquadrão": um aliado dentro do assistRange
// gasta 1 PP e executa "uma ação reduzida: 50% do dano da skill". Os 50% são aplicados
// pelo motor (`ASSIST_DAMAGE_MULTIPLIER`, M10 sub-sessão 2), então o `multiplier` aqui é
// o da skill cheia — 1000 (mesmo do ataque básico), de forma que uma assistência entregue
// exatamente metade de um ataque normal, sem número novo escondido no meio.
// NÃO é baseline: §6.4 lista só Contra-atacar/Defender como universais, e assistir é
// justamente a recompensa por investir em posicionamento (talento de row 7, abaixo).
export const SKILL_ASSISTIR = {
  id: 'skill-assistir',
  name: 'Assistir',
  kind: 'reaction' as const,
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 1000,
  flat: 0,
  scalesWith: 'atk' as const,
  trigger: 'onAllyEngagedNearby' as const,
  tags: [],
};

// §8.2 — regras de design da árvore aplicadas por um template comum a todas as 7
// classes desta fatia (só varia id/nome/números por perfil):
//   - 8 linhas, 11 nós no total.
//   - 3 linhas de escolha (rows 1/4/7, 2 nós exclusiveWith cada) que mudam o papel do
//     herói de verdade — row 4 é literalmente o exemplo dado pela spec ("contra-atacar
//     custa 0 PP, mas perde 1 AP máximo" vs. "ataque de assinatura aplica um debuff").
//   - 2 nós que tocam a economia de AP/PP/assistência isoladamente (rows 2 e 5); as
//     duas opções da row 7 também tocam economia, então o mínimo de 2 é folgado.
//   - 2 nós de preenchimento (+2% stat, rows 3 e 6) = 2/11 ≈ 18% ≤ 30%.
// `tree` default 'class' cobre as classes base desta fatia; a classe promovida (M8,
// sub-sessão 4/N) passa 'spec' — mesmo template estrutural, só a etiqueta muda (§8.2: a
// árvore de Especialização segue as mesmas 4 regras de design da árvore de Classe).
export function generateTalentTree(profile: ClassProfile, tree: 'class' | 'spec' = 'class') {
  const s = profile.slug;
  const sigId = signatureSkillId(profile);

  return [
    {
      id: `talent-${s}-agressivo`,
      tree,
      row: 1,
      maxRank: 1 as const,
      exclusiveWith: [`talent-${s}-defensivo`],
      effects: [
        { t: 'stat' as const, stat: 'atk' as const, pct: 50 },
        { t: 'stat' as const, stat: 'def' as const, pct: -30 },
      ],
    },
    {
      id: `talent-${s}-defensivo`,
      tree,
      row: 1,
      maxRank: 1 as const,
      exclusiveWith: [`talent-${s}-agressivo`],
      effects: [
        { t: 'stat' as const, stat: 'def' as const, pct: 50 },
        { t: 'stat' as const, stat: 'atk' as const, pct: -30 },
      ],
    },
    {
      id: `talent-${s}-vigor-extra`,
      tree,
      row: 2,
      maxRank: 1 as const,
      effects: [{ t: 'maxPp' as const, n: 1 }],
    },
    {
      id: `talent-${s}-robustez`,
      tree,
      row: 3,
      maxRank: 2 as const,
      effects: [{ t: 'stat' as const, stat: 'hp' as const, pct: 20 }],
    },
    {
      id: `talent-${s}-contra-simples`,
      tree,
      row: 4,
      maxRank: 1 as const,
      exclusiveWith: [`talent-${s}-golpe-fragilizante`],
      effects: [
        { t: 'modifySkill' as const, skillId: 'skill-contra-atacar', patch: { ppCost: 0 } },
        { t: 'maxAp' as const, n: -1 },
      ],
    },
    {
      id: `talent-${s}-golpe-fragilizante`,
      tree,
      row: 4,
      maxRank: 1 as const,
      exclusiveWith: [`talent-${s}-contra-simples`],
      effects: [
        {
          t: 'modifySkill' as const,
          skillId: sigId,
          patch: { effects: [{ effectId: 'effect-fragilidade', target: 'target', chance: 500, duration: 'duel' }] },
        },
      ],
    },
    {
      id: `talent-${s}-recuperacao-de-vitoria`,
      tree,
      row: 5,
      maxRank: 1 as const,
      effects: [{ t: 'apRefund' as const, on: 'duelWon' as const, n: 1 }],
    },
    {
      id: `talent-${s}-fortalecimento`,
      tree,
      row: 6,
      maxRank: 2 as const,
      effects: [{ t: 'stat' as const, stat: 'atk' as const, pct: 20 }],
    },
    {
      id: `talent-${s}-foco-em-equipe`,
      tree,
      row: 7,
      maxRank: 1 as const,
      exclusiveWith: [`talent-${s}-foco-solo`],
      effects: [
        // §6.5 — assistir é a recompensa por investir em posicionamento, não algo que
        // toda unidade tem de graça (§6.4 fecha a lista de universais em 2). Fica no
        // MESMO nó que já dava +1 de assistRange, e continua exclusivo com `foco-solo`:
        // a escolha da row 7 é literalmente "jogo em time vs. jogo sozinho".
        { t: 'grantReaction' as const, reactionId: SKILL_ASSISTIR.id },
        { t: 'assistRangeBonus' as const, n: 1 },
        { t: 'extraTacticsCondition' as const },
      ],
    },
    {
      id: `talent-${s}-foco-solo`,
      tree,
      row: 7,
      maxRank: 1 as const,
      exclusiveWith: [`talent-${s}-foco-em-equipe`],
      effects: [
        { t: 'stat' as const, stat: 'atk' as const, flat: 40 },
        { t: 'duelApCap' as const, n: 1 },
      ],
    },
    {
      id: `talent-${s}-maestria`,
      tree,
      row: 8,
      maxRank: 1 as const,
      effects: [{ t: 'passive' as const, passiveId: `passive-${s}-maestria` }],
    },
  ];
}

export function generateClass(profile: ClassProfile) {
  return {
    id: `class-${profile.slug}`,
    name: profile.name,
    tier: 'base' as const,
    unitType: profile.unitType,
    moveType: profile.moveType,
    moveRange: profile.moveRange,
    allowedWeapons: [profile.weaponType],
    basePools: profile.basePools,
    statCurve: generateStatCurve(profile),
    awakeningMultipliers: [...STANDARD_AWAKENING_MULTIPLIERS],
    promotionFlat: [],
    imprintFlat: STANDARD_IMPRINT_FLAT.map((entry) => entry.map((mod) => ({ ...mod }))),
    talentTree: generateTalentTree(profile),
  };
}

// M8, sub-sessão 3/N — itens reais equipados de verdade nos comps (antes,
// `tools/balance` ignorava equipamento por completo: `equipment` era sempre `null` em
// todos os slots). Autorados diretamente como `ItemInstance` (não pela pipeline
// procedural de `generateItem`, packages/core/src/items/generate.ts): usar essa pipeline
// exigiria `packages/data` passar a depender de `@paths-beyond/core`, uma dependência
// cruzada nova que nenhum outro schema/conteúdo de `packages/data` tem hoje (só
// `tools/balance`, um consumidor externo, depende dos dois) — pra um punhado de itens
// fixos, isso seria uma mudança de arquitetura maior do que o conteúdo justifica.
// `ilvl:58` (mínimo do schema) e `rarity:'common'`, com valores de mainstat/substat
// modestos (heróis nível 10 têm atk~90/hp~600/def~40 sem equipamento; um item ilvl
// 58-100 "cru" da pipeline de geração seria endgame e sobrepujaria isso).
const SET_FORCA_ID = 'set-forca';
const SET_GUARDIAO_ID = 'set-guardiao';

function setIdFor(profile: ClassProfile): string {
  return profile.tag === 'physical' ? SET_FORCA_ID : SET_GUARDIAO_ID;
}

export function weaponItemId(profile: ClassProfile): string {
  return `item-arma-${profile.slug}`;
}

export function generateWeaponItem(profile: ClassProfile) {
  return {
    id: weaponItemId(profile),
    setId: setIdFor(profile),
    slot: 'weapon' as const,
    rarity: 'common' as const,
    ilvl: 58,
    mainstat: { stat: 'atk' as const, value: 18 },
    substats: [
      { stat: 'spd' as const, value: 6, rolls: 1 },
      { stat: 'def' as const, value: 8, rolls: 1 },
    ],
    enhance: 0,
    reforged: false,
  };
}

// Peça compartilhada (2ª peça de set) — toda classe `physical` equipa a mesma
// `item-colar-forca`, toda classe `magic` equipa a mesma `item-colar-guardiao`, então as
// 7 classes ganham exatamente 2 peças do mesmo set (arma + colar) e o bônus de 2 peças
// dispara igualmente pras 7 — nenhuma vantagem relativa entre elas, só eleva o piso.
const NECKLACE_FORCA = {
  id: 'item-colar-forca',
  setId: SET_FORCA_ID,
  slot: 'necklace' as const,
  rarity: 'common' as const,
  ilvl: 58,
  mainstat: { stat: 'hp' as const, value: 40 },
  substats: [
    { stat: 'atk' as const, value: 5, rolls: 1 },
    { stat: 'spd' as const, value: 4, rolls: 1 },
  ],
  enhance: 0,
  reforged: false,
};

const NECKLACE_GUARDIAO = {
  id: 'item-colar-guardiao',
  setId: SET_GUARDIAO_ID,
  slot: 'necklace' as const,
  rarity: 'common' as const,
  ilvl: 58,
  mainstat: { stat: 'def' as const, value: 15 },
  substats: [
    { stat: 'hp' as const, value: 30, rolls: 1 },
    { stat: 'spd' as const, value: 4, rolls: 1 },
  ],
  enhance: 0,
  reforged: false,
};

export const SHARED_ITEMS = [NECKLACE_FORCA, NECKLACE_GUARDIAO];

// §7.4 (M10, sub-sessão 6/N) — os 4 sets cujo bônus de 4 peças MUDA COMPORTAMENTO em vez
// de dar stat ("Os três sets em negrito atacam diretamente a economia de recursos — são o
// que dá identidade ao sistema e o principal contrapeso a builds de `spd`"). O `effectId`
// não é conteúdo livre: é o id canônico que o motor reconhece, declarado em
// `packages/core/src/items/sets.ts`. As strings estão repetidas aqui porque
// `packages/data` não depende de `@paths-beyond/core` (mesmo espelhamento de
// `ItemSet`/`EffectDef`); `packages/data/tests/authorContent.test.ts` trava os valores.
//
// Corte de escopo consciente desta fatia (decisão do usuário): os sets existem como
// conteúdo válido mas NENHUM comp de balanceamento os equipa, então `pnpm balance` sai
// numericamente idêntico à sub-sessão 4. Equipá-los é um ciclo de rebalanceamento
// próprio — a sub-sessão 4 mostrou que mexer no equipamento dos comps quebra o teto de
// 65% de M8.
export const SPECIAL_ITEM_SETS = [
  {
    id: 'set-duelista',
    name: 'Duelista',
    effects: [
      {
        t: 'special' as const,
        pieces: 4 as const,
        effectId: 'set-special:duelista-contra-atacar-livre-troca-1',
        description: 'Contra-atacar custa 0 PP na primeira troca.',
      },
    ],
  },
  {
    id: 'set-reserva',
    name: 'Reserva',
    effects: [
      {
        t: 'special' as const,
        pieces: 4 as const,
        effectId: 'set-special:reserva-ap',
        description: '+1 AP máximo e `rest` recupera +2 AP.',
      },
    ],
  },
  {
    id: 'set-sentinela',
    name: 'Sentinela',
    effects: [
      {
        t: 'special' as const,
        pieces: 4 as const,
        effectId: 'set-special:sentinela-assistencia-livre-por-round',
        description: 'Assistir custa 0 PP uma vez por round de mapa.',
      },
    ],
  },
  {
    id: 'set-imunidade',
    name: 'Imunidade',
    effects: [
      {
        t: 'special' as const,
        pieces: 4 as const,
        effectId: 'set-special:imunidade-debuff-troca-1',
        description: 'Imune a debuffs na troca 1 do duelo.',
      },
    ],
  },
];

export const ITEM_SETS = [
  {
    id: SET_FORCA_ID,
    name: 'Força',
    effects: [{ t: 'stat' as const, pieces: 2 as const, stat: 'atk' as const, pct: 100 }],
  },
  {
    id: SET_GUARDIAO_ID,
    name: 'Guardião',
    // M10, sub-sessão 4/N — era `def +15%`; virou `hp +8%` ao rodar `pnpm balance` com os
    // comps multi-unidade. Motivo (medido, não suposto): as 6 classes `physical` equipam
    // set-forca (+10% atk) e as 3 `magic` equipam este set, e `def` é praticamente inerte
    // nos valores reais do roster — a mitigação de §6.6 é calibrada pra def~1000 e heróis
    // nível 10 têm def~30-56 (descompasso já documentado desde M8 sub-sessão 2). Enquanto
    // o torneio era 1v1 isso só encolhia o roster efetivo; com assistência viva (que escala
    // com `atk`) o lado físico passou a levar dois comps acima de 65%, quebrando o critério
    // de aceite de M8. Trocar o eixo pra `hp` dá ao lado mágico um contrapeso que de fato
    // conta na guerra de atrito. Magnitude calibrada empiricamente: +15% hp inverteu o
    // desequilíbrio (Druida a 70,5%); +8% deixa o roster inteiro abaixo de 65%.
    effects: [{ t: 'stat' as const, pieces: 2 as const, stat: 'hp' as const, pct: 80 }],
  },
  ...SPECIAL_ITEM_SETS,
];

function necklaceIdFor(profile: ClassProfile): string {
  return profile.tag === 'physical' ? NECKLACE_FORCA.id : NECKLACE_GUARDIAO.id;
}

// M10, sub-sessão 4/N — comps deixam de ser 1 unidade. Critério de aceite 3 de M10:
// "`pnpm balance` roda com comps de múltiplas unidades". Três unidades DA MESMA CLASSE
// por comp, em vez de um time misto: mantém o comp comparável a si mesmo (um comp continua
// significando "um time desta classe", que é o que a matriz de winrate mede desde M8) e
// evita introduzir, junto com a multi-unidade, um segundo eixo de variação — qual aliado
// cada classe ganha — que tornaria impossível atribuir uma mudança de winrate à classe.
// Posições em L dentro de um raio de 2 (Manhattan): §6.5.2 exige o aliado dentro do
// `assistRange` (melee = 2) em relação ao duelo pra a janela de assistência abrir.
const COMP_UNIT_POSITIONS = [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
] as const;

export function generateComp(profile: ClassProfile) {
  return {
    id: `comp-${profile.slug}`,
    name: profile.name,
    units: COMP_UNIT_POSITIONS.map((pos, index) => ({
      hero: {
        id: `heroi-${profile.slug}-${index + 1}`,
        classId: `class-${profile.slug}`,
        level: 10,
        exp: 0,
        awakening: 0,
        imprint: 0,
        // §6.5 — sem este talento nenhuma unidade tem `skill-assistir` (não é baseline por
        // §6.4), e a janela de assistência nunca abriria: o comp seria multi-unidade no
        // papel e continuaria medindo duelos isolados, que é exatamente o que a auditoria
        // de 2026-08-07 apontou como o buraco da matriz de M8.
        talents: { [`talent-${profile.slug}-foco-em-equipe`]: 1 },
        equipment: {
          weapon: weaponItemId(profile),
          helmet: null,
          armor: null,
          necklace: necklaceIdFor(profile),
          ring: null,
          boots: null,
        },
        weaponType: profile.weaponType,
        duelSkills: [basicSkillId(profile), signatureSkillId(profile)],
        mapSkills: [],
        tacticsScript: [{ enabled: true, skillId: signatureSkillId(profile), conditions: [] }],
      },
      pos: { x: pos.x, y: pos.y },
      height: 0,
      aiArchetype: 'aggressive',
    })),
  };
}

// Roster desta fatia: 1 classe base por WeaponType, cobrindo os dois ciclos do
// triângulo (físico: sword/axe/spear; mágico: arcane/nature/holy) mais o arco
// (assimetria de duelo ranged, §6.1). unitType/flying/armored ficam de fora — corte
// registrado em DECISIONS.md.
// hp/atk (base e por nível) são IGUAIS pras 7 classes de propósito — descoberta desta
// sub-sessão (ver DECISIONS.md): a heróis nível 10 sem equipamento, a fórmula de
// mitigação de §6.6 devolve mitigação muito baixa (def~40-80 está longe dos ~1000 onde
// a spec calibra "~50% mitigação"), então pequenas diferenças de hp/atk viram vitórias
// quase deterministas (combate quase sem crit — chc=0 sem equipamento — e acc/eva fixos
// não geram variância suficiente pra suavizar isso). Balancear hp/atk igual entre as 7
// classes deixa DEF/SPD/basePools/signatureMultiplier como os diferenciadores reais —
// exatamente os eixos que a spec associa a identidade de classe (§6.7 pro spd, §6.2 pro
// AP/PP) em vez de uma vantagem crua de dano/vida.
const BASE_HP = 420;
const BASE_ATK = 63;
const HP_PER_LEVEL = 20;
const ATK_PER_LEVEL = 3;

export const CLASS_PROFILES: readonly ClassProfile[] = [
  {
    slug: 'espadachim', name: 'Espadachim', weaponType: 'sword', unitType: 'infantry', moveType: 'foot', moveRange: 4, tag: 'physical',
    basePools: { ap: 3, pp: 2 }, hpBase: BASE_HP, atkBase: BASE_ATK, defBase: 42, spdBase: 80,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 2, signatureMultiplier: 1400,
  },
  {
    slug: 'guerreiro', name: 'Guerreiro', weaponType: 'axe', unitType: 'infantry', moveType: 'foot', moveRange: 4, tag: 'physical',
    basePools: { ap: 3, pp: 1 }, hpBase: BASE_HP, atkBase: BASE_ATK, defBase: 33, spdBase: 76,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 1, signatureMultiplier: 1500,
  },
  {
    slug: 'lanceiro', name: 'Lanceiro', weaponType: 'spear', unitType: 'infantry', moveType: 'foot', moveRange: 4, tag: 'physical',
    basePools: { ap: 3, pp: 2 }, hpBase: BASE_HP, atkBase: BASE_ATK, defBase: 38, spdBase: 80,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 1, signatureMultiplier: 1350,
  },
  {
    slug: 'arqueiro', name: 'Arqueiro', weaponType: 'bow', unitType: 'infantry', moveType: 'foot', moveRange: 4, tag: 'physical',
    basePools: { ap: 4, pp: 1 }, hpBase: BASE_HP, atkBase: BASE_ATK, defBase: 28, spdBase: 80,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 1, signatureMultiplier: 1350,
  },
  {
    slug: 'arcanista', name: 'Arcanista', weaponType: 'arcane', unitType: 'caster', moveType: 'foot', moveRange: 4, tag: 'magic',
    basePools: { ap: 4, pp: 1 }, hpBase: BASE_HP, atkBase: BASE_ATK, defBase: 30, spdBase: 82,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 1, signatureMultiplier: 1500,
  },
  {
    slug: 'druida', name: 'Druida', weaponType: 'nature', unitType: 'caster', moveType: 'foot', moveRange: 4, tag: 'magic',
    basePools: { ap: 3, pp: 2 }, hpBase: BASE_HP, atkBase: BASE_ATK, defBase: 36, spdBase: 80,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 2, signatureMultiplier: 1350,
  },
  {
    slug: 'clerigo', name: 'Clérigo', weaponType: 'holy', unitType: 'caster', moveType: 'foot', moveRange: 4, tag: 'magic',
    basePools: { ap: 3, pp: 2 }, hpBase: BASE_HP, atkBase: BASE_ATK, defBase: 33, spdBase: 78,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 1, signatureMultiplier: 1300,
  },
  // M8, sub-sessão 4/N — flying/armored: testam de verdade o bônus de arqueiro contra
  // `flying` (+25% dano, §6.8) e a mitigação diferenciada de `armored` (-20% físico/+20%
  // mágico), que nenhuma das 7 classes acima exercitava. hp/atk continuam iguais ao
  // resto do roster (mesmo raciocínio da sub-sessão 2); `moveType`/`moveRange`
  // diferenciados por flavor (`flying` mais rápido, `heavy` mais lento) não têm efeito
  // real no mapa desta fatia (`terrain-planicie` custa 1 pra todo `MoveType` exceto
  // `aquatic`), mas ficam corretos pro dia em que o mapa/terreno tiver variação de custo.
  {
    // defBase bem acima do resto do roster — decisão de balanceamento descoberta ao
    // rodar `pnpm balance`: comps são 1 unidade sem aliados, então o mesmo par reengaja
    // TODO round até um morrer (§9.2, Coliseu). Sem passiva nenhuma (diferente de
    // `armored`), Grifeiro precisava de uma vantagem crua real pra não ser eliminado por
    // atrito numa desvantagem de DEF de só ~2 pontos (descoberto isolando 1 duelo com
    // `resolveDuel` direto: a diferença por duelo é pequena, ~2%, mas composta ao longo
    // de rounds repetidos vira decisão quase determinística).
    slug: 'grifeiro', name: 'Grifeiro', weaponType: 'spear', unitType: 'flying', moveType: 'flying', moveRange: 5, tag: 'physical',
    basePools: { ap: 3, pp: 2 }, hpBase: BASE_HP, atkBase: BASE_ATK, defBase: 56, spdBase: 84,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 3, signatureMultiplier: 1350,
  },
  {
    // atk (não só def) abaixo do resto do roster — decisão de balanceamento: `armored`
    // já dá -20% dano físico embutido no motor (§6.8, `armoredDamageMultiplier`) contra
    // a maioria do roster (6 das 9 classes são `physical`), e empiricamente isso pesa
    // muito mais que qualquer ajuste de DEF (a mitigação real de DEF nesses valores
    // baixos é só alguns pontos percentuais — ver DECISIONS.md sub-sessão 2 — enquanto
    // o -20% do armored é aplicado por cima, flat). Reduzir DEF sozinho não bastou;
    // Couraçado precisa de dano de saída abaixo da média pra compensar a passiva.
    slug: 'couracado', name: 'Couraçado', weaponType: 'axe', unitType: 'armored', moveType: 'heavy', moveRange: 3, tag: 'physical',
    basePools: { ap: 3, pp: 2 }, hpBase: BASE_HP, atkBase: 45, defBase: 30, spdBase: 74,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: 2, defPerLevel: 1, signatureMultiplier: 1250,
  },
];

// M8, sub-sessão 4/N — promoção. Reusa os mesmos blocos (`generateStatCurve`,
// `generateTalentTree(profile, 'spec')`, `generateBasicSkill`/`generateSignatureSkill`)
// já usados pras 9 classes base, só com um `ClassProfile` mais forte (~25% acima de
// `class-espadachim`, mesma proporção observada entre `class-cavaleiro`/`class-soldado`
// em M1) e `slug` próprio pra não colidir ids com a classe base. Decisão registrada em
// DECISIONS.md, confirmada com o usuário: esta classe fica com conteúdo real válido
// (`pnpm validate:data` valida), mas **não** ganha um comp em `packages/data/comps/` —
// comparar base vs. promovida no MESMO torneio de `tools/balance` reintroduziria o
// artefato já documentado na sub-sessão 1 (base vs. promovida ~99% de winrate, esperado
// mas não é o que o critério de aceite de 65% quer medir).
const PROMOTED_PROFILE: ClassProfile = {
  slug: 'mestre-espadachim', name: 'Mestre-Espadachim', weaponType: 'sword', unitType: 'infantry', moveType: 'foot', moveRange: 4, tag: 'physical',
  basePools: { ap: 4, pp: 3 }, hpBase: 525, atkBase: 79, defBase: 53, spdBase: 84,
  hpPerLevel: 25, atkPerLevel: 4, defPerLevel: 2, signatureMultiplier: 1450,
};

const PROMOTES_FROM_ID = 'class-espadachim';
const PROMOTION_REQUIREMENT = { minLevel: 20, itemId: 'item-brasao-mestre-espadachim' } as const;

export function generatePromotedClass() {
  return {
    id: `class-${PROMOTED_PROFILE.slug}`,
    name: PROMOTED_PROFILE.name,
    tier: 'spec' as const,
    promotesFrom: PROMOTES_FROM_ID,
    promotionRequirement: PROMOTION_REQUIREMENT,
    unitType: PROMOTED_PROFILE.unitType,
    moveType: PROMOTED_PROFILE.moveType,
    moveRange: PROMOTED_PROFILE.moveRange,
    allowedWeapons: [PROMOTED_PROFILE.weaponType],
    basePools: PROMOTED_PROFILE.basePools,
    statCurve: generateStatCurve(PROMOTED_PROFILE),
    awakeningMultipliers: [...STANDARD_AWAKENING_MULTIPLIERS],
    promotionFlat: [{ stat: 'hp' as const, flat: 200 }],
    imprintFlat: STANDARD_IMPRINT_FLAT.map((entry) => entry.map((mod) => ({ ...mod }))),
    talentTree: generateTalentTree(PROMOTED_PROFILE, 'spec'),
  };
}

function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

function writeJson(dir: string, id: string, content: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

function main(): void {
  const root = packageRoot();
  const classesDir = join(root, 'classes');
  const skillsDir = join(root, 'skills');
  const compsDir = join(root, 'comps');
  const itemsDir = join(root, 'items');
  const itemSetsDir = join(root, 'item-sets');

  for (const profile of CLASS_PROFILES) {
    const classDef = generateClass(profile);
    classSchema.parse(classDef); // falha cedo se o gerador produzir algo inválido
    writeJson(classesDir, classDef.id, classDef);

    const basic = generateBasicSkill(profile);
    skillSchema.parse(basic);
    writeJson(skillsDir, basic.id, basic);

    const signature = generateSignatureSkill(profile);
    skillSchema.parse(signature);
    writeJson(skillsDir, signature.id, signature);

    const weapon = generateWeaponItem(profile);
    itemSchema.parse(weapon);
    writeJson(itemsDir, weapon.id, weapon);

    const comp = generateComp(profile);
    compSchema.parse(comp);
    writeJson(compsDir, comp.id, comp);
  }

  // §6.4/§6.5 (M10 sub-sessão 4/N) — as 3 reações do catálogo passam pelo gerador, pra o
  // campo `baseline` (quem é universal e quem vem de talento) viver num lugar só.
  for (const reaction of [...BASELINE_REACTIONS, SKILL_ASSISTIR]) {
    skillSchema.parse(reaction);
    writeJson(skillsDir, reaction.id, reaction);
  }

  for (const shared of SHARED_ITEMS) {
    itemSchema.parse(shared);
    writeJson(itemsDir, shared.id, shared);
  }

  for (const set of ITEM_SETS) {
    itemSetSchema.parse(set);
    writeJson(itemSetsDir, set.id, set);
  }

  // Classe promovida (sub-sessão 4/N): conteúdo real válido, deliberadamente sem comp —
  // ver comentário de PROMOTED_PROFILE acima.
  const promotedClass = generatePromotedClass();
  classSchema.parse(promotedClass);
  writeJson(classesDir, promotedClass.id, promotedClass);

  const promotedBasic = generateBasicSkill(PROMOTED_PROFILE);
  skillSchema.parse(promotedBasic);
  writeJson(skillsDir, promotedBasic.id, promotedBasic);

  const promotedSignature = generateSignatureSkill(PROMOTED_PROFILE);
  skillSchema.parse(promotedSignature);
  writeJson(skillsDir, promotedSignature.id, promotedSignature);

  console.log(
    `Gerado: ${CLASS_PROFILES.length + 1} classes (${CLASS_PROFILES.length} base + 1 promovida), ${CLASS_PROFILES.length * 2 + 2 + BASELINE_REACTIONS.length + 1} skills, ${CLASS_PROFILES.length} comps de ${COMP_UNIT_POSITIONS.length} unidades, ${CLASS_PROFILES.length + SHARED_ITEMS.length} itens, ${ITEM_SETS.length} sets.`,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
