import type { UnitType, WeaponType } from '@paths-beyond/core';
import type { NormShape } from './shapes.js';

// M16, sub-sessão 2/N — o glifo de classe.
//
// O diagnóstico do briefing (§1): "toda unidade do tabuleiro é a mesma forma com cores
// diferentes: um Clérigo e um Couraçado são indistinguíveis sem clicar". §1.1 lista
// legibilidade tática entre os pilares — o tabuleiro falha um pilar antes de falhar o gosto.
//
// D1: **o glifo mora no CLIENTE, nunca em `packages/data`.** Glifo é apresentação;
// `packages/data` é o dataset de REGRA, validado por Zod e consumido por `packages/core`,
// `apps/server` e `sim-cli`, nenhum dos três desenhando nada. Um path vetorial ali poria arte
// dentro do pacote crítico de determinismo e faria o servidor carregar bytes que nunca usa.
// O risco dessa escolha — classe nova sem glifo — é coberto por teste de completude no estilo
// de M9 (`tests/classGlyphs.test.ts`), contra o catálogo real.
//
// **Resolução em três níveis**, e o motivo de não ser um só:
//
//   1. por `classId`, quando quem monta a batalha sabe a classe (a campanha sabe:
//      `heroesByUnitId`). É o único nível capaz de separar Espadachim de Mestre-Espadachim —
//      os dois são `infantry`/`sword`, nenhum campo de `BattleUnit` os distingue, e os dois
//      aparecem no capítulo 6 ao mesmo tempo;
//   2. por PERFIL (`unitType`, depois `weaponType`), campos que TODO `BattleUnit` carrega. É o
//      que impede que o tabuleiro inteiro do PvP, da masmorra e do replay — cujo `BattleSetup`
//      vem pronto do servidor, sem classe — vire o mesmo boneco genérico. `unitType` vem antes
//      porque o que faz um Couraçado ser Couraçado é a armadura, não o machado;
//   3. o fallback declarado, para o que escapar dos dois.
//
// Todo desenho está em espaço normalizado 0..1 (y para baixo): a mesma declaração serve ao tile
// de 36px e ao de 63px (175%, a maior escala de §11).

// ---- as 10 classes do catálogo ----

// Espadachim: lâmina reta, guarda larga, punho. A silhueta mais neutra do tabuleiro, de
// propósito — é a classe base da campanha e a referência contra a qual as outras se leem.
const ESPADA: readonly NormShape[] = [
  { t: 'poly', points: [0.5, 0.0, 0.6, 0.16, 0.6, 0.58, 0.4, 0.58, 0.4, 0.16], closed: true, filled: true },
  { t: 'poly', points: [0.18, 0.58, 0.82, 0.58, 0.82, 0.7, 0.18, 0.7], closed: true, filled: true },
  { t: 'poly', points: [0.44, 0.7, 0.56, 0.7, 0.56, 1.0, 0.44, 1.0], closed: true, filled: true },
];

// Mestre-Espadachim: duas lâminas cruzadas. Não é a espada com um enfeite — é outra silhueta,
// porque a promoção precisa se ler a distância: um Mestre-Espadachim no meio de espadachins é
// a unidade que muda a conta do turno.
const ESPADAS_CRUZADAS: readonly NormShape[] = [
  { t: 'poly', points: [0.1, 1.0, 0.9, 0.0], w: 1.6 },
  { t: 'poly', points: [0.9, 1.0, 0.1, 0.0], w: 1.6 },
  { t: 'poly', points: [0.06, 0.72, 0.38, 0.9] },
  { t: 'poly', points: [0.94, 0.72, 0.62, 0.9] },
];

// Guerreiro: machado de dois gumes, cabo passando inteiro.
const MACHADO: readonly NormShape[] = [
  { t: 'poly', points: [0.42, 0.02, 0.42, 1.0], w: 1.2 },
  { t: 'poly', points: [0.42, 0.06, 0.96, 0.2, 0.96, 0.52, 0.42, 0.62], closed: true, filled: true },
  { t: 'poly', points: [0.42, 0.16, 0.16, 0.24, 0.16, 0.44, 0.42, 0.5], closed: true, filled: true },
];

