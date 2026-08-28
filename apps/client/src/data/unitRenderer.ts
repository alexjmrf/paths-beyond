import type { UnitType, WeaponType } from '@paths-beyond/core';
import { glyphFor, glyphLabelFor, type UnitProfile } from './classGlyphs.js';
import type { OverlayTheme, UnitShape } from './overlayTheme.js';
import { placeShapes, type Primitive } from './shapes.js';

// M16 — a costura de representação de unidade.
//
// D2 do briefing (`docs/milestones/M16-linguagem-visual-programatica.md`): o renderer produz
// uma **descrição** — uma lista de primitivas — e não desenha. Quem traduz primitiva em
// `Graphics` do Pixi é o `MapCanvas`.
//
// Três coisas saem de graça dessa inversão, e nenhuma delas sairia se o desenho continuasse
// embutido no componente:
//   - a representação vira testável sem browser e sem Pixi (`tests/unitRenderer.test.ts` não
//     importa nem um nem outro);
//   - dá para AFIRMAR propriedades sobre o desenho — que nada transborda o tile, que cada
//     estado tem marca própria, que os dois lados se distinguem sem cor — em vez de olhar um
//     screenshot e torcer;
//   - uma camada de sprite pode entrar por cima no futuro trocando a implementação, sem
//     reescrever o renderer. É o hedge arquitetural que a auditoria de 2026-08-14 exigiu ao
//     escolher visual programático como direção definitiva.
//
// A sub-sessão 1/N extraiu o desenho de M6–M15 tal como estava. A 2/N é a linguagem visual em
// si: glifo por classe, efeitos ativos, HP e a barra de estado, tudo medido em frações do tile
// que vêm dos tokens da paleta (`overlayTheme.ts`) — nenhum pixel literal novo neste arquivo.

export interface UnitRenderUnit {
  readonly side: 'player' | 'enemy';
  readonly ap: number;
  readonly pp: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly hasActedThisRound: boolean;
  // §6.9 — quantos efeitos ativos de cada polaridade. Contagem e não a lista: quem resolve
  // `ActiveEffect.id` → `EffectDef.kind` é o `MapCanvas`, contra o catálogo; o renderer não
  // conhece catálogo nenhum, e é isso que o mantém puro e testável com números à mão.
  readonly buffs: number;
  readonly debuffs: number;
  // Nível 1 da resolução de glifo. Ausente fora da campanha: PvP, masmorra e replay recebem o
  // `BattleSetup` pronto do servidor, e `BattleUnit` (core) não carrega `classId`.
  readonly classId?: string;
  // Nível 2 — o perfil, que TODO `BattleUnit` carrega. Ver `classGlyphs.ts`.
  readonly weaponType?: WeaponType;
  readonly unitType?: UnitType;
}

export interface TileGeometry {
  readonly px: number; // canto superior esquerdo do tile, em pixels de canvas
  readonly py: number;
  readonly size: number;
}

export interface UnitRenderState {
  readonly selected: boolean;
  readonly engageable: boolean;
}

export interface UnitRenderInput {
  readonly unit: UnitRenderUnit;
  readonly tile: TileGeometry;
  readonly state: UnitRenderState;
  readonly theme: OverlayTheme;
  // Já resolvido pela escala de UI de M13 4/N: o renderer não sabe o que é escala, só o
  // tamanho final. §11 exige AP/PP legíveis no próprio tile, e isso tem de valer em 175%.
  readonly labelSize: number;
}

// Nome preservado de 1/N — o `MapCanvas` importa por ele. A definição mora em `shapes.ts`
// desde 2/N, porque a marca de terreno e os padrões de overlay falam a mesma língua.
export type UnitPrimitive = Primitive;

export interface UnitRenderer {
  readonly id: string;
  render(input: UnitRenderInput): readonly UnitPrimitive[];
}

// §7.4/§11 — o véu que marca "já agiu neste round". Preto a 45% é o valor de M6, preservado.
const ACTED_ALPHA = 0.45;
const LABEL_COLOR = 0xffffff;

// Acima disto o tile vira um mostrador de contadores e para de ser um tabuleiro. Quem quer a
// lista inteira abre o painel — o tile diz "está com buff", não "está com quais".
const MAX_PIPS = 3;

