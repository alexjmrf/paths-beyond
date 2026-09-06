import { Application, Assets, Container, Graphics, Sprite, Text, Texture, type Ticker } from 'pixi.js';
import { useEffect, useRef } from 'react';
import { fxDeCritico, fxDeDesfecho, fxDeGolpe } from '../data/combatFx.js';
import {
  FX_MS,
  duelSceneBeats,
  fxMotion,
  idleMotion,
  impactMotion,
  instantly,
  shakeMotion,
  weightFor,
  type DuelSceneBeat,
  type Motion,
} from '../data/motion.js';
import { themeFor } from '../data/overlayTheme.js';
import { placeShapes, type Primitive } from '../data/shapes.js';
import { artIdDeUnidade, arteDeDuelo, urlsDeArte } from '../data/unitArt.js';
import { useBattleStore } from '../store/battleStore.js';

// M26 2/N — a TELA DE DUELO.
//
// **Por que ela existe, e é uma medida e não um gosto.** A bateria de animação de 1/N mediu que
// os quadros gerados perdem a ARMA — em qualquer resolução e em qualquer amplitude, porque o
// animador de esqueleto anima um corpo e a espada não é osso (D27). §6.1 faz a arma decidir o
// alcance no duelo: a arma é a identidade tática da peça, e uma peça que golpeia sem espada
// mente sobre a regra que o duelo vai aplicar.
//
// A saída: **a identidade da arma sai dos pixels gerados e entra no EFEITO, que é código.** O
// sprite carrega quem a pessoa é; o corte, a estocada, a flecha e o clarão carregam o que ela
// fez. E a aritmética inverte junto — o efeito é por tipo de arma (7) e por desfecho, não por
// unidade (50).
//
// **O que esta tela NÃO faz é decidir qualquer coisa.** O duelo inteiro já aconteceu no core
// antes do primeiro quadro (§6: até 3 trocas, resolvidas de uma vez). Ela LÊ `duelSceneBeats` e
// conta em ordem. D4 e a regra 3 continuam de pé: nenhuma regra mora aqui.
//
// **As poses custaram zero geração.** `create-character-v3` produz as 8 rotações numa passada
// só, e até a 1/N o gerador baixava uma. As duas de três quartos estavam paradas do lado da
// PixelLab, presas ao mesmo `characterId` que o manifesto já guardava.

// A cena é desenhada num espaço lógico fixo e o `Container` a escala para a janela. Assim os
// números abaixo são posições e não pixels — o mesmo desenho serve qualquer tamanho de tela,
// que é o que `placeShapes` já faz com o glifo desde M16.
const CENA_L = 960;
const CENA_A = 420;
const PECA = 256;
const CHAO_Y = 300;
const X_ESQUERDA = 190;
const X_DIREITA = CENA_L - 190;

// Quanto tempo cada batida ocupa, incluindo a pausa depois dela. O efeito dura `FX_MS`; o
// resto é o tempo de o olho ler o número de dano antes do golpe seguinte.
const BATIDA_MS = 520;

interface Peca {
  readonly container: Container;
  readonly corpo: Container;
  readonly unitId: string;
  readonly esquerda: boolean;
  readonly weight: ReturnType<typeof weightFor>;
}