// Couraçado: escudo em contorno, com nervura. Contorno e não massa cheia porque a unidade
// inteira já é uma massa cheia — um escudo maciço em cima dela viraria só um borrão maior.
const ESCUDO: readonly NormShape[] = [
  { t: 'poly', points: [0.5, 0.0, 0.94, 0.16, 0.94, 0.56, 0.5, 1.0, 0.06, 0.56, 0.06, 0.16], closed: true, w: 1.3 },
  { t: 'poly', points: [0.5, 0.16, 0.5, 0.82] },
];

// Lanceiro: ponta losangular, haste longa, travessa. A travessa é o que o separa da espada
// numa olhada — sem ela, lança e espada são a mesma vertical.
const LANCA: readonly NormShape[] = [
  { t: 'poly', points: [0.5, 0.0, 0.72, 0.3, 0.5, 0.4, 0.28, 0.3], closed: true, filled: true },
  { t: 'poly', points: [0.5, 0.34, 0.5, 1.0], w: 1.2 },
  { t: 'poly', points: [0.22, 0.46, 0.78, 0.46] },
];

// Grifeiro: asa aberta. A única classe voadora do catálogo, e voar é o que muda o mapa (passa
// por montanha, ignora custo de terreno) — então a asa vale mais que a lança que ele carrega.
const ASA: readonly NormShape[] = [
  { t: 'poly', points: [0.02, 0.86, 0.26, 0.28, 0.98, 0.1], w: 1.4 },
  { t: 'poly', points: [0.26, 0.28, 0.3, 0.78] },
  { t: 'poly', points: [0.52, 0.2, 0.56, 0.66] },
  { t: 'poly', points: [0.76, 0.14, 0.8, 0.52] },
];

// Arqueiro: arco à esquerda, flecha encaixada apontando para fora. O alcance é a identidade da
// classe (§6.1 — duelo ranged unilateral), e a flecha saindo do glifo é o que diz isso.
const ARCO: readonly NormShape[] = [
  { t: 'poly', points: [0.3, 0.02, 0.1, 0.28, 0.1, 0.72, 0.3, 0.98], w: 1.3 },
  { t: 'poly', points: [0.3, 0.02, 0.3, 0.98] },
  { t: 'poly', points: [0.2, 0.5, 0.82, 0.5] },
  { t: 'poly', points: [0.98, 0.5, 0.74, 0.38, 0.74, 0.62], closed: true, filled: true },
];

// Arcanista: estrela de quatro pontas, cheia. Massa concentrada no centro e pontas finas —
// é a forma que menos se confunde com arma nenhuma.
const ESTRELA: readonly NormShape[] = [
  {
    t: 'poly',
    points: [0.5, 0.0, 0.6, 0.4, 1.0, 0.5, 0.6, 0.6, 0.5, 1.0, 0.4, 0.6, 0.0, 0.5, 0.4, 0.4],
    closed: true,
    filled: true,
  },
];

// Clérigo: cruz cheia. É o glifo mais legível do conjunto de propósito — o Clérigo é quem cura
// (§6.5), e achá-lo no tabuleiro é a decisão mais frequente do jogador.
const CRUZ: readonly NormShape[] = [
  {
    t: 'poly',
    points: [0.4, 0.0, 0.6, 0.0, 0.6, 0.3, 0.94, 0.3, 0.94, 0.5, 0.6, 0.5, 0.6, 1.0, 0.4, 1.0, 0.4, 0.5, 0.06, 0.5, 0.06, 0.3, 0.4, 0.3],
    closed: true,
    filled: true,
  },
];

// Druida: folha em contorno com nervura.
const FOLHA: readonly NormShape[] = [
  { t: 'poly', points: [0.5, 0.0, 0.84, 0.3, 0.78, 0.72, 0.5, 1.0, 0.22, 0.72, 0.16, 0.3], closed: true, w: 1.3 },
  { t: 'poly', points: [0.5, 0.08, 0.5, 0.92] },
];

export const GLYPH_BY_CLASS: Readonly<Record<string, readonly NormShape[]>> = {
  'class-espadachim': ESPADA,
  'class-mestre-espadachim': ESPADAS_CRUZADAS,
  'class-guerreiro': MACHADO,
  'class-couracado': ESCUDO,
  'class-lanceiro': LANCA,
  'class-grifeiro': ASA,
  'class-arqueiro': ARCO,
  'class-arcanista': ESTRELA,
  'class-clerigo': CRUZ,
  'class-druida': FOLHA,
};

