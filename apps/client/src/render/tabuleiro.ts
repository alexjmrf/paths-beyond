import { isControlObject, type BattleState, type BattleUnit, type Hero } from '@paths-beyond/core';
import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { catalog } from '../data/catalog.js';
import { terrainMarkInkFor, type OverlayTheme } from '../data/overlayTheme.js';
import { placeShapes, type Primitive } from '../data/shapes.js';
import { structureMarkFor } from '../data/structureMarks.js';
import { terrainMarkFor } from '../data/terrainMarks.js';
import { patternPrimitives } from '../data/tilePatterns.js';
import { artIdDeUnidade } from '../data/unitArt.js';
import type { UnitRenderInput, UnitRenderState } from '../data/unitRenderer.js';
import { primitivasPintaveis } from '../logic/spriteSemTextura.js';

// M35 2/N — o que o tabuleiro sabe desenhar, fora do componente.
//
// Até aqui tudo isto morava dentro de `MapCanvas.tsx`: a tradução primitiva → Pixi, a marca de
// terreno, a pintura de um tile com os seus véus e estruturas, e a montagem da entrada do
// renderer de unidade. A prévia da missão (D42) precisa desenhar o MESMO tabuleiro sem os
// handlers, sem a store e sem animação — e a alternativa de copiar a pintura para um segundo
// componente seria a divergência que §9.1 chama de bug: dois tabuleiros que se parecem até o dia
// em que um muda. O `MapCanvas` continua sendo quem liga clique, overlay de turno e FX; o que
// está aqui é só "como se desenha", e é chamado dos dois lados.

export const BASE_LABEL_SIZE = 10;

// A tradução primitiva -> Pixi, no nível do `Graphics`: desenha as formas de uma lista dentro
// de um `Graphics` que já existe (o do tile, que carrega o hit-test do clique). Texto não entra
// aqui — `Text` é filho do `Container`, não do `Graphics`.
//
// Este é o ÚNICO ponto do cliente que sabe ao mesmo tempo o que foi descrito e como o Pixi
// desenha. Manter isso num lugar só é o que torna a costura trocável: glifo de classe, marca de
// terreno, padrão de overlay e representação de unidade falam todos a mesma língua de dado puro
// e passam todos por aqui.
export function applyPrimitives(g: Graphics, primitives: readonly Primitive[]): void {
  for (const p of primitives) {
    // Texto e sprite não entram num `Graphics`: `Text` e `Sprite` são filhos do `Container`.
    // Quem os posiciona é `paintPrimitives`, logo abaixo.
    if (p.t === 'text' || p.t === 'sprite') continue;

    if (p.t === 'circle') g.circle(p.cx, p.cy, p.r);
    else if (p.t === 'rect') g.rect(p.x, p.y, p.w, p.h);
    else if (p.closed) g.poly([...p.points], true);
    else {
      g.moveTo(p.points[0]!, p.points[1]!);
      for (let i = 2; i + 1 < p.points.length; i += 2) g.lineTo(p.points[i]!, p.points[i + 1]!);
    }

    if (p.fill !== undefined) g.fill(p.alpha === undefined ? p.fill : { color: p.fill, alpha: p.alpha });
    if (p.stroke !== undefined) {
      g.stroke({
        width: p.strokeWidth ?? 1,
        color: p.stroke,
        ...(p.alpha === undefined ? {} : { alpha: p.alpha }),
      });
    }
  }
}

// §5.1/§6.6 — a marca do terreno. Terreno é regra (floresta dá +100 de def e bloqueia visão,
// montanha é intransponível a pé), e cor chapada obriga o jogador a ter decorado a paleta. A
// tinta é escolhida CONTRA o tile: a rampa de terrenos é de luminância, então nenhuma tinta
// única contrasta com os três.
export function terrainMarkPrimitives(
  theme: OverlayTheme,
  terrainId: string,
  terrainColor: number,
  px: number,
  py: number,
  size: number,
): readonly Primitive[] {
  return placeShapes(
    terrainMarkFor(terrainId),
    { x: px, y: py, size },
    {
      ink: terrainMarkInkFor(theme, terrainColor),
      strokeWidth: Math.max(1, Math.round(size / 22)),
      alpha: theme.tokens.terrainMarkAlpha,
    },
  );
}