export function DuelScene() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const rodandoRef = useRef(false);

  const duelScene = useBattleStore((s) => s.duelScene);
  const fecharCenaDeDuelo = useBattleStore((s) => s.fecharCenaDeDuelo);
  const heroesByUnitId = useBattleStore((s) => s.heroesByUnitId);
  // M26 3/N — a cena de duelo lê o mesmo mapa que o tabuleiro. Sem ele, um duelo de PvP
  // desenharia o herói do jogador como sprite e o do oponente como disco.
  const artIdByUnitId = useBattleStore((s) => s.artIdByUnitId);
  const colorblindMode = useBattleStore((s) => s.colorblindMode);
  const t = useBattleStore((s) => s.t);

  useEffect(() => {
    if (!duelScene) return;
    let descartado = false;

    const theme = themeFor(colorblindMode);
    const app = new Application();

    void app.init({ width: CENA_L, height: CENA_A, backgroundAlpha: 0, antialias: true }).then(async () => {
      if (descartado) {
        app.destroy(true);
        return;
      }
      appRef.current = app;
      hostRef.current?.appendChild(app.canvas);

      const urls = urlsDeArte();
      if (urls.length > 0) await Assets.load([...urls]);
      if (descartado) return;

      const palco = new Container();
      app.stage.addChild(palco);
      const camadaFx = new Container();
      app.stage.addChild(camadaFx);

      const pecas = new Map<string, Peca>();
      for (const [unidade, esquerda] of [
        [duelScene.atacante, true],
        [duelScene.defensor, false],
      ] as const) {
        const container = new Container();
        const corpo = new Container();
        container.addChild(corpo);

        const artId = artIdDeUnidade(heroesByUnitId, unidade, artIdByUnitId);
        const arte = arteDeDuelo(artId, esquerda ? 'sudeste' : 'sudoeste');
        if (arte) {
          const textura = Texture.from(arte);
          // Vizinho-mais-próximo: a peça é de 64px e a cena a desenha a 256 — ampliação
          // inteira de 4×, que é o caso que D25 mediu como limpo.
          textura.source.scaleMode = 'nearest';
          const sprite = new Sprite(textura);
          sprite.width = PECA;
          sprite.height = PECA;
          sprite.anchor.set(0.5, 1);
          corpo.addChild(sprite);
        } else {
          // Sem arte declarada, a peça é o disco de lado do M16. Mesmo princípio do tabuleiro:
          // degradar é sempre uma cena jogável, nunca um retângulo vazio.
          const g = new Graphics();
          g.circle(0, -PECA / 2, PECA / 3);
          g.fill(theme.sides[unidade.side as 'player' | 'enemy']?.color ?? 0xffffff);
          corpo.addChild(g);
        }

        container.position.set(esquerda ? X_ESQUERDA : X_DIREITA, CHAO_Y);
        palco.addChild(container);
        pecas.set(unidade.unitId, {
          container,
          corpo,
          unitId: unidade.unitId,
          esquerda,
          weight: weightFor(unidade.unitType),
        });
      }

      const armaDe = new Map<string, string | undefined>([
        [duelScene.atacante.unitId, duelScene.atacante.weaponType],
        [duelScene.defensor.unitId, duelScene.defensor.weaponType],
      ]);

      const beats = duelSceneBeats(duelScene.duelResult as never);
      const idles = new Map([...pecas.values()].map((p) => [p.unitId, idleMotion(p.weight)] as const));

      // Uma batida em andamento: o movimento de quem bate, o de quem apanha, o efeito no alvo
      // e o número. Tudo é função pura de tempo (M16 3/N); aqui só se soma `deltaMS`.
      interface EmVoo {
        readonly beat: DuelSceneBeat;
        readonly ator?: Motion;
        readonly alvo?: Motion;
        readonly efeito: Motion;
        readonly fxLayer: Container;
        readonly rotulo: Text | null;
        elapsed: number;
      }

      let indice = 0;
      let atual: EmVoo | null = null;
      let relogio = 0;
      let esperaEntreBatidas = 0;

      function pintar(layer: Container, primitivas: readonly Primitive[]) {
        const g = new Graphics();
        for (const p of primitivas) {
          if (p.t === 'circle') g.circle(p.cx, p.cy, p.r);
          else if (p.t === 'rect') g.rect(p.x, p.y, p.w, p.h);
          else if (p.t === 'poly') {
            if (p.closed) g.poly([...p.points], true);
            else {
              g.moveTo(p.points[0]!, p.points[1]!);
              for (let i = 2; i + 1 < p.points.length; i += 2) g.lineTo(p.points[i]!, p.points[i + 1]!);
            }
          } else continue;
          if (p.fill !== undefined) g.fill(p.alpha === undefined ? p.fill : { color: p.fill, alpha: p.alpha });
          if (p.stroke !== undefined) g.stroke({ width: p.strokeWidth ?? 1, color: p.stroke });
        }
        layer.addChild(g);
      }

      function abrir(beat: DuelSceneBeat): EmVoo {
        const ator = pecas.get(beat.actorId);
        const alvo = pecas.get(beat.targetId);
        const camada = new Container();
        camadaFx.addChild(camada);

        // O efeito é desenhado no ALVO — é onde o golpe chega. A cura e a morte também, e
        // nesses dois casos ator e alvo são a mesma peça.
        const caixa = alvo
          ? { x: alvo.container.x - PECA / 2, y: CHAO_Y - PECA, size: PECA }
          : { x: CENA_L / 2 - PECA / 2, y: CHAO_Y - PECA, size: PECA };

        const formas =
          beat.kind === 'strike' || beat.kind === 'counter'
            ? fxDeGolpe(armaDe.get(beat.actorId) as never)
            : fxDeDesfecho(beat.kind);
        pintar(camada, placeShapes(formas, caixa, { ink: theme.tokens.glyphInk, strokeWidth: 4 }));
        if (beat.crit) {
          pintar(camada, placeShapes(fxDeCritico(), caixa, { ink: theme.tokens.hpCriticalInk, strokeWidth: 4 }));
        }

        // O número (ou a palavra) do que aconteceu. Fica FORA do efeito, no `Container` da
        // cena, porque ele não deve encolher e sumir junto — ele é a informação.
        let rotulo: Text | null = null;
        const texto =
          beat.kind === 'miss'
            ? t('cena.esquivou')
            : beat.kind === 'death'
              ? t('cena.derrotado')
              : beat.damage > 0
                ? String(beat.damage)
                : null;
        if (texto) {
          rotulo = new Text({
            text: beat.crit ? `${texto} ${t('cena.critico')}` : texto,
            style: { fontSize: 34, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x111827, width: 6 } },
          });
          rotulo.anchor.set(0.5);
          rotulo.position.set(caixa.x + PECA / 2, CHAO_Y - PECA - 16);
          camadaFx.addChild(rotulo);
        }

        // §6 — quem bate avança, quem apanha treme. Os dois movimentos são os MESMOS de M16
        // 3/N, com os mesmos perfis de peso: nenhum número novo, e nenhum número velho mudado.
        const direcao = ator ? { x: ator.esquerda ? 1 : -1, y: 0 } : { x: 1, y: 0 };
        const golpeia = beat.kind === 'strike' || beat.kind === 'counter';

        return {
          beat,
          ...(ator && golpeia ? { ator: impactMotion(direcao, PECA / 3, ator.weight) } : {}),
          ...(alvo && beat.damage > 0 ? { alvo: shakeMotion(PECA / 5, alvo.weight) } : {}),
          efeito: fxMotion(),
          fxLayer: camada,
          rotulo,
          elapsed: 0,
        };
      }

      function fechar(voo: EmVoo) {
        voo.fxLayer.destroy({ children: true });
        voo.rotulo?.destroy();
        const ator = pecas.get(voo.beat.actorId);
        const alvo = pecas.get(voo.beat.targetId);
        for (const p of [ator, alvo]) {
          if (!p) continue;
          p.corpo.position.set(0, 0);
          p.corpo.scale.set(1, 1);
        }
        // A morte deixa a peça caída: ela não volta ao repouso.
        if (voo.beat.kind === 'death') {
          const morto = pecas.get(voo.beat.targetId);
          if (morto) {
            morto.container.alpha = 0.25;
            idles.delete(morto.unitId);
          }
        }
      }

      const tick = (ticker: Ticker) => {
        if (descartado) return;
        const dt = ticker.deltaMS;
        relogio += dt;

        // O REPOUSO. Roda o tempo todo, inclusive entre as batidas — é o que impede a cena de
        // parecer duas figuras coladas na tela.
        for (const p of pecas.values()) {
          const idle = idles.get(p.unitId);
          if (!idle) continue;
          const s = idle.sampleAt(relogio);
          if (!atual || (atual.beat.actorId !== p.unitId && atual.beat.targetId !== p.unitId)) {
            p.corpo.position.set(0, s.dy * PECA);
            p.corpo.scale.set(s.scaleX, s.scaleY);
          }
        }

        if (atual) {
          atual.elapsed += dt;
          const fx = atual.efeito.sampleAt(atual.elapsed);
          atual.fxLayer.alpha = fx.alpha;
          atual.fxLayer.scale.set(fx.scaleX, fx.scaleY);
          // Escalar em torno do centro da caixa, e não do canto.
          atual.fxLayer.pivot.set(0, 0);
          if (atual.rotulo) atual.rotulo.alpha = Math.min(1, fx.alpha * 1.4);

          for (const [motion, quem] of [
            [atual.ator, pecas.get(atual.beat.actorId)],
            [atual.alvo, pecas.get(atual.beat.targetId)],
          ] as const) {
            if (!motion || !quem) continue;
            const s = motion.sampleAt(atual.elapsed);
            quem.corpo.position.set(s.dx, s.dy);
            quem.corpo.scale.set(s.scaleX, s.scaleY);
          }

          if (atual.elapsed >= BATIDA_MS) {
            fechar(atual);
            atual = null;
            esperaEntreBatidas = 0;
          }
          return;
        }

        esperaEntreBatidas += dt;
        if (esperaEntreBatidas < 120) return;

        if (indice >= beats.length) {
          rodandoRef.current = false;
          fecharCenaDeDuelo();
          return;
        }
        atual = abrir(beats[indice]!);
        indice += 1;
      };

      rodandoRef.current = true;
      app.ticker.add(tick);
    });

    return () => {
      descartado = true;
      rodandoRef.current = false;
      appRef.current?.destroy(true);
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelScene]);

  if (!duelScene) return null;

  // O `unitId`, como o painel de iniciativa faz. Nome próprio de unidade não é um problema
  // desta fatia: `BattleUnit` não carrega nome, e inventar um esquema aqui criaria uma segunda
  // resposta para "como esta unidade se chama" — a primeira já está no painel ao lado.
  const nomeDe = (unitId: string) => unitId;

  return (
    <div className="duel-scene">
      <div className="duel-scene-quadro">
        <div className="duel-scene-nomes">
          <span>{nomeDe(duelScene.atacante.unitId)}</span>
          <span>{nomeDe(duelScene.defensor.unitId)}</span>
        </div>
        <div ref={hostRef} className="duel-scene-palco" />
        {/* **Fecha DIRETO, e não pelo relógio.**
            A primeira versão marcava uma ref que o `ticker` lia — e o `ticker` do Pixi anda com
            `requestAnimationFrame`, que o navegador PAUSA em aba oculta. Visto na verificação:
            com a aba em segundo plano a cena congela no primeiro golpe, e um "Pular" que
            depende do mesmo relógio parado deixa o jogador preso numa tela modal.
            O estado da batalha já foi commitado antes da cena abrir, então fechar aqui não
            perde nada: a cena só CONTA o que o core já decidiu. */}
        <button type="button" className="duel-scene-pular" onClick={fecharCenaDeDuelo}>
          {t('cena.pular')}
        </button>
      </div>
    </div>
  );
}