// ---- nível 2: o perfil, para quem chega sem classe resolvida ----

export interface UnitProfile {
  readonly weaponType: WeaponType;
  readonly unitType: UnitType;
}

// `unitType` antes de `weaponType`: um Couraçado com machado é antes de tudo um Couraçado.
export const UNIT_TYPE_GLYPHS: Partial<Readonly<Record<UnitType, readonly NormShape[]>>> = {
  armored: ESCUDO,
  flying: ASA,
};

export const PROFILE_GLYPHS: Readonly<Record<WeaponType, readonly NormShape[]>> = {
  sword: ESPADA,
  axe: MACHADO,
  spear: LANCA,
  bow: ARCO,
  arcane: ESTRELA,
  holy: CRUZ,
  nature: FOLHA,
};

// ---- nível 3: o último recurso, declarado (D1) ----

export const FALLBACK_GLYPH: readonly NormShape[] = [
  { t: 'circle', cx: 0.5, cy: 0.5, r: 0.36, w: 1.2 },
  { t: 'circle', cx: 0.5, cy: 0.5, r: 0.1, filled: true },
];

// A chave da resolução, exposta porque é o que torna o desenho afirmável de fora sem ninguém
// comparar listas de pontos — e porque é o que o renderer alternativo (D3) usa para escrever a
// identidade da unidade em vez de desenhá-la.
export type GlyphKey = `class:${string}` | `unit:${UnitType}` | `weapon:${WeaponType}` | 'fallback';

export function glyphKeyFor(classId: string | undefined, profile: UnitProfile | undefined): GlyphKey {
  if (classId !== undefined && GLYPH_BY_CLASS[classId] !== undefined) return `class:${classId}`;
  if (profile) {
    if (UNIT_TYPE_GLYPHS[profile.unitType] !== undefined) return `unit:${profile.unitType}`;
    if (PROFILE_GLYPHS[profile.weaponType] !== undefined) return `weapon:${profile.weaponType}`;
  }
  return 'fallback';
}

export function glyphFor(classId: string | undefined, profile: UnitProfile | undefined): readonly NormShape[] {
  const key = glyphKeyFor(classId, profile);
  if (key === 'fallback') return FALLBACK_GLYPH;
  const [nivel, valor] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (nivel === 'class') return GLYPH_BY_CLASS[valor]!;
  if (nivel === 'unit') return UNIT_TYPE_GLYPHS[valor as UnitType]!;
  return PROFILE_GLYPHS[valor as WeaponType]!;
}

// Rótulo curto e ÚNICO por classe. Não é usado pelo tabuleiro — quem o consome é o renderer
// alternativo do critério de aceite 4, que resolve identidade por texto em vez de glifo. É o
// que prova que o contrato exige o RESULTADO ("dá para saber a classe olhando") e não a
// técnica: um contrato amarrado a glifo vetorial não teria como ser satisfeito de outro jeito,
// e a costura seria trocável só no nome.
export const GLYPH_LABELS: Readonly<Record<string, string>> = {
  'class-espadachim': 'Es',
  'class-mestre-espadachim': 'ME',
  'class-guerreiro': 'Gu',
  'class-couracado': 'Co',
  'class-lanceiro': 'La',
  'class-grifeiro': 'Gf',
  'class-arqueiro': 'Aq',
  'class-arcanista': 'Ac',
  'class-clerigo': 'Cl',
  'class-druida': 'Dr',
};

const LABELS_POR_PERFIL: Readonly<Record<string, string>> = {
  'unit:armored': 'AR',
  'unit:flying': 'FL',
  'weapon:sword': 'sw',
  'weapon:axe': 'ax',
  'weapon:spear': 'sp',
  'weapon:bow': 'bo',
  'weapon:arcane': 'mg',
  'weapon:holy': 'ho',
  'weapon:nature': 'na',
};

export function glyphLabelFor(classId: string | undefined, profile: UnitProfile | undefined): string {
  const key = glyphKeyFor(classId, profile);
  if (key.startsWith('class:')) return GLYPH_LABELS[key.slice('class:'.length)] ?? '??';
  return LABELS_POR_PERFIL[key] ?? '??';
}
