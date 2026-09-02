import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import classSchema from '../schemas/classes.schema.js';
import compSchema from '../schemas/comps.schema.js';
import itemSchema from '../schemas/items.schema.js';
import itemSetSchema from '../schemas/item-sets.schema.js';
import skillSchema from '../schemas/skills.schema.js';
import effectSchema from '../schemas/effects.schema.js';
import {
  characterForClass,
  columnGrantingAssist,
  columnPathAllocation,
  type CharacterSpec,
} from './authorCharacters.js';

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
  // M12, sub-sessão 2/N — o efeito que a especial da classe aplica. §12 do roadmap:
  // "nenhuma skill do catálogo é só um número de dano" (o ataque básico e as duas reações
  // universais de §6.4 são a exceção declarada — ver DECISIONS.md).
  readonly signatureEffectId: string;
  // Chance de aplicação em escala 1000, ANTES de eff/efr (§6.9). Varia por classe: é a
  // alavanca de balanceamento do efeito, junto do `signatureMultiplier`.
  readonly signatureEffectChance: number;
  // Onde o efeito cai: 'target' (debuff no oponente) ou 'self' (buff em quem usou).
  readonly signatureEffectTarget: 'self' | 'target';
  // M12, sub-sessão 2/N — mecânicas de M10 que só uma classe tem. `extraDuelSkillId` entra
  // em `duelSkills` (é como uma passiva `onLethal` chega a `knownSkills`); `grantedReactionId`
  // vira um nó de talento, porque §6.4 fecha a lista de reações universais em duas.
  readonly extraDuelSkillId?: string;
  readonly grantedReactionId?: string;
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
    // §8.3/§6.9 (M12 sub-sessão 2/N) — `duration: 'duel'` em todos: o efeito vale a troca
    // seguinte do mesmo duelo e não vaza para o mapa. Duração em rounds de mapa é uma
    // alavanca bem mais forte (efeito `battle` acumula vantagem entre duelos, §6.9) e fica
    // reservada para conteúdo que a queira de propósito.
    effects: [
      {
        effectId: profile.signatureEffectId,
        target: profile.signatureEffectTarget,
        chance: profile.signatureEffectChance,
        duration: 'duel' as const,
      },
    ],
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

// §8.1 (M17, sub-sessão 2/N) — `generateTalentTree` FOI REMOVIDO daqui.
//
// A árvore deixou de pertencer à classe, então o gerador de classes deixou de ter o que
// gerar: as nove árvores agora são do PERSONAGEM e são autoradas uma a uma em
// `authorCharacters.ts`, porque a forma de duas colunas é desenho e não template. O que
// vivia aqui era um molde único aplicado a 10 classes com os ids trocados — exatamente o
// que §8.2 proíbe ao exigir que as duas colunas sejam "papéis diferentes de verdade".

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

// Passe do HANDOFF, 2026-08-28 — o apoio que torna a comp MISTA.
//
// Enquanto as 9 comps eram monoclasse, ligar o `duelRange` real das armas de alcance (§6.1)
// produzia ranged vencendo melee em 20 de 20 pareamentos: três arqueiros contra três espadachins
// é exatamente o tabuleiro em que "fechar distância", a resposta tática que a spec nomeia, não
// existe. A correção não é mexer em número — é a comp ter as duas coisas.
//
// M17, sub-sessão 5/N — **a REGRA de apoio saiu; a propriedade que ela protegia ficou.**
//
// A regra era "corpo a corpo ganha o Arqueiro atrás, alcance ganha o Couraçado à frente". Ela
// nasceu quando duas das três unidades eram a classe do comp, e sobreviveu à 2/N sem que
// ninguém medisse o que ela passou a produzir com três personagens distintos: como o apoio do
// Arqueiro é o Couraçado e o do Couraçado é o Arqueiro, **os dois entravam em todas as nove
// comps**, e quando a própria âncora era um deles a regra de colisão puxava sempre o primeiro
// perfil não usado — fazendo de `comp-arqueiro`, `comp-couracado` e `comp-espadachim` O MESMO
// TIME, distinto só pela ordem das posições. Um terço da matriz media posição inicial, não
// composição, com 10 pontos percentuais de diferença entre as três (medido em 2026-09-01).
//
// Decisão do usuário: **âncora + os dois seguintes no elenco, circulando.** As nove comps ficam
// distintas por construção (janelas de tamanho 3 num ciclo de 9 nunca se repetem) e cada
// personagem aparece em exatamente três comps — o que também tira o viés de dois personagens
// estarem em todas elas.
//
// A ordem do elenco abaixo é INTERCALADA, e isso é o que preserva a razão de a regra antiga ter
// existido: com a ordem de declaração de `CLASS_PROFILES` (três de espada/machado/lança seguidos,
// depois três casters) as janelas de três dariam uma comp inteiramente corpo a corpo e outra
// inteiramente de alcance, que é exatamente a degeneração de 20-em-20 descrita acima. Alternando
// melee e alcance, **toda janela de três tem os dois** — testado, não suposto.
const COMP_ROSTER_ORDER = [
  'espadachim',
  'arqueiro',
  'guerreiro',
  'arcanista',
  'lanceiro',
  'druida',
  'couracado',
  'clerigo',
  'grifeiro',
] as const;

