import {
  computeReachableTiles,
  isControlObject,
  manhattanDistance,
  openGateCoords,
  type BattleState,
  type BattleUnit,
  type Coord,
  type DuelResult,
} from '@paths-beyond/core';
import { Application, Assets, Container, Graphics, Sprite, Text, Texture, type Ticker } from 'pixi.js';
import { useEffect, useRef } from 'react';
import { narrateAiTurns, type AiScene } from '../data/aiNarration.js';
import { catalog } from '../data/catalog.js';
import {
  IMPACT_PEAK_AT,
  damageAnchorDirection,
  damageNumberMotion,
  deathMotion,
  duelBeats,
  impactMotion,
  moveMotion,
  shakeMotion,
  weightFor,
  type Motion,
  type MotionSample,
} from '../data/motion.js';
import { terrainMarkInkFor, themeFor, type OverlayTheme } from '../data/overlayTheme.js';
import { placeShapes, type Primitive } from '../data/shapes.js';
import { structureMarkFor } from '../data/structureMarks.js';
import { terrainMarkFor } from '../data/terrainMarks.js';
import { patternPrimitives } from '../data/tilePatterns.js';
import { activeUnitRenderer, type UnitRenderInput, type UnitRenderState } from '../data/unitRenderer.js';
import { artIdDeUnidade, urlsDeArte } from '../data/unitArt.js';
import { rolagemParaEnquadrar } from '../logic/enquadramento.js';
import { audioDoJogo } from '../audio/motorCompartilhado.js';
import { somDaBatida, type SomAgendado } from '../audio/sons.js';
import { classDefForUnit, useBattleStore } from '../store/battleStore.js';

// Tamanho do tile em escala 1. O tamanho real é este vezes a escala de UI (§11 — "fonte
// escalável"): o mapa cresce junto com os painéis, senão o rótulo de AP/PP no tile, que
// §11 exige legível sem hover, continuaria em 10px enquanto o resto da tela dobra.
// M26 — o tile subiu de 36 para 64, e o quadro da arte acompanha.
//
// A medição de 1/N mediu na tela o que D25 tinha deixado em aberto, e corrigiu uma premissa
// dela no caminho: "escala não-inteira é aceitável" vale para AMPLIAR, não para reduzir —
// vizinho-mais-próximo não faz média, ele descarta linhas de pixel. Um quadro de 64 desenhado
// num tile de 36 perde quase metade das linhas e a espada vira um tracejado.
//
// Daí a regra que substitui a pergunta "48 ou 64": **o quadro é igual ao tile a 100%**, e toda
// escala de §11 acima disso é uma ampliação, que é o caso que D25 já tinha aprovado.
//
// O preço, escolhido pelo usuário de olhos abertos: um mapa 20×15 a 175% pede 2240px e não cabe
// em 1080p. Ele é pago pela rolagem do tabuleiro (ver `logic/enquadramento.ts`), e não por
// cortar as escalas de acessibilidade, que são requisito duro de §11.
const BASE_TILE_SIZE = 64;
const BASE_LABEL_SIZE = 10;
// O número de dano é maior que o rótulo de AP/PP de propósito: ele aparece por meio segundo em
// cima da peça e some, enquanto o rótulo fica. Um efêmero pequeno não é lido a tempo.
const DAMAGE_LABEL_RATIO = 1.4;
const LABEL_COLOR = 0xffffff;
// M16 4/N — a pausa entre duas CENAS. Existe para separar duas peças que agem em sequência: sem
// ela o segundo inimigo já está avançando enquanto o primeiro ainda assenta, e o olho lê os dois
// como um borrão só. Dentro de uma cena não há pausa nenhuma — o contra-ataque emenda no golpe,
// que é o que acontece de verdade (§6.4).
const SCENE_GAP_MS = 90;

// M16 3/N — o estado parado, para a unidade que participa de uma sequência mas não está se
// mexendo neste quadro. Vale como identidade: a peça é desenhada onde o core diz que ela está.
const PARADA: MotionSample = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, alpha: 1, done: false };

// Um trecho de animação de uma peça. A origem e o RETRATO da peça são do trecho, e não da
// faixa: numa cadeia de cenas (M16 4/N) a mesma unidade anda numa, apanha na seguinte e cai na
// terceira, cada uma partindo de um tile diferente e com o HP daquele instante. Presos à faixa,
// a peça saltaria de volta ao tile inicial no começo de cada cena e a barra de HP mostraria o
// turno inteiro o valor de antes da primeira pancada.
interface FxSegment {
  readonly startMs: number;
  readonly motion: Motion;
  readonly origin: { readonly px: number; readonly py: number };
  readonly unit: BattleUnit;
}

// Uma unidade dentro de uma sequência de animação, com os trechos que a movem ao longo dela.
// Trechos e não itens soltos porque a MESMA peça participa de várias batidas (ela golpeia, leva
// o contra-ataque, cai) e desenhá-la uma vez por trecho a duplicaria na tela. A regra de
// composição é "vale o último trecho que já começou": um contra-ataque interrompe o tremor do
// golpe anterior, que é o que acontece de verdade.
interface FxUnitTrack {
  readonly unitId: string;
  readonly segments: readonly FxSegment[];
}