function profileOf(unit: UnitRenderUnit): UnitProfile | undefined {
  return unit.weaponType && unit.unitType ? { weaponType: unit.weaponType, unitType: unit.unitType } : undefined;
}

// Fração de HP, à prova do que chega de fora: `maxHp` zero existe em fixture de teste e em
// unidade montada à mão, e dividir por ele produziria uma largura `NaN` — que o Pixi desenha
// como nada, ou seja, um bug que só apareceria em jogo.
function hpFraction(unit: UnitRenderUnit): number {
  if (!Number.isFinite(unit.hp) || !Number.isFinite(unit.maxHp) || unit.maxHp <= 0) return 0;
  return Math.min(1, Math.max(0, unit.hp / unit.maxHp));
}

// Largura estimada de um texto bold. O cliente não mede fonte fora do browser (e o renderer é
// puro de propósito), então a plaqueta usa uma razão conservadora e é limitada pelo tile —
// estimar por baixo cortaria o número, e transbordar invadiria o tile vizinho.
const LABEL_ADVANCE = 0.62;

// §11 — "AP/PP de cada unidade legíveis no próprio tile (sem hover)".
//
// A plaqueta veio da verificação em navegador desta fatia: sem ela o número branco caía em cima
// do glifo e os dois viravam um borrão só. Com ela — e com o glifo deslocado para baixo o
// bastante para passar por baixo dela sem tocá-la — o número se lê como crachá, e o glifo
// continua inteiro. De quebra resolve um problema que vinha de M6: branco sobre o azul claro do
// jogador tinha pouco contraste.
function apPpLabel(input: UnitRenderInput): readonly UnitPrimitive[] {
  const texto = `${input.unit.ap}/${input.unit.pp}`;
  const altura = Math.round(input.labelSize * 1.2);
  const largura = Math.min(input.tile.size, Math.round(texto.length * input.labelSize * LABEL_ADVANCE) + 4);

  return [
    {
      t: 'rect',
      x: input.tile.px,
      y: input.tile.py,
      w: largura,
      h: altura,
      fill: input.theme.tokens.labelPlate,
      alpha: input.theme.tokens.labelPlateAlpha,
    },
    {
      t: 'text',
      x: input.tile.px + 2,
      y: input.tile.py + 1,
      text: texto,
      size: input.labelSize,
      color: LABEL_COLOR,
      bold: true,
    },
  ];
}

interface BarMetrics {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fraction: number;
  readonly critical: boolean;
}

// A faixa de HP na base do tile. §1.1 põe "o jogador DEVE conseguir prever o resultado antes de
// confirmar" entre os pilares, e a decisão de engajar acontece olhando o tabuleiro: uma unidade
// a 5% de HP desenhada igual a uma cheia esconde exatamente o dado que decide.
function hpMetrics(input: UnitRenderInput): BarMetrics {
  const h = Math.max(2, Math.round(input.tile.size * input.theme.tokens.hpBarRatio));
  const margem = 2;
  const fraction = hpFraction(input.unit);
  return {
    x: input.tile.px + margem,
    y: input.tile.py + input.tile.size - h - 1,
    w: input.tile.size - margem * 2,
    h,
    fraction,
    critical: fraction <= input.theme.tokens.hpCriticalAt,
  };
}

function hpBar(input: UnitRenderInput): readonly UnitPrimitive[] {
  const t = input.theme.tokens;
  const m = hpMetrics(input);
  const preenchido = Math.round(m.w * m.fraction);
  const out: UnitPrimitive[] = [{ t: 'rect', x: m.x, y: m.y, w: m.w, h: m.h, fill: t.hpTrack }];

  if (preenchido > 0) {
    out.push({ t: 'rect', x: m.x, y: m.y, w: preenchido, h: m.h, fill: m.critical ? t.hpCriticalInk : t.hpInk });
  }
  if (m.critical) {
    // O entalhe é a marca PRÓPRIA da faixa crítica. Sem ele, "está morrendo" seria só a cor da
    // barra — e em deuteranopia a barra vermelha e a verde podem virar o mesmo tom, deixando
    // só o comprimento, que sozinho não avisa que a unidade morre no próximo golpe.
    out.push({ t: 'rect', x: m.x + m.w - m.h, y: m.y - m.h, w: m.h, h: m.h, fill: t.hpCriticalInk });
  }
  return out;
}