const MELEE_WEAPONS = new Set(['sword', 'axe', 'spear']);

export function isMelee(profile: ClassProfile): boolean {
  return MELEE_WEAPONS.has(profile.weaponType);
}

export function classProfileFor(classId: string): ClassProfile {
  const found = CLASS_PROFILES.find((p) => `class-${p.slug}` === classId);
  if (!found) throw new Error(`perfil de classe ausente: ${classId}`);
  return found;
}

function profileBySlug(slug: string): ClassProfile {
  const found = CLASS_PROFILES.find((p) => p.slug === slug);
  // Falha alto em vez de cair num fallback: uma comp montada a partir de uma ordem que não
  // bate com o catálogo mediria um time diferente do que o arquivo diz, em silêncio.
  if (!found) throw new Error(`perfil ausente em COMP_ROSTER_ORDER: ${slug}`);
  return found;
}

// M17, sub-sessão 2/N — o time de uma composição, agora feito de PERSONAGENS.
//
// Até aqui uma comp era duas unidades da classe do comp mais um apoio (passe do HANDOFF,
// 2026-08-28: "a matriz segue legível por classe"). Com o elenco fechado (D6) e um
// personagem por classe, "duas unidades da classe do comp" seriam duas cópias da mesma
// pessoa — o herói sintético que D6 aposentou. Decisão do usuário: **três personagens
// distintos**, com a âncora dando nome ao comp.
function compRoster(profile: ClassProfile): readonly CharacterSpec[] {
  const inicio = COMP_ROSTER_ORDER.indexOf(profile.slug as (typeof COMP_ROSTER_ORDER)[number]);
  if (inicio < 0) throw new Error(`classe fora de COMP_ROSTER_ORDER: ${profile.slug}`);

  const perfis: ClassProfile[] = [];
  for (let i = 0; i < COMP_UNIT_POSITIONS.length; i++) {
    perfis.push(profileBySlug(COMP_ROSTER_ORDER[(inicio + i) % COMP_ROSTER_ORDER.length]!));
  }

  return perfis.map((p) => characterForClass(`class-${p.slug}`));
}