interface FxFloater {
  readonly startMs: number;
  readonly motion: Motion;
  readonly text: string;
  readonly center: { readonly x: number; readonly y: number };
}

function tileCenter(coord: Coord, tileSize: number): { x: number; y: number } {
  return { x: coord.x * tileSize + tileSize / 2, y: coord.y * tileSize + tileSize / 2 };
}

function tileKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

// A tradução primitiva -> Pixi, no nível do `Graphics`: desenha as formas de uma lista dentro
// de um `Graphics` que já existe (o do tile, que carrega o hit-test do clique). Texto não entra
// aqui — `Text` é filho do `Container`, não do `Graphics`.
//
// Este é o ÚNICO ponto do cliente que sabe ao mesmo tempo o que foi descrito e como o Pixi
// desenha. Manter isso num lugar só é o que torna a costura trocável: glifo de classe, marca de
// terreno, padrão de overlay e representação de unidade falam todos a mesma língua de dado puro
// e passam todos por aqui.
function applyPrimitives(g: Graphics, primitives: readonly Primitive[]): void {
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
function terrainMarkPrimitives(
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

// §11 — "Overlay de movimento e de ameaça". Ameaça = tiles que uma unidade inimiga viva
// consegue alcançar (moveRange) e, de lá, engajar (duelRange). Simplificação de M6: não
// considera ZoC/ocupação ao redor de OUTROS inimigos, só do próprio mapa — refinamento
// fica pra uma fatia futura de polish.
function computeThreatenedTiles(battleState: ReturnType<typeof useBattleStore.getState>['battleState']): Set<string> {
  const threatened = new Set<string>();
  const enemies = battleState.units.filter((u) => u.side === 'enemy' && u.hp > 0);

  for (const enemy of enemies) {
    const allies = battleState.units.filter((u) => u.side === enemy.side && u.unitId !== enemy.unitId && u.hp > 0).map((u) => u.pos);
    const foes = battleState.units.filter((u) => u.side !== enemy.side && u.hp > 0).map((u) => u.pos);
    const reachable = computeReachableTiles(
      {
        map: battleState.map,
        moveType: enemy.moveType,
        occupiedByAlly: allies,
        occupiedByEnemy: foes,
        // §5.1 (M15) — sem isto a ameaça atravessaria muralha: o jogador se acharia em
        // perigo atrás de uma parede que o inimigo não pode cruzar.
        openGates: openGateCoords(battleState),
      },
      enemy.pos,
      enemy.moveRange,
    );
    const fromTiles = [enemy.pos, ...reachable.map((r) => r.coord)];
    for (const from of fromTiles) {
      for (let dx = -enemy.duelRange; dx <= enemy.duelRange; dx++) {
        for (let dy = -enemy.duelRange; dy <= enemy.duelRange; dy++) {
          const candidate = { x: from.x + dx, y: from.y + dy };
          if (manhattanDistance(from, candidate) > enemy.duelRange) continue;
          if (candidate.x < 0 || candidate.y < 0 || candidate.x >= battleState.map.width || candidate.y >= battleState.map.height) continue;
          threatened.add(tileKey(candidate));
        }
      }
    }
  }

  return threatened;
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
function paintPrimitives(layer: Container, primitives: readonly Primitive[]): void {
  let g: Graphics | null = null;

  for (const p of primitives) {
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

function unitAt(units: readonly BattleUnit[], coord: Coord): BattleUnit | undefined {
  return units.find((u) => u.hp > 0 && u.pos.x === coord.x && u.pos.y === coord.y);
}

// Inimigos que a unidade selecionada pode engajar agora mesmo (dentro do duelRange, a
// partir da posição atual — sem contar movimento pendente).
function computeEngageableEnemyIds(units: readonly BattleUnit[], selectedUnit: BattleUnit | undefined): Set<string> {
  const ids = new Set<string>();
  if (!selectedUnit || selectedUnit.hasActedThisRound) return ids;
  for (const unit of units) {
    if (unit.hp <= 0 || unit.side === selectedUnit.side) continue;
    if (manhattanDistance(selectedUnit.pos, unit.pos) <= selectedUnit.duelRange) ids.add(unit.unitId);
  }
  return ids;
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const layerRef = useRef<Container | null>(null);
  // A camada das animações, por cima do tabuleiro. Separada porque o `redraw()` limpa a camada
  // do tabuleiro inteira, e uma sequência em andamento não pode morrer porque a seleção mudou.
  // Quem está sendo animado é escondido do tabuleiro e desenhado aqui.
  const fxLayerRef = useRef<Container | null>(null);
  const fxRunningRef = useRef(false);
  // M26 2/N — o que falta contar DEPOIS que a cena de duelo fechar.
  //
  // A sequência de um quadro é intercalada: a IA anda, engaja, anda de novo. Com a cena
  // ligada, o tabuleiro toca até o primeiro duelo, entrega o duelo à cena e guarda o resto
  // aqui. Sem esta ref, a alternativa seria tocar todos os movimentos e só então todos os
  // duelos — o que conta a mesma batalha na ordem errada.
  const cenasPendentesRef = useRef<readonly AiScene[] | null>(null);
  const hiddenUnitIdsRef = useRef<ReadonlySet<string>>(new Set());
  // M16 4/N — o último relato de turno de IA já contado. O relato traz o estado junto, então
  // "é de outra batalha" se resolve por comparação; esta ref resolve a outra metade, "já
  // contei este", que sem ela faria a cadeia inteira tocar de novo a cada mudança de seleção.
  const relatoConsumidoRef = useRef<ReturnType<typeof useBattleStore.getState>['aiTurnReport']>(null);
  // O estado e o preview do quadro ANTERIOR. É como o mapa descobre que um duelo foi confirmado
  // sem que o painel de preview (quem tem o botão) precise saber que existe canvas: o preview
  // sumiu e o estado mudou, logo foi confirmado; sumiu e o estado é o mesmo, foi cancelado. A
  // animação precisa das unidades de ANTES — o duelo já matou uma delas no estado novo, e uma
  // peça que não existe mais não tem como cair na tela.
  const previousRef = useRef<{
    state: BattleState;
    preview: ReturnType<typeof useBattleStore.getState>['duelPreview'];
  } | null>(null);

  const battleState = useBattleStore((s) => s.battleState);
  const selectedUnitId = useBattleStore((s) => s.selectedUnitId);
  const reachableTiles = useBattleStore((s) => s.reachableTiles);
  const duelPreview = useBattleStore((s) => s.duelPreview);
  const instantResultMode = useBattleStore((s) => s.instantResultMode);
  const selectUnit = useBattleStore((s) => s.selectUnit);
  const moveSelectedUnitTo = useBattleStore((s) => s.moveSelectedUnitTo);
  const previewEngage = useBattleStore((s) => s.previewEngage);
  const targetingMode = useBattleStore((s) => s.targetingMode);
  const confirmTargetAt = useBattleStore((s) => s.confirmTargetAt);
  const colorblindMode = useBattleStore((s) => s.colorblindMode);
  const setBoardAnimating = useBattleStore((s) => s.setBoardAnimating);
  const aiTurnReport = useBattleStore((s) => s.aiTurnReport);
  const uiScale = useBattleStore((s) => s.uiScale);
  // Só para resolver a CLASSE da unidade (nível 1 do glifo, D1): `BattleUnit` não carrega
  // `classId`, e D4 proíbe mexer em `packages/core` neste milestone.
  const mode = useBattleStore((s) => s.mode);
  const heroesByUnitId = useBattleStore((s) => s.heroesByUnitId);
  // M26 3/N — o mapa de arte do servidor. É o que dá peça a PvP, masmorra e replay, onde o
  // roster não alcança as unidades do outro lado.
  const artIdByUnitId = useBattleStore((s) => s.artIdByUnitId);
  // M26 2/N — enquanto a cena de duelo conta o golpe, o tabuleiro NÃO anima nada.
  // Sem isto o turno da IA rodaria atrás da tela e o jogador voltaria para um tabuleiro
  // diferente do que deixou — e o duelo seria contado duas vezes, uma em cada lugar.
  const duelScene = useBattleStore((s) => s.duelScene);
  const duelSceneEnabled = useBattleStore((s) => s.duelSceneEnabled);
  const abrirCenaDeDuelo = useBattleStore((s) => s.abrirCenaDeDuelo);

  const theme = themeFor(colorblindMode);
  const tileSize = Math.round(BASE_TILE_SIZE * uiScale);

  // A montagem da entrada do renderer, num lugar só: o tabuleiro e o "fantasma" da animação
  // desenham a MESMA unidade, e duplicar isto era o caminho para uma unidade perder o glifo (ou
  // a barra de HP) justamente enquanto anda, que é quando o jogador está olhando para ela.
  function unitRenderInput(unit: BattleUnit, px: number, py: number, state: UnitRenderState): UnitRenderInput {
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
    const classId = classDefForUnit(heroesByUnitId, unit.unitId)?.id;

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

  // §11 — "modo resultado instantâneo (pula animações)". As duas sequências abaixo passam por
  // aqui, e nenhuma delas muda um estado de batalha: o core decidiu tudo antes do primeiro
  // quadro, e a animação só conta o que já foi decidido (D4).
  //
  // Este é o ÚNICO ponto do cliente com relógio. O que cada movimento faz — a velocidade com
  // pico no meio, o recuo antes do golpe, o assentamento na chegada — é função pura de tempo em
  // `data/motion.ts`, testável sem browser e sem Pixi. Aqui só sobra somar `deltaMS` e
  // posicionar `Container`.

  function paintFxUnit(parent: Container, segment: FxSegment, sample: MotionSample) {
    // A peça é desenhada em coordenadas locais do tile e posicionada pelo `Container`: é o que
    // permite escalar em torno do CENTRO (o `pivot`) sem recalcular uma primitiva sequer, e é o
    // que mantém a costura de 1/N intacta — a animação não sabe desenhar unidade nenhuma.
    const peca = new Container();
    paintPrimitives(
      peca,
      activeUnitRenderer.render(unitRenderInput(segment.unit, 0, 0, { selected: false, engageable: false })),
    );
    peca.pivot.set(tileSize / 2, tileSize / 2);
    peca.position.set(segment.origin.px + tileSize / 2 + sample.dx, segment.origin.py + tileSize / 2 + sample.dy);
    peca.scale.set(sample.scaleX, sample.scaleY);
    peca.alpha = sample.alpha;
    parent.addChild(peca);
  }

  function paintFxFloater(parent: Container, floater: FxFloater, sample: MotionSample) {
    // Branco com contorno na tinta da plaqueta de AP/PP: o número de dano NÃO gasta uma cor nova
    // do mapa. A paleta segura de M13 4/N já ocupou o canal de matiz com significado (ameaça,
    // movimento, mira, objetivo, os dois lados), e o que este número precisa dizer — quanto
    // doeu — está escrito nele. O que o separa do rótulo fixo é a posição e o movimento.
    const label = new Text({
      text: floater.text,
      style: {
        fontSize: Math.round(BASE_LABEL_SIZE * uiScale * DAMAGE_LABEL_RATIO),
        fill: LABEL_COLOR,
        fontWeight: 'bold',
        stroke: { color: theme.tokens.labelPlate, width: 3 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(floater.center.x + sample.dx, floater.center.y + sample.dy);
    label.alpha = sample.alpha;
    parent.addChild(label);
  }

  function runFx(tracks: readonly FxUnitTrack[], floaters: readonly FxFloater[], onDone: () => void) {
    const app = appRef.current;
    const fx = fxLayerRef.current;
    const total = Math.max(
      0,
      ...tracks.flatMap((t) => t.segments.map((seg) => seg.startMs + seg.motion.durationMs)),
      ...floaters.map((f) => f.startMs + f.motion.durationMs),
    );
    if (!app || !fx || total <= 0) {
      onDone();
      return;
    }

    hiddenUnitIdsRef.current = new Set(tracks.map((t) => t.unitId));
    fxRunningRef.current = true;
    setBoardAnimating(true);
    redraw();

    let elapsed = 0;
    const desenhar = () => {
      fx.removeChildren();
      for (const track of tracks) {
        // "Vale o último trecho que já começou": uma peça pode golpear, apanhar o contra-ataque
        // e cair na mesma sequência, e o trecho seguinte interrompe o anterior em vez de somar.
        // Passado o fim de um trecho, `sampleAt` devolve o estado final dele — a peça parada no
        // lugar, ou desvanecida se o trecho era a morte.
        let ativo: FxSegment | undefined;
        for (const seg of track.segments) if (elapsed >= seg.startMs) ativo = seg;
        // Antes do primeiro trecho a peça é desenhada parada na origem DELE, que é onde o core
        // diz que ela está enquanto a cena de outra unidade acontece.
        const base = ativo ?? track.segments[0];
        if (!base) continue;
        paintFxUnit(fx, base, ativo ? ativo.motion.sampleAt(elapsed - ativo.startMs) : PARADA);
      }
      for (const floater of floaters) {
        if (elapsed < floater.startMs || elapsed > floater.startMs + floater.motion.durationMs) continue;
        paintFxFloater(fx, floater, floater.motion.sampleAt(elapsed - floater.startMs));
      }
    };

    const tick = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      desenhar();
      if (elapsed >= total) {
        app.ticker.remove(tick);
        // O último quadro FICA na tela até o `redraw()` seguinte apagar a camada. Apagar aqui
        // produzia um buraco: `onDone` commita o estado, o `redraw()` do tabuleiro só acontece
        // no efeito que reage a esse commit, e no meio disso o tabuleiro estava desenhado SEM a
        // unidade (ela seguia escondida) e a camada de FX já vazia — a peça sumia por alguns
        // quadros no fim de todo movimento. Defeito VISTO em navegador nesta fatia, não
        // previsto; e ele não aparece em teste porque só existe na costura com o relógio.
        // Como a animação termina exatamente no destino (`moveMotion`, testado), o quadro
        // congelado é indistinguível do que o tabuleiro desenha em seguida.
        fxRunningRef.current = false;
        hiddenUnitIdsRef.current = new Set();
        setBoardAnimating(false);
        onDone();
      }
    };

    desenhar();
    app.ticker.add(tick);
  }

  // A cadeia de cenas, montada num `runFx` SÓ. Um `runFx` por cena seria mais simples de
  // escrever e traria de volta o defeito que 3/N corrigiu: `boardAnimating` desceria na fresta
  // entre duas cenas e o desfecho caberia ali. Como cada trecho já carrega o próprio começo,
  // empilhar cenas é somar offsets — e a sequência inteira vira uma coisa só, do primeiro
  // quadro ao último.
  function playScenes(scenes: readonly AiScene[], onDone: () => void) {
    const porUnidade = new Map<string, FxSegment[]>();
    const floaters: FxFloater[] = [];
    const sons: SomAgendado[] = [];
    let inicio = 0;

    const acrescentar = (unitId: string, segment: FxSegment) => {
      const lista = porUnidade.get(unitId) ?? [];
      lista.push(segment);
      porUnidade.set(unitId, lista);
    };

    for (const scene of scenes) {
      const duracao =
        scene.kind === 'move'
          ? montarMovimento(scene, inicio, acrescentar)
          : montarDuelo(scene, inicio, acrescentar, floaters, (som) => sons.push(som));
      // Cena sem imagem (a peça sumiu, o duelo não teve batida) não abre buraco no tempo.
      if (duracao <= 0) continue;
      inicio += duracao + SCENE_GAP_MS;
    }

    const tracks: FxUnitTrack[] = [];
    for (const [unitId, segments] of porUnidade) {
      tracks.push({ unitId, segments: [...segments].sort((a, b) => a.startMs - b.startMs) });
    }
    // Uma chamada só, com a sequência inteira: é `tocarSequencia` que descarta o que viraria
    // borrão quando várias unidades agem em fila.
    audioDoJogo().tocarSequencia(sons);
    runFx(tracks, floaters, onDone);
  }

  // O movimento ao longo do caminho que o core relatou. O do jogador (antes do commit) e o da
  // IA (depois dele) passam pelo MESMO código: são a mesma coisa vista de dois lados, e mantê-
  // los separados era o caminho para o inimigo andar diferente do herói. Devolve a duração.
  function montarMovimento(
    scene: Extract<AiScene, { kind: 'move' }>,
    offsetMs: number,
    acrescentar: (unitId: string, segment: FxSegment) => void,
  ): number {
    const unit = scene.stateBefore.units.find((u) => u.unitId === scene.unitId);
    const origem = scene.path[0];
    if (!unit || !origem || scene.path.length < 2) return 0;

    const motion = moveMotion(
      scene.path.map((coord) => tileCenter(coord, tileSize)),
      weightFor(unit.unitType),
    );
    acrescentar(unit.unitId, {
      startMs: offsetMs,
      motion,
      origin: { px: origem.x * tileSize, py: origem.y * tileSize },
      unit,
    });
    return motion.durationMs;
  }

  // O duelo, tocado a partir do log que o core já produziu (§6: até 3 trocas, resolvidas de uma
  // vez). Quem decide a ordem das batidas é `duelBeats`, puro e testado; aqui só se resolve a
  // geometria — quem bate em que direção, e onde o número aparece.
  function montarDuelo(
    scene: Extract<AiScene, { kind: 'duel' }>,
    offsetMs: number,
    acrescentar: (unitId: string, segment: FxSegment) => void,
    floaters: FxFloater[],
    // M24 — o som entra pela MESMA linha do tempo da animação, e não por um relógio próprio:
    // é o que garante que a batida que se ouve é a que se vê, e que a pausa entre cenas
    // (`SCENE_GAP_MS`) vale para os dois.
    soar: (som: SomAgendado) => void = () => {},
  ): number {
    const unidade = (id: string) => scene.stateBefore.units.find((u) => u.unitId === id);
    const posicionar = (unit: BattleUnit) => ({ px: unit.pos.x * tileSize, py: unit.pos.y * tileSize });
    // Quem está de pé no instante desta cena. É o que impede o número de dano de nascer em cima
    // de outra peça — ver `damageAnchorDirection`.
    const ocupados = new Set(scene.stateBefore.units.filter((u) => u.hp > 0).map((u) => tileKey(u.pos)));
    let cursor = offsetMs;

    for (const beat of duelBeats(scene.duelResult)) {
      const ator = unidade(beat.actorId);
      if (!ator) continue;

      if (beat.kind === 'death') {
        const queda = deathMotion(tileSize, weightFor(ator.unitType));
        acrescentar(ator.unitId, { startMs: cursor, motion: queda, origin: posicionar(ator), unit: ator });
        const somDaMorte = somDaBatida('death');
        if (somDaMorte) soar({ som: somDaMorte, atMs: cursor });
        cursor += queda.durationMs;
        continue;
      }

      // A cura não tem animação (curar não sacode ninguém) e por isso não consome tempo: ela
      // soa no instante em que aconteceu, dentro da troca.
      if (beat.kind === 'heal') {
        const somDaCura = somDaBatida('heal');
        if (somDaCura) soar({ som: somDaCura, atMs: cursor });
        continue;
      }

      const alvo = unidade(beat.targetId);
      if (!alvo) continue;

      const golpe = impactMotion(
        { x: alvo.pos.x - ator.pos.x, y: alvo.pos.y - ator.pos.y },
        tileSize,
        weightFor(ator.unitType),
      );
      acrescentar(ator.unitId, { startMs: cursor, motion: golpe, origin: posicionar(ator), unit: ator });
      // O tremor do alvo e o número saem no instante da BATIDA, e não no começo do golpe: imagem
      // e impacto chegando em momentos diferentes é o jeito mais barato de um golpe perder peso.
      const batida = cursor + golpe.durationMs * IMPACT_PEAK_AT;
      // O som sai na BATIDA e não no começo do golpe, pelo mesmo motivo que o tremor e o
      // número saem: imagem e impacto em instantes diferentes é o jeito mais barato de um
      // golpe perder peso — e som fora de hora é pior que som nenhum.
      const somDoGolpe = somDaBatida(beat.kind);
      if (somDoGolpe) soar({ som: somDoGolpe, atMs: batida });
      acrescentar(alvo.unitId, {
        startMs: batida,
        motion: shakeMotion(tileSize, weightFor(alvo.unitType)),
        origin: posicionar(alvo),
        unit: alvo,
      });
      // O número nasce FORA do tile do alvo, e não no centro dele. Nascendo no centro ele subia
      // atravessando a plaqueta de AP/PP (canto superior esquerdo, opaca) e os dois viravam um
      // borrão — o MESMO defeito que 2/N corrigiu entre o número e o glifo, visto de novo em
      // navegador em 3/N. Qual lado de fora é escolhido em 4/N, e não fixo: num corpo a corpo
      // as duas peças são adjacentes, e "sempre em cima" punha o número do golpe em cima de
      // quem golpeou. O deslocamento horizontal é maior que o vertical porque o número é largo
      // e baixo: 0,62 tile para o lado ainda o deixaria com metade sobre a peça vizinha.
      const centro = tileCenter(alvo.pos, tileSize);
      const saida = damageAnchorDirection(alvo.pos, ocupados, scene.stateBefore.map);
      floaters.push({
        startMs: batida,
        motion: damageNumberMotion(tileSize),
        text: String(beat.damage),
        center: { x: centro.x + saida.x * tileSize * 0.9, y: centro.y + saida.y * tileSize * 0.62 },
      });
      cursor += golpe.durationMs;
    }

    return cursor - offsetMs;
  }

  // O movimento do jogador é a única sequência que roda ANTES do commit — é dela que o clique
  // no tile sai. O estado do core só muda quando a animação termina (`moveSelectedUnitTo` no
  // `onDone`), nunca durante: apresentação por cima do que o core já calculou.
  function animateAndMove(unit: BattleUnit, path: readonly Coord[], destination: Coord) {
    if (!appRef.current || !fxLayerRef.current || path.length < 2) {
      moveSelectedUnitTo(destination);
      return;
    }
    playScenes([{ kind: 'move', stateBefore: battleState, unitId: unit.unitId, path }], () =>
      moveSelectedUnitTo(destination),
    );
  }

  useEffect(() => {
    let disposed = false;
    const app = new Application();

    void app
      .init({
        width: battleState.map.width * tileSize,
        height: battleState.map.height * tileSize,
        background: '#111827',
        antialias: true,
      })
      .then(() => {
        if (disposed) {
          app.destroy(true);
          return;
        }
        appRef.current = app;
        containerRef.current?.appendChild(app.canvas);
        const layer = new Container();
        app.stage.addChild(layer);
        layerRef.current = layer;
        // Acrescentada DEPOIS do tabuleiro: a peça que golpeia passa por cima das vizinhas, e o
        // número de dano por cima de tudo. Ordem de filho é ordem de desenho no Pixi.
        const fx = new Container();
        app.stage.addChild(fx);
        fxLayerRef.current = fx;
        redraw();

        // M26 — as texturas das peças. `Texture.from` lê do cache do Pixi, então sem este
        // carregamento a primeira pintura sairia com a textura vazia e a unidade apareceria
        // como um retângulo branco. O `redraw()` acima acontece de qualquer jeito (o tabuleiro
        // não pode esperar a rede para aparecer) e este segundo troca o glifo pela peça quando
        // a imagem chega — degradar é sempre um tabuleiro jogável, nunca uma tela vazia.
        const urls = urlsDeArte();
        if (urls.length > 0) {
          void Assets.load([...urls]).then(() => {
            if (!disposed) redraw();
          });
        }
      });

    return () => {
      disposed = true;
      layerRef.current = null;
      fxLayerRef.current = null;
      fxRunningRef.current = false;
      // Desmontar no meio de uma sequência não pode deixar o desfecho preso atrás de uma
      // animação que não existe mais.
      setBoardAnimating(false);
      appRef.current?.destroy(true);
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // A campanha real (M12, sub-sessão 3/N) deixou de ser toda 15×15: há mapas 16×16,
    // 18×18 e 20×15. O `Application` é inicializado uma vez com o tamanho do primeiro
    // mapa, então sem este resize os capítulos maiores apareceriam cortados ao avançar.
    const app = appRef.current;
    const width = battleState.map.width * tileSize;
    const height = battleState.map.height * tileSize;
    if (app && (app.renderer.width !== width || app.renderer.height !== height)) {
      app.renderer.resize(width, height);
    }

    // O duelo que acabou de ser confirmado, deduzido da transição: havia preview, não há mais, e
    // o estado mudou. Cancelar deixa o estado igual, e é o que separa os dois casos sem precisar
    // de um campo novo no store nem de o painel de preview saber que existe um canvas.
    const anterior = previousRef.current;
    previousRef.current = { state: battleState, preview: duelPreview };
    const confirmado =
      anterior && anterior.preview && !duelPreview && battleState !== anterior.state ? anterior.preview : null;

    redraw();
    enquadrarSelecionada();

    // A cena de duelo está no ar: o tabuleiro já foi redesenhado com o estado novo, e nada
    // mais acontece aqui. `relatoConsumidoRef` NÃO é marcada, então o turno da IA continua
    // pendente e toca quando a cena fechar — este efeito roda de novo, porque `duelScene` é
    // dependência dele.
    if (duelScene) return;

    // A cena acabou de fechar e havia mais para contar: retoma de onde parou, sem passar pela
    // montagem de cenas de novo (o `confirmado` daquele quadro já foi consumido).
    const pendentes = cenasPendentesRef.current;
    if (pendentes) {
      cenasPendentesRef.current = null;
      tocarComCenaDeDuelo(pendentes);
      return;
    }

    // M16 4/N — o relato do turno da IA que veio DEPOIS deste comando. Duas condições, e as
    // duas são necessárias: `state === battleState` descarta relato de outra batalha (trocar de
    // capítulo, entrar numa masmorra, abrir um replay), e a ref descarta o que já foi contado —
    // este efeito também roda quando só a seleção muda, e sem ela o turno inteiro tocaria de
    // novo a cada clique.
    const relato =
      aiTurnReport && aiTurnReport.state === battleState && aiTurnReport !== relatoConsumidoRef.current
        ? aiTurnReport
        : null;
    if (relato) relatoConsumidoRef.current = relato;

    // §11 — "modo resultado instantâneo (pula animações), essencial para farm": nada toca. Quem
    // BAIXA a trava do desfecho é sempre este componente, inclusive aqui: `relatoDaIa` no store
    // pode tê-la levantado, e um caminho de saída que não a baixasse deixaria o "Vitória!" preso
    // para sempre.
    if (instantResultMode || fxRunningRef.current) {
      if (relato) setBoardAnimating(false);
      return;
    }

    // A cadeia do quadro, na ordem em que aconteceu: o duelo que o jogador confirmou e, em
    // seguida, o turno que a IA jogou em resposta. Até 3/N a segunda metade não existia e os
    // inimigos teletransportavam.
    const scenes: AiScene[] = [];
    if (confirmado && anterior) {
      scenes.push({ kind: 'duel', stateBefore: anterior.state, duelResult: confirmado.duelResult });
    }
    if (relato) scenes.push(...narrateAiTurns(relato.steps));

    if (scenes.length === 0) {
      if (relato) setBoardAnimating(false);
      return;
    }
    tocarComCenaDeDuelo(scenes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    battleState,
    selectedUnitId,
    reachableTiles,
    duelPreview,
    targetingMode,
    colorblindMode,
    uiScale,
    mode,
    heroesByUnitId,
    artIdByUnitId,
    aiTurnReport,
    duelScene,
  ]);

  // M26 — com o tile em 64 o tabuleiro rola, e uma seleção fora da janela é uma seleção
  // invisível (§1.1). A REGRA de para onde rolar é pura e está em `logic/enquadramento.ts`;
  // aqui só sobra ler o tamanho da janela e escrever `scrollLeft`, do mesmo jeito que o único
  // relógio do cliente mora neste arquivo e o movimento em si mora em `motion.ts`.
  function enquadrarSelecionada() {
    const caixa = containerRef.current;
    const unidade = battleState.units.find((u) => u.unitId === selectedUnitId && u.hp > 0);
    if (!caixa || !unidade) return;

    const { scrollLeft, scrollTop } = rolagemParaEnquadrar(
      {
        scrollLeft: caixa.scrollLeft,
        scrollTop: caixa.scrollTop,
        largura: caixa.clientWidth,
        altura: caixa.clientHeight,
        conteudoLargura: battleState.map.width * tileSize,
        conteudoAltura: battleState.map.height * tileSize,
      },
      { px: unidade.pos.x * tileSize, py: unidade.pos.y * tileSize, size: tileSize },
    );
    caixa.scrollLeft = scrollLeft;
    caixa.scrollTop = scrollTop;
  }

  // M26 2/N — tocar uma sequência de cenas ENTREGANDO os duelos para a tela.
  //
  // O tabuleiro anima até o primeiro duelo; o duelo abre a cena; o resto espera na ref e volta
  // quando ela fechar. Com a cena desligada (ou se ela não puder ser montada) o caminho é o de
  // M16 4/N, intocado — o duelo é contado com impacto e tremor no próprio tile.
  function tocarComCenaDeDuelo(cenas: readonly AiScene[]) {
    if (cenas.length === 0) {
      redraw();
      setBoardAnimating(false);
      return;
    }

    const usaCena = duelSceneEnabled && !instantResultMode;
    const i = usaCena ? cenas.findIndex((c) => c.kind === 'duel') : -1;
    if (i < 0) {
      playScenes(cenas, () => redraw());
      return;
    }

    const antes = cenas.slice(0, i);
    const duelo = cenas[i] as Extract<AiScene, { kind: 'duel' }>;
    const depois = cenas.slice(i + 1);

    const entregar = () => {
      redraw();
      if (abrirCenaDeDuelo(duelo.stateBefore, duelo.duelResult)) {
        cenasPendentesRef.current = depois;
        return;
      }
      // Não deu para montar a cena: o duelo é contado no tabuleiro, como sempre.
      tocarComCenaDeDuelo([duelo, ...depois]);
    };

    if (antes.length === 0) entregar();
    else playScenes(antes, entregar);
  }

  function redraw() {
    const layer = layerRef.current;
    if (!layer) return;
    layer.removeChildren();
    // A camada de FX só é apagada quando NÃO há sequência em andamento: fora de uma animação
    // ela é lixo do quadro anterior; durante uma, ela é o que o jogador está olhando.
    if (!fxRunningRef.current) fxLayerRef.current?.removeChildren();

    const { map, units } = battleState;
    const reachableSet = new Set(reachableTiles.map((t) => tileKey(t.coord)));
    const threatened = computeThreatenedTiles(battleState);
    const selectedUnit = selectedUnitId ? units.find((u) => u.unitId === selectedUnitId) : undefined;
    const engageableEnemyIds = computeEngageableEnemyIds(units, selectedUnit);
    const targetableSet = new Set((targetingMode?.tiles ?? []).map(tileKey));
    // O tile que a condição de vitória nomeia (§5.7). `rout`/`surviveRounds` não têm tile
    // — a condição não é sobre lugar nenhum.
    const objectiveTile =
      'target' in battleState.winCondition ? (battleState.winCondition.target as Coord) : undefined;
    // §5.1/§5.6 (M15) — portões já abertos e objetivos já capturados. Os dois vêm do
    // ESTADO da batalha, não do mapa: o mapa é a fase, isto é a partida.
    const openGateSet = new Set(openGateCoords(battleState).map(tileKey));
    const capturedSet = new Set(battleState.capturedObjectives ?? []);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y]?.[x];
        const terrainId = tile?.terrain ?? 'terrain-planicie';
        const color = theme.terrain[terrainId] ?? theme.terrainFallback;
        const px = x * tileSize;
        const py = y * tileSize;

        const g = new Graphics();
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
        if (threatened.has(tileKey({ x, y }))) {
          g.rect(px, py, tileSize - 1, tileSize - 1).fill({ color: theme.threat.color, alpha: theme.threat.alpha });
          applyPrimitives(g, patternPrimitives(theme.threat.pattern, px, py, tileSize - 1, theme.threat.color));
        }
        if (reachableSet.has(tileKey({ x, y }))) {
          g.rect(px, py, tileSize - 1, tileSize - 1).fill({ color: theme.move.color, alpha: theme.move.alpha });
          applyPrimitives(g, patternPrimitives(theme.move.pattern, px, py, tileSize - 1, theme.move.color));
        }
        // Alcance de lançamento da skill de mapa / do Valor em mira (§5.4/§5.6).
        if (targetableSet.has(tileKey({ x, y }))) {
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
          const aberto = objeto === 'gate' && openGateSet.has(tileKey({ x, y }));
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
          if (capturedSet.has(tileKey({ x, y }))) {
            // Já capturado: o quadrado cheio no canto diz que aquele +2 não paga de novo.
            const mark = Math.max(3, Math.round(tileSize / 5));
            g.rect(px + 4, py + 4, mark, mark).fill(theme.objective.color);
          }
        }
        // O objetivo do mapa, sempre marcado: sem isto um mapa de `seize`/`defend`/
        // `escort` manda o jogador procurar uma coordenada que só existe no JSON.
        if (objectiveTile && objectiveTile.x === x && objectiveTile.y === y) {
          g.rect(px + 2, py + 2, tileSize - 5, tileSize - 5).stroke({ width: 3, color: theme.objective.color });
          applyPrimitives(g, patternPrimitives(theme.objective.pattern, px + 3, py + 3, tileSize - 7, theme.objective.color));
        }
        g.eventMode = 'static';
        g.cursor = 'pointer';
        g.on('pointertap', () => {
          if (duelPreview) return; // precisa confirmar/cancelar o preview antes de outra ação
          if (fxRunningRef.current) return; // uma sequência de animação já está em andamento
          // Em mira, o clique é o alvo — inclusive em cima de unidade (artilharia mira o
          // tile, e o tile pode estar ocupado).
          if (targetingMode) {
            confirmTargetAt({ x, y });
            return;
          }
          const occupant = unitAt(units, { x, y });
          if (occupant) {
            if (selectedUnit && engageableEnemyIds.has(occupant.unitId)) {
              previewEngage(occupant.unitId);
            } else {
              selectUnit(occupant.unitId);
            }
          } else if (selectedUnitId && selectedUnit) {
            const target = reachableTiles.find((t) => t.coord.x === x && t.coord.y === y);
            if (target && !instantResultMode) {
              animateAndMove(selectedUnit, target.path, { x, y });
            } else {
              moveSelectedUnitTo({ x, y });
            }
          }
        });
        layer.addChild(g);
      }
    }

    // M16 1/N — quem decide COMO uma unidade se parece é a costura (`data/unitRenderer.ts`),
    // não este componente. Aqui só sobra traduzir primitiva em objeto de Pixi: é o que deixa a
    // representação testável sem browser e o que permite trocar o renderer sem tocar no canvas.
    for (const unit of units) {
      if (unit.hp <= 0) continue;
      // Quem está sendo animado é desenhado pela camada de FX, com o deslocamento e a escala do
      // quadro. Desenhar aqui também produziria a mesma peça duas vezes, uma delas parada.
      if (hiddenUnitIdsRef.current.has(unit.unitId)) continue;

      paintPrimitives(
        layer,
        activeUnitRenderer.render(
          unitRenderInput(unit, unit.pos.x * tileSize, unit.pos.y * tileSize, {
            selected: unit.unitId === selectedUnitId,
            engageable: engageableEnemyIds.has(unit.unitId),
          }),
        ),
      );
    }
  }

  return <div ref={containerRef} className="map-canvas" />;
}
