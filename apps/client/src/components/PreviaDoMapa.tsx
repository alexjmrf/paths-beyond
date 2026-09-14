import type { Coord } from '@paths-beyond/core';
import { Application, Assets, Container, Graphics, Text } from 'pixi.js';
import { useEffect, useRef } from 'react';
import { themeFor } from '../data/overlayTheme.js';
import { activeUnitRenderer } from '../data/unitRenderer.js';
import { urlsDeArte } from '../data/unitArt.js';
import type { PreviaDaMissao } from '../logic/previaDaMissao.js';
import { entradaDeRender, paintPrimitives, pintarTile } from '../render/tabuleiro.js';
import { useBattleStore } from '../store/battleStore.js';

// M35 2/N (D42) — a PRÉVIA da missão: o tabuleiro de verdade, em miniatura, somente-leitura.
//
// É o mesmo desenho do `MapCanvas` — os mesmos `pintarTile`, `entradaDeRender` e
// `paintPrimitives` de `render/tabuleiro.ts` — sem clique, sem overlay de turno, sem FX e sem a
// store de batalha. O que muda é o tamanho do tile (cabe num cartão) e duas coisas que só a
// prévia tem: as VAGAS marcadas (onde o jogador vai entrar, numeradas na ordem das vagas) e
// nenhuma peça do lado do jogador (ele ainda não escolheu quem leva).
//
// §1.1 antes de entrar: o jogador vê contra o que vai, onde os inimigos estão e o terreno, e
// só então escolhe quem leva.

// A prévia cabe num cartão: o tile é o maior que faz o mapa caber em `LARGURA_MAX`, com um piso
// abaixo do qual a peça vira um borrão e o tabuleiro deixa de informar.
const LARGURA_MAX = 480;
const TILE_MIN = 18;
const TILE_MAX = 36;

export function PreviaDoMapa({ previa }: { readonly previa: PreviaDaMissao }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const colorblindMode = useBattleStore((s) => s.colorblindMode);

  useEffect(() => {
    let disposed = false;
    let pronto = false;
    const app = new Application();
    const { map } = previa.setup;
    const tileSize = Math.max(TILE_MIN, Math.min(TILE_MAX, Math.floor(LARGURA_MAX / Math.max(map.width, map.height))));
    const theme = themeFor(colorblindMode);
    const objectiveTile = 'target' in previa.setup.winCondition ? (previa.setup.winCondition.target as Coord) : undefined;

    const contexto = {
      theme,
      tileSize,
      // A peça em miniatura: o rótulo de AP/PP acompanha o tile, não a escala de UI — o tile
      // aqui é decidido pelo cartão, e o `MapCanvas` continua sendo quem obedece §11.
      uiScale: tileSize / 64,
      heroesByUnitId: {},
      artIdByUnitId: previa.artIdByUnitId,
    };

    function desenhar(layer: Container) {
      layer.removeChildren();
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const g = new Graphics();
          pintarTile(g, {
            map,
            x,
            y,
            tileSize,
            theme,
            overlays: {
              threatened: false,
              reachable: false,
              targetable: false,
              gateOpen: false,
              captured: false,
              objective: !!objectiveTile && objectiveTile.x === x && objectiveTile.y === y,
            },
          });
          layer.addChild(g);
        }
      }
      // As vagas: a cor de MOVIMENTO do tema (é "onde você vai estar"), numeradas na ordem em
      // que a missão as declara — a mesma ordem em que os heróis escolhidos as ocupam.
      previa.vagas.forEach((vaga, indice) => {
        const px = vaga.x * tileSize;
        const py = vaga.y * tileSize;
        const g = new Graphics();
        g.rect(px, py, tileSize - 1, tileSize - 1).fill({ color: theme.move.color, alpha: theme.move.alpha });
        g.rect(px + 1, py + 1, tileSize - 3, tileSize - 3).stroke({ width: 2, color: theme.move.color });
        layer.addChild(g);
        const numero = new Text({
          text: String(indice + 1),
          style: { fontSize: Math.max(9, Math.round(tileSize * 0.45)), fill: 0xffffff, fontWeight: 'bold' },
        });
        numero.anchor.set(0.5);
        numero.position.set(px + tileSize / 2, py + tileSize / 2);
        layer.addChild(numero);
      });
      for (const unit of previa.setup.units) {
        if (unit.hp <= 0) continue;
        paintPrimitives(
          layer,
          activeUnitRenderer.render(
            entradaDeRender(unit, unit.pos.x * tileSize, unit.pos.y * tileSize, { selected: false, engageable: false }, contexto),
          ),
        );
      }
    }

    void app
      .init({ width: map.width * tileSize, height: map.height * tileSize, background: '#111827', antialias: true })
      .then(() => {
        if (disposed) {
          app.destroy(true);
          return;
        }
        pronto = true;
        containerRef.current?.appendChild(app.canvas);
        const layer = new Container();
        app.stage.addChild(layer);
        // Mesma ordem do `MapCanvas` (M32 2/N): o pedido das texturas vem ANTES da primeira
        // pintura, e a peça sem textura é pulada até a imagem chegar.
        const urls = urlsDeArte();
        if (urls.length > 0) {
          void Assets.load([...urls]).then(() => {
            if (!disposed) desenhar(layer);
          });
        }
        desenhar(layer);
      });

    return () => {
      disposed = true;
      // Antes do `init` terminar não há o que destruir; o `then` acima cuida desse caso.
      if (pronto) app.destroy(true);
    };
  }, [previa, colorblindMode]);

  return <div ref={containerRef} className="previa-do-mapa" />;
}