export function generateComp(profile: ClassProfile) {
  const elenco = compRoster(profile);

  return {
    id: `comp-${profile.slug}`,
    name: profile.name,
    units: elenco.map((personagem, index) => {
      const dono = classProfileFor(personagem.classId);
      const coluna = columnGrantingAssist(personagem);
      const pos = COMP_UNIT_POSITIONS[index]!;

      return {
        hero: {
          // O id da INSTÂNCIA carrega a slug do comp, e não a do personagem: o mesmo
          // personagem aparece em várias composições (o elenco é fechado, são nove para
          // nove comps), e `runTournament` usa `hero.id` como `unitId` — dois `unitId`
          // iguais na mesma batalha são a mesma unidade para o motor.
          id: `heroi-${profile.slug}-${index + 1}`,
          // §8.1 (M17) — QUEM ele é. É daqui que sai a árvore que resolve `talents`.
          characterId: personagem.id,
          classId: personagem.classId,
          level: 10,
          exp: 0,
          awakening: 0,
          imprint: 0,
          // §8.2 — o caminho inteiro por uma coluna, gastando os 9 pontos. A coluna não é
          // escolhida por gosto: é a que concede `skill-assistir`, que não é baseline por
          // §6.4. Sem ela a janela de assistência nunca abriria e o comp seria
          // multi-unidade no papel enquanto mede duelos isolados — o buraco que a
          // auditoria de 2026-08-07 apontou na matriz de M8.
          talents: columnPathAllocation(personagem, coluna),
          equipment: {
            weapon: weaponItemId(dono),
            helmet: null,
            armor: null,
            necklace: necklaceIdFor(dono),
            ring: null,
            boots: null,
          },
          weaponType: dono.weaponType,
          duelSkills: [
            basicSkillId(dono),
            signatureSkillId(dono),
            ...(dono.extraDuelSkillId ? [dono.extraDuelSkillId] : []),
          ],
          mapSkills: [],
          // §6.3 — o script é lido de cima para baixo, primeira linha que passa vence. A
          // cura do Clérigo entra ACIMA da especial e com condição: "curar ou bater" vira
          // decisão de script, que é o produto do jogo, em vez de trocar dano por cura sempre.
          tacticsScript: [
            ...(dono.extraDuelSkillId === SKILL_CURA_CLERIGO.id
              ? [{ enabled: true, skillId: SKILL_CURA_CLERIGO.id, conditions: [{ t: 'selfHpBelow' as const, pct: 250 }] }]
              : []),
            { enabled: true, skillId: signatureSkillId(dono), conditions: [] },
          ],
        },
        pos: { x: pos.x, y: pos.y },
        height: 0,
        aiArchetype: 'aggressive' as const,
      };
    }),
  };
}


// M12, sub-sessão 2/N — os EffectDef que as especiais aplicam. `effect-fragilidade` já
// existia (M8) e continua sendo o efeito do talento `golpe-fragilizante`; os demais nascem
// aqui. Magnitudes em escala 1000 (§01): `pct: -150` é -15%.
export const SIGNATURE_EFFECTS = [
  // DoT de §6.9: 3% do HP MÁXIMO por round de mapa. `periodicDamagePct` existe desde M10
  // sub-sessão 1 e passou M10 inteira sem um consumidor real.
  { id: 'effect-sangramento', name: 'Sangramento', kind: 'debuff' as const, dispellable: true, maxStacks: 3, statMods: [], periodicDamagePct: 30 },
  { id: 'effect-queimadura', name: 'Queimadura', kind: 'debuff' as const, dispellable: true, maxStacks: 2, statMods: [], periodicDamagePct: 80 },
  // Debuffs de stat: entram no stat sheet DENTRO do duelo (§4.1 passo 8, M10 sub-sessão 1).
  { id: 'effect-quebra-armadura', name: 'Quebra de Armadura', kind: 'debuff' as const, dispellable: true, maxStacks: 2, statMods: [{ stat: 'def' as const, pct: -120 }], damageTakenReductionPct: -80 },
  { id: 'effect-desarme', name: 'Desarme', kind: 'debuff' as const, dispellable: true, maxStacks: 1, statMods: [{ stat: 'atk' as const, pct: -150 }] },
  { id: 'effect-lentidao', name: 'Lentidão', kind: 'debuff' as const, dispellable: true, maxStacks: 1, statMods: [{ stat: 'spd' as const, pct: -200 }] },
  // §6.6 passo 8 — os dois campos de percentual de dano, também inertes desde M10.
  { id: 'effect-marca-do-cacador', name: 'Marca do Caçador', kind: 'debuff' as const, dispellable: true, maxStacks: 1, statMods: [], damageTakenReductionPct: -100 },
  { id: 'effect-impeto', name: 'Ímpeto', kind: 'buff' as const, dispellable: true, maxStacks: 1, statMods: [], damageDealtPct: 50 },
  { id: 'effect-guarda-cerrada', name: 'Guarda Cerrada', kind: 'buff' as const, dispellable: true, maxStacks: 1, statMods: [], damageTakenReductionPct: 70 },
  { id: 'effect-bencao', name: 'Bênção', kind: 'buff' as const, dispellable: true, maxStacks: 1, statMods: [{ stat: 'def' as const, pct: 450 }] },
  { id: 'effect-regeneracao', name: 'Regeneração', kind: 'buff' as const, dispellable: true, maxStacks: 1, statMods: [], periodicHealPct: 40 },
];