// M26 — a tradução criando os objetos, e o único lugar do cliente onde a ORDEM de desenho de
// uma unidade vira ordem de filhos do Pixi.
//
// Até o M26 as formas cabiam todas num `Graphics` só, porque nada podia se intercalar entre
// elas. Um sprite pode: o disco de lado fica embaixo dele e a barra de HP, os pips e a plaqueta
// ficam em cima. Então o `Graphics` é FECHADO e um novo é aberto sempre que um sprite
// interrompe a sequência — sem isso, um único `Graphics` viria inteiro antes ou inteiro depois
// da imagem, e o HUD sumiria atrás da peça. D25 mediu esse erro na tela: "ordem de desenho
// importa: sprite primeiro, HUD depois. No teste eu inverti e o sprite cobriu o distintivo."
//
// O texto continua vindo por último, como em M16: ele é sempre rótulo por cima de tudo, e
// mudar isso agora mexeria no que cobre o quê em telas que nada têm a ver com esta fatia.
export function paintPrimitives(layer: Container, primitives: readonly Primitive[]): void {
  let g: Graphics | null = null;

  // M32 — a imagem que ainda não chegou é pulada, não lançada. `Texture.from` de URL fora do
  // cache devolve `undefined` (e avisa no console), e a primeira pintura da batalha real
  // acontece antes de o `Assets.load` terminar. Ver `primitivasPintaveis`.
  for (const p of primitivasPintaveis(primitives, (src) => Assets.cache.has(src))) {
    if (p.t === 'text') continue;

    if (p.t === 'sprite') {
      if (g) {
        layer.addChild(g);
        g = null;
      }
      const textura = Texture.from(p.src);
      // Vizinho-mais-próximo: a 175% o tile vai a 63px e um sprite de 48 é esticado 1,31×.
      // D25 mediu que a escala não-inteira é imperceptível assim — e que com interpolação
      // suave a arte vira um borrão.
      textura.source.scaleMode = 'nearest';
      const sprite = new Sprite(textura);
      sprite.position.set(p.x, p.y);
      sprite.width = p.w;
      sprite.height = p.h;
      if (p.alpha !== undefined) sprite.alpha = p.alpha;
      layer.addChild(sprite);
      continue;
    }

    g ??= new Graphics();
    applyPrimitives(g, [p]);
  }
  if (g) layer.addChild(g);

  for (const p of primitives) {
    if (p.t !== 'text') continue;
    const label = new Text({
      text: p.text,
      style: { fontSize: p.size, fill: p.color, fontWeight: p.bold ? 'bold' : 'normal' },
    });
    label.position.set(p.x, p.y);
    layer.addChild(label);
  }
}

// Os véus e marcas que dependem do TURNO (ameaça, alcance, mira, portão aberto, objetivo
// capturado). A prévia passa tudo falso menos o objetivo; o `MapCanvas` calcula cada um contra
// a store.
export interface OverlaysDoTile {
  readonly threatened: boolean;
  readonly reachable: boolean;
  readonly targetable: boolean;
  readonly gateOpen: boolean;
  readonly captured: boolean;
  readonly objective: boolean;
}

export interface PintarTileArgs {
  readonly map: BattleState['map'];
  readonly x: number;
  readonly y: number;
  readonly tileSize: number;
  readonly theme: OverlayTheme;
  readonly overlays: OverlaysDoTile;
}