interface PipSlot {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

// Onde cada pip cai. A POSIÇÃO é metade da distinção entre buff e debuff (canto superior
// direito contra inferior esquerdo) — a outra metade é a forma. Nenhuma das duas depende de
// cor, que é a garantia de M13 4/N aplicada ao dado novo.
function pipSlots(input: UnitRenderInput, kind: 'buff' | 'debuff'): readonly PipSlot[] {
  const size = Math.max(2, Math.round(input.tile.size * input.theme.tokens.pipRatio));
  const passo = size + 1;
  const quantos = Math.min(MAX_PIPS, Math.max(0, Math.trunc(kind === 'buff' ? input.unit.buffs : input.unit.debuffs)));
  const barra = Math.max(2, Math.round(input.tile.size * input.theme.tokens.hpBarRatio));

  return Array.from({ length: quantos }, (_, i) =>
    kind === 'buff'
      ? { x: input.tile.px + input.tile.size - size - 1, y: input.tile.py + 1 + i * passo, size }
      : { x: input.tile.px + 1, y: input.tile.py + input.tile.size - barra - 2 - size - i * passo, size },
  );
}

function shapePrimitive(
  shape: UnitShape,
  cx: number,
  cy: number,
  r: number,
  extra: { fill?: number; alpha?: number; stroke?: number; strokeWidth?: number },
): UnitPrimitive {
  return shape === 'square'
    ? { t: 'rect', x: cx - r, y: cy - r, w: r * 2, h: r * 2, ...extra }
    : { t: 'circle', cx, cy, r, ...extra };
}

// O renderer de produção: o corpo de M6 (disco, ou quadrado no modo daltônico) com os anéis de
// estado de M13 4/N, e — a partir de 2/N — o glifo da classe dentro dele, os pips de efeito e a
// faixa de HP.
export const shapeUnitRenderer: UnitRenderer = {
  id: 'shape',
  render(input) {
    const t = input.theme.tokens;
    const side = input.theme.sides[input.unit.side];
    const shape: UnitShape = side?.shape ?? 'circle';
    const cx = input.tile.px + input.tile.size / 2;
    const cy = input.tile.py + input.tile.size / 2;
    const r = input.tile.size / 2 - t.unitInset;

    const primitivas: UnitPrimitive[] = [shapePrimitive(shape, cx, cy, r, { fill: side?.color ?? 0xffffff })];

    // O glifo de classe (D1): a resposta ao diagnóstico do briefing de que "um Clérigo e um
    // Couraçado são indistinguíveis sem clicar".
    const lado = input.tile.size * t.glyphBoxRatio;
    primitivas.push(
      ...placeShapes(
        glyphFor(input.unit.classId, profileOf(input.unit)),
        { x: cx - lado / 2, y: cy - lado / 2 + input.tile.size * t.glyphOffsetY, size: lado },
        { ink: t.glyphInk, strokeWidth: input.tile.size * t.glyphStrokeRatio },
      ),
    );

    if (input.state.selected) {
      primitivas.push(shapePrimitive(shape, cx, cy, r + 2, { stroke: input.theme.selectedRing, strokeWidth: 3 }));
    }
    if (input.state.engageable) {
      primitivas.push(shapePrimitive(shape, cx, cy, r + 3, { stroke: input.theme.engageableRing, strokeWidth: 2 }));
    }
    // O véu vem DEPOIS do glifo (escurece a peça inteira, que é o que "já agiu" quer dizer) e
    // ANTES da barra de HP e dos pips: quem já agiu continua tendo de dizer quanto lhe resta.
    if (input.unit.hasActedThisRound) {
      primitivas.push(shapePrimitive(shape, cx, cy, r, { fill: 0x000000, alpha: ACTED_ALPHA }));
    }

    primitivas.push(...hpBar(input));

    for (const slot of pipSlots(input, 'buff')) {
      // Triângulo para CIMA.
      primitivas.push({
        t: 'poly',
        points: [slot.x + slot.size / 2, slot.y, slot.x + slot.size, slot.y + slot.size, slot.x, slot.y + slot.size],
        closed: true,
        fill: t.buffInk,
      });
    }
    for (const slot of pipSlots(input, 'debuff')) {
      // Triângulo para BAIXO.
      primitivas.push({
        t: 'poly',
        points: [slot.x, slot.y, slot.x + slot.size, slot.y, slot.x + slot.size / 2, slot.y + slot.size],
        closed: true,
        fill: t.debuffInk,
      });
    }

    primitivas.push(...apPpLabel(input));
    return primitivas;
  },
};

// A SEGUNDA implementação (D3): só retângulos e texto, nenhum círculo e nenhum polígono. Não é
// um espião de chamadas — é um renderer alternativo de verdade, e é por isso que ele prova
// alguma coisa: um espião mostraria que a função foi chamada, enquanto este mostra que a
// costura **não está amarrada à linguagem de formas de hoje**, que é o que "trocável" significa
// no critério de aceite 4.
//
// Repare em como ele satisfaz cada exigência do contrato por outro caminho: os dois lados se
// separam por entalhe em vez de forma do corpo, a identidade de classe vem do RÓTULO em vez do
// glifo, e buff/debuff se distinguem por proporção e canto em vez de triângulo. Se o contrato
// exigisse a técnica em vez do resultado, nada disso passaria — e a costura seria trocável só
// no nome.
export const minimalUnitRenderer: UnitRenderer = {
  id: 'minimal',
  render(input) {
    const t = input.theme.tokens;
    const side = input.theme.sides[input.unit.side];
    const r = input.tile.size / 2 - t.unitInset;
    const x = input.tile.px + input.tile.size / 2 - r;
    const y = input.tile.py + input.tile.size / 2 - r;
    const lado = r * 2;

    const primitivas: UnitPrimitive[] = [{ t: 'rect', x, y, w: lado, h: lado, fill: side?.color ?? 0xffffff }];

    if (input.unit.side === 'enemy') {
      const entalhe = Math.max(2, Math.round(lado / 3));
      primitivas.push({ t: 'rect', x, y, w: entalhe, h: entalhe, fill: 0x000000, alpha: 0.5 });
    }
    if (input.state.selected) {
      primitivas.push({ t: 'rect', x, y, w: lado, h: lado, stroke: input.theme.selectedRing, strokeWidth: 3 });
    }
    if (input.state.engageable) {
      const folga = 2;
      primitivas.push({
        t: 'rect',
        x: x - folga,
        y: y - folga,
        w: lado + folga * 2,
        h: lado + folga * 2,
        stroke: input.theme.engageableRing,
        strokeWidth: 2,
      });
    }
    if (input.unit.hasActedThisRound) {
      primitivas.push({ t: 'rect', x, y, w: lado, h: lado, fill: 0x000000, alpha: ACTED_ALPHA });
    }

    primitivas.push(...hpBar(input));

    // Buff: quadrado cheio no canto superior direito. Debuff: barra baixa e larga no canto
    // inferior esquerdo. Proporção e posição, sem uma cor precisar carregar o significado.
    for (const slot of pipSlots(input, 'buff')) {
      primitivas.push({ t: 'rect', x: slot.x, y: slot.y, w: slot.size, h: slot.size, fill: t.buffInk });
    }
    for (const slot of pipSlots(input, 'debuff')) {
      const altura = Math.max(1, Math.round(slot.size / 2));
      primitivas.push({
        t: 'rect',
        x: slot.x,
        y: slot.y + slot.size - altura,
        w: slot.size,
        h: altura,
        fill: t.debuffInk,
      });
    }

    primitivas.push(...apPpLabel(input));
    primitivas.push({
      t: 'text',
      x: input.tile.px + 2,
      y: input.tile.py + input.tile.size / 2,
      text: glyphLabelFor(input.unit.classId, profileOf(input.unit)),
      size: input.labelSize,
      color: LABEL_COLOR,
    });
    return primitivas;
  },
};

// O renderer em uso pelo tabuleiro. Um ponto só de troca — é a costura em si.
export const activeUnitRenderer: UnitRenderer = shapeUnitRenderer;