// === As 3 mecânicas de M10 que ganham consumidor real nesta fatia ===

// 1) Tag `heal` (M10 sub-sessão 7/N): cura de verdade. Skill PRÓPRIA do Clérigo, não a
// especial dele — assim a decisão "curar ou bater" vira uma linha de script com condição
// (`selfHpBelow`), que é o produto do jogo (§6.3), em vez de trocar dano por cura sempre.
export const SKILL_CURA_CLERIGO = {
  id: 'skill-cura-clerigo',
  name: 'Luz Restauradora',
  kind: 'duel' as const,
  apCost: 1,
  cooldown: 2,
  multiplier: 1200,
  flat: 0,
  scalesWith: 'atk' as const,
  effects: [],
  tags: ['magic', 'heal'],
};

// 2) `onLethal` (M10 sub-sessão 8/N): gatilho de morte, variante `survive`. Vai para o
// Couraçado — a classe cuja identidade é não cair — e é `perBattle`, então salva uma vez
// por batalha e não por duelo. Não é reação: não entra no reactionScript nem custa PP; o
// motor o encontra varrendo `knownSkills`, e `duelSkills` alimenta essa lista.
export const SKILL_ULTIMO_SUSPIRO = {
  id: 'skill-ultimo-suspiro',
  name: 'Último Suspiro',
  kind: 'duel' as const,
  apCost: 0,
  cooldown: 0,
  multiplier: 0,
  flat: 0,
  scalesWith: 'atk' as const,
  effects: [],
  trigger: 'onLethal' as const,
  lethalUses: 'perBattle' as const,
  tags: ['survive'],
};