/** Pinta um tile — terreno, altura, marca, véus, rocha, alvenaria, controle, objetivo. */
export function pintarTile(g: Graphics, { map, x, y, tileSize, theme, overlays }: PintarTileArgs): void {
    const tile = map.tiles[y]?.[x];
    const terrainId = tile?.terrain ?? 'terrain-planicie';
    const color = theme.terrain[terrainId] ?? theme.terrainFallback;
    const px = x * tileSize;
    const py = y * tileSize;

    g.rect(px, py, tileSize - 1, tileSize - 1).fill(color);
    // Altura do tile (§6.6 dá dano e acerto a quem ataca de cima): um véu branco por
    // nível, pra o relevo aparecer sem precisar de outra paleta.
    if (tile && tile.height > 0) {
      g.rect(px, py, tileSize - 1, tileSize - 1).fill({ color: 0xffffff, alpha: 0.08 * tile.height });
    }
    // A marca do terreno vai por baixo dos overlays: os véus são translúcidos, então ela
    // continua legível debaixo deles, e pintá-la por cima faria a textura do chão competir
    // com a informação de turno (ameaça, alcance), que é a que decide a jogada.
    applyPrimitives(g, terrainMarkPrimitives(theme, terrainId, color, px, py, tileSize - 1));
    if (overlays.threatened) {
      g.rect(px, py, tileSize - 1, tileSize - 1).fill({ color: theme.threat.color, alpha: theme.threat.alpha });
      applyPrimitives(g, patternPrimitives(theme.threat.pattern, px, py, tileSize - 1, theme.threat.color));
    }
    if (overlays.reachable) {
      g.rect(px, py, tileSize - 1, tileSize - 1).fill({ color: theme.move.color, alpha: theme.move.alpha });
      applyPrimitives(g, patternPrimitives(theme.move.pattern, px, py, tileSize - 1, theme.move.color));
    }
    // Alcance de lançamento da skill de mapa / do Valor em mira (§5.4/§5.6).
    if (overlays.targetable) {
      g.rect(px, py, tileSize - 1, tileSize - 1).fill({ color: theme.targeting.color, alpha: theme.targeting.alpha });
      applyPrimitives(g, patternPrimitives(theme.targeting.pattern, px, py, tileSize - 1, theme.targeting.color));
    }
    // Rocha intransponível, desenhada DEPOIS dos overlays: o de ameaça cobre o tile
    // inteiro e fazia a muralha do capítulo 6 se ler como zona de perigo em vez de
    // parede. Terreno que decide o traçado do mapa não pode ser apagado por um véu.
    if (tile && map.terrains[tile.terrain]?.moveCost.foot === 'impassable') {
      g.rect(px + 1, py + 1, tileSize - 3, tileSize - 3).stroke({ width: 2, color: theme.impassableStroke });
    }
    // §5.1 (M15) — alvenaria: muro e portão. Desenhada DEPOIS dos overlays pelo mesmo
    // motivo da rocha (um véu de ameaça por cima faria a muralha se ler como zona de
    // perigo em vez de parede), e opaca: estrutura não é terreno com véu, é o tile.
    //
    // Até esta fatia o cliente pintava o tile pelo TERRENO e mais nada, então a muralha
    // do capítulo 6 aparecia como planície pisável — uma mentira visual sobre uma regra
    // que já valia no motor.
    // M16 5/N — a construção passou a ter FORMA, e não só tinta. O muro era a única coisa
    // do tabuleiro desenhada apenas com cor, e com a alvenaria antiga (0x6b4f3a) ele estava
    // a 1,03 de contraste da floresta: um bosque e uma muralha liam-se como o mesmo tile.
    // Reafinar a tinta resolve metade; a fiada de blocos resolve a outra, porque forma é o
    // que sobrevive quando um véu semitransparente empurra toda a tinta para a mesma
    // direção. As marcas vêm de `data/structureMarks.ts`, declaradas e testadas sem Pixi —
    // mesma costura do glifo de classe e da marca de terreno.
    const objeto = tile?.object;
    if (objeto === 'wall' || objeto === 'gate') {
      const aberto = objeto === 'gate' && overlays.gateOpen;
      // O tile inteiro é a pedra. Muro e portão são intransponíveis, então nenhuma unidade
      // é desenhada aqui e a textura pode ocupar o miolo — ao contrário da marca de terreno.
      g.rect(px, py, tileSize - 1, tileSize - 1).fill(theme.structure);
      const marca = structureMarkFor(aberto ? 'gate-open' : objeto);
      if (marca) {
        applyPrimitives(
          g,
          placeShapes(marca, { x: px, y: py, size: tileSize - 1 }, {
            // Tinta escolhida pela luminância da pedra, o mesmo critério da marca de
            // terreno: sobre a alvenaria escura as juntas saem claras e a fiada aparece.
            ink: terrainMarkInkFor(theme, theme.structure),
            alpha: theme.tokens.terrainMarkAlpha,
            strokeWidth: Math.max(1, Math.round(tileSize * 0.045)),
          }),
        );
      }
    }
    // §5.6 (M15) — tile de controle: encerrar o turno aqui rende +2 Valor, uma vez por
    // batalha. Sem marca, a regra nova seria invisível — o jogador não tem como saber
    // que aquele tile paga. Mesma cor de objetivo do mapa, porque é o que ele é.
    if (isControlObject(tile?.object)) {
      g.rect(px + 3, py + 3, tileSize - 7, tileSize - 7).stroke({ width: 2, color: theme.objective.color });
      if (overlays.captured) {
        // Já capturado: o quadrado cheio no canto diz que aquele +2 não paga de novo.
        const mark = Math.max(3, Math.round(tileSize / 5));
        g.rect(px + 4, py + 4, mark, mark).fill(theme.objective.color);
      }
    }
    // O objetivo do mapa, sempre marcado: sem isto um mapa de `seize`/`defend`/
    // `escort` manda o jogador procurar uma coordenada que só existe no JSON.
    if (overlays.objective) {
      g.rect(px + 2, py + 2, tileSize - 5, tileSize - 5).stroke({ width: 3, color: theme.objective.color });
      applyPrimitives(g, patternPrimitives(theme.objective.pattern, px + 3, py + 3, tileSize - 7, theme.objective.color));
    }
}


// O que a costura de unidade recebe para uma peça no tile (`px`, `py`). Quem sabe ligar uma
// unidade de batalha ao conteúdo que a montou é o chamador, contra o roster e o mapa de arte do
// ticket; o renderer continua puro.
export interface ContextoDeRender {
  readonly theme: OverlayTheme;
  readonly tileSize: number;
  readonly uiScale: number;
  readonly heroesByUnitId: Readonly<Record<string, Hero>>;
  readonly artIdByUnitId: Readonly<Record<string, string>>;
}

export function entradaDeRender(
  unit: BattleUnit,
  px: number,
  py: number,
  state: UnitRenderState,
  { theme, tileSize, uiScale, heroesByUnitId, artIdByUnitId }: ContextoDeRender,
): UnitRenderInput {
  // §6.9 — quantos efeitos ativos de cada polaridade. Quem resolve `ActiveEffect.id` →
  // `EffectDef.kind` é aqui, contra o catálogo: o renderer é puro e não conhece catálogo.
  let buffs = 0;
  let debuffs = 0;
  for (const efeito of unit.effects) {
    const kind = catalog.effects[efeito.id]?.kind;
    if (kind === 'buff') buffs++;
    else if (kind === 'debuff') debuffs++;
  }

  // Nível 1 do glifo (D1). M18 7/N — `heroesByUnitId` deixou de ser derivado do conteúdo
  // local e passa a ser montado do roster do servidor toda vez que uma batalha nasce de
  // um ticket. Com isso ele fala das unidades de QUALQUER modo, e a condição de campanha
  // saiu: quem não está no mapa (inimigo, aliado de cenário, reforço) simplesmente não
  // tem entrada, e o glifo cai no nível seguinte como sempre caiu.
  const classId = catalog.classes[heroesByUnitId[unit.unitId]?.classId ?? '']?.id;

  // M26 — a chave da unidade no manifesto de arte. Mesma inversão do `classId`: quem sabe
  // ligar uma unidade de batalha ao conteúdo que a montou é este componente, contra o roster;
  // o renderer continua puro. Ver `artIdDeUnidade` para por que os dois lados usam campos
  // diferentes de `BattleUnit`.
  const artId = artIdDeUnidade(heroesByUnitId, unit, artIdByUnitId);

  return {
    unit: {
      side: unit.side as 'player' | 'enemy',
      ap: unit.ap,
      pp: unit.pp,
      hp: unit.hp,
      // `stats.hp` é o HP MÁXIMO resolvido (§4.1); `unit.hp` é o atual.
      maxHp: unit.stats.hp,
      hasActedThisRound: unit.hasActedThisRound,
      buffs,
      debuffs,
      ...(classId ? { classId } : {}),
      // Nível 2 — o perfil, que todo `BattleUnit` carrega.
      weaponType: unit.weaponType,
      unitType: unit.unitType,
      ...(artId ? { artId } : {}),
    },
    tile: { px, py, size: tileSize },
    state,
    theme,
    // §11 — "AP/PP de cada unidade legíveis no próprio tile (sem hover)". A fonte escala
    // com a UI: é o único jeito de este requisito valer pra quem precisa de texto maior.
    labelSize: Math.round(BASE_LABEL_SIZE * uiScale),
  };
}