// 3) `onDamaged` (M10 sub-sessão 5/N) + "Cura de emergência" (§6.4, nomeada pela spec e
// sem nenhum consumidor até aqui): uma reação de CURA, não de dano. A escolha de curar em
// vez de revidar não é sabor — é mecânica: `resolveDuel` ignora os `skill.effects` de uma
// reação (corte de M10 sub-sessão 1/N, preservado com teste), então uma reação ofensiva
// só sabe ser um número de dano. Curar é a única forma de uma reação ser mais que isso
// sem mentir. Concedida por talento (§6.4 fecha as universais em duas) e só ao Arqueiro:
// a classe mais frágil e com o menor pool de PP do roster.
// **ppCost 0 é a razão de esta skill existir de verdade**, não uma generosidade: com 1 PP
// ela NUNCA dispararia. `resolveDuel` resolve `onAttacked` primeiro (cronologicamente) e
// `tryLateReaction` sai cedo se já houve reação na troca — e Contra-atacar é baseline, sem
// condições, então vence sempre. A única janela em que `onDamaged` existe é quando a
// unidade não reagiu, ou seja, quando ficou SEM PP. Custando 0, a skill é exatamente isso:
// "sem PP para revidar, você ainda revida uma vez ao levar o golpe" — e vai para o
// Arqueiro, que tem o menor pool de PP do roster (1). Achado desta fatia, registrado em
// DECISIONS.md.
export const SKILL_REVIDE_PRECISO = {
  id: 'skill-folego-de-combate',
  name: 'Fôlego de Combate',
  kind: 'reaction' as const,
  apCost: 0,
  ppCost: 0,
  cooldown: 0,
  // Sustain gratuito toda troca é a coisa mais forte que uma reação pode fazer num
  // torneio de atrito: a 400 o Arqueiro ia a 77,7%. Calibrado empiricamente.
  multiplier: 120,
  flat: 0,
  scalesWith: 'atk' as const,
  effects: [],
  trigger: 'onDamaged' as const,
  tags: ['heal'],
};

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
    signatureEffectId: 'effect-sangramento', signatureEffectChance: 400, signatureEffectTarget: 'target' as const,
  },
  {
    slug: 'guerreiro', name: 'Guerreiro', weaponType: 'axe', unitType: 'infantry', moveType: 'foot', moveRange: 4, tag: 'physical',
    basePools: { ap: 3, pp: 1 }, hpBase: BASE_HP, atkBase: BASE_ATK, defBase: 33, spdBase: 76,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 1, signatureMultiplier: 1500,
    signatureEffectId: 'effect-quebra-armadura', signatureEffectChance: 500, signatureEffectTarget: 'target' as const,
  },
  {
    slug: 'lanceiro', name: 'Lanceiro', weaponType: 'spear', unitType: 'infantry', moveType: 'foot', moveRange: 4, tag: 'physical',
    basePools: { ap: 3, pp: 2 }, hpBase: BASE_HP, atkBase: BASE_ATK, defBase: 38, spdBase: 80,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 1, signatureMultiplier: 1350,
    signatureEffectId: 'effect-desarme', signatureEffectChance: 500, signatureEffectTarget: 'target' as const,
  },
  {
    slug: 'arqueiro', name: 'Arqueiro', weaponType: 'bow', unitType: 'infantry', moveType: 'foot', moveRange: 4, tag: 'physical',
    basePools: { ap: 4, pp: 1 }, hpBase: BASE_HP, atkBase: 33, defBase: 28, spdBase: 80,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 1, signatureMultiplier: 1350,
    signatureEffectId: 'effect-marca-do-cacador', signatureEffectChance: 700, signatureEffectTarget: 'target' as const,
    grantedReactionId: 'skill-folego-de-combate',
  },
  {
    slug: 'arcanista', name: 'Arcanista', weaponType: 'arcane', unitType: 'caster', moveType: 'foot', moveRange: 4, tag: 'magic',
    basePools: { ap: 4, pp: 1 }, hpBase: BASE_HP, atkBase: 33, defBase: 30, spdBase: 82,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 1, signatureMultiplier: 1500,
    signatureEffectId: 'effect-queimadura', signatureEffectChance: 650, signatureEffectTarget: 'target' as const,
  },
  {
    slug: 'druida', name: 'Druida', weaponType: 'nature', unitType: 'caster', moveType: 'foot', moveRange: 4, tag: 'magic',
    basePools: { ap: 3, pp: 2 }, hpBase: BASE_HP, atkBase: 33, defBase: 36, spdBase: 80,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 2, signatureMultiplier: 1350,
    signatureEffectId: 'effect-regeneracao', signatureEffectChance: 1000, signatureEffectTarget: 'self' as const,
  },
  {
    slug: 'clerigo', name: 'Clérigo', weaponType: 'holy', unitType: 'caster', moveType: 'foot', moveRange: 4, tag: 'magic',
    basePools: { ap: 3, pp: 2 }, hpBase: BASE_HP, atkBase: 33, defBase: 33, spdBase: 78,
    hpPerLevel: HP_PER_LEVEL, atkPerLevel: ATK_PER_LEVEL, defPerLevel: 1, signatureMultiplier: 1450,
    signatureEffectId: 'effect-bencao', signatureEffectChance: 1000, signatureEffectTarget: 'self' as const,
    extraDuelSkillId: 'skill-cura-clerigo',
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
    signatureEffectId: 'effect-impeto', signatureEffectChance: 1000, signatureEffectTarget: 'self' as const,
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
    signatureEffectId: 'effect-guarda-cerrada', signatureEffectChance: 1000, signatureEffectTarget: 'self' as const,
    extraDuelSkillId: 'skill-ultimo-suspiro',
  },
];

// M8, sub-sessão 4/N — promoção. Reusa os mesmos blocos (`generateStatCurve`,
// `generateBasicSkill`/`generateSignatureSkill`)
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
    signatureEffectId: 'effect-lentidao', signatureEffectChance: 700, signatureEffectTarget: 'target' as const,
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

  // M12, sub-sessão 2/N — os EffectDef que as especiais aplicam e as 3 skills que dão
  // consumidor real às mecânicas de M10.
  const effectsDir = join(root, 'effects');
  for (const effect of SIGNATURE_EFFECTS) {
    effectSchema.parse(effect);
    writeJson(effectsDir, effect.id, effect);
  }
  for (const skill of [SKILL_CURA_CLERIGO, SKILL_ULTIMO_SUSPIRO, SKILL_REVIDE_PRECISO]) {
    skillSchema.parse(skill);
    writeJson(skillsDir, skill.id, skill);
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
