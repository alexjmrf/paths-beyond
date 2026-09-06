import type { UnitType } from '@paths-beyond/core';

// M16, sub-sessão 3/N — animação com peso.
//
// Mesma inversão do D2 do briefing, aplicada ao tempo em vez de à forma: este módulo
// **descreve** o movimento e não anima. Uma `Motion` é uma função PURA de tempo decorrido para
// deslocamento, escala e opacidade; quem tem relógio (o `Ticker` do Pixi) é o `MapCanvas`, num
// ponto só. As três coisas que saem dessa inversão são as mesmas de 1/N:
//
//   - o movimento vira testável sem browser e sem Pixi (`tests/motion.test.ts` não importa nem
//     um nem outro);
//   - dá para AFIRMAR o que "com peso" quer dizer — que a velocidade tem um pico no meio, que o
//     golpe recua antes de avançar, que o pesado assenta mais que o leve — em vez de olhar um
//     GIF e torcer;
//   - §11 exige "modo resultado instantâneo (pula animações)", e pular vira uma operação sobre
//     a descrição (`instantly`), com a garantia testável de que o estado final é o MESMO.
//
// O que este arquivo NÃO faz é afirmar que o movimento ficou bom (§3 do briefing). Peso tem um
// lado mensurável e é só ele que está aqui; o gosto é do usuário.
//
// D4: nenhuma regra muda. Nada aqui altera um estado de batalha — o core já decidiu tudo antes
// do primeiro quadro, e a animação só conta o que já foi decidido.

export interface Point {
  readonly x: number;
  readonly y: number;
}

// O que uma animação entrega em um instante: um deslocamento em pixels a partir da posição que
// o core diz que a unidade ocupa, mais escala e opacidade. Nunca uma posição absoluta — posição
// é regra, e o deslocamento deixa explícito que a animação é uma mentira temporária por cima
// dela, que sempre volta a zero (ou ao destino) no último quadro.
export interface MotionSample {
  readonly dx: number;
  readonly dy: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly alpha: number;
  readonly done: boolean;
}

export interface Motion {
  readonly durationMs: number;
  sampleAt(elapsedMs: number): MotionSample;
}

const PARADO: MotionSample = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, alpha: 1, done: false };
const PARADO_FIM: MotionSample = { ...PARADO, done: true };

// ---------------------------------------------------------------------------
// Perfis de peso
// ---------------------------------------------------------------------------

// O que "peso" é, declarado em números em vez de adjetivos. A tabela é ordenada de propósito
// (ver o teste): o couraçado demora mais, recua mais fundo antes de bater, assenta com mais
// força na chegada e treme MENOS ao apanhar — massa é o que absorve o golpe. Se os cinco perfis
// fossem o mesmo número com nomes diferentes, a fatia teria animação sem peso.
export interface WeightProfile {
  readonly msPerTile: number; // quanto tempo cada tile de caminho custa
  readonly settle: number; // fração de achatamento na chegada
  readonly anticipation: number; // fração do avanço que a peça recua ANTES do golpe
  readonly shake: number; // fração do tile que a peça treme ao apanhar
  readonly impactMs: number;
}

// Completude no estilo de M9, garantida nos dois sentidos: o `Record<UnitType, _>` obriga em
// tempo de compilação (nenhum tipo de unidade fica sem peso) e o teste obriga do outro lado
// (nenhuma chave sobrando). `cavalry` está declarada mesmo sem classe montada no catálogo de
// hoje — o dia em que uma entrar, ela anda com peso próprio em vez de cair no fallback em
// silêncio, que é o modo de falha que o teste de completude de M9 existe para pegar.
export const WEIGHT_BY_UNIT_TYPE: Readonly<Record<UnitType, WeightProfile>> = {
  infantry: { msPerTile: 150, settle: 0.1, anticipation: 0.16, shake: 0.085, impactMs: 300 },
  // Couraçado: a peça mais lenta e a que mais assenta. É a unidade que o conteúdo descreve
  // desde M12 como "quem aguenta o portão enquanto o resto entra"; ela tem de PARECER isso.
  armored: { msPerTile: 200, settle: 0.17, anticipation: 0.26, shake: 0.05, impactMs: 380 },
  cavalry: { msPerTile: 110, settle: 0.08, anticipation: 0.13, shake: 0.09, impactMs: 260 },
  // Voar é o que muda o mapa (§5.1 — ignora custo de terreno): o grifeiro desliza, quase não
  // assenta (não toca o chão) e é o que mais balança ao levar uma pancada.
  flying: { msPerTile: 95, settle: 0.04, anticipation: 0.09, shake: 0.12, impactMs: 230 },
  caster: { msPerTile: 160, settle: 0.07, anticipation: 0.14, shake: 0.1, impactMs: 320 },
};

// O fallback declarado, mesmo padrão do glifo (D1): PvP, masmorra e replay recebem o
// `BattleSetup` pronto do servidor, e uma unidade sem `unitType` não pode ficar sem movimento.
export const FALLBACK_WEIGHT: WeightProfile = {
  msPerTile: 150,
  settle: 0.1,
  anticipation: 0.16,
  shake: 0.085,
  impactMs: 300,
};

export function weightFor(unitType: UnitType | undefined): WeightProfile {
  return (unitType && WEIGHT_BY_UNIT_TYPE[unitType]) || FALLBACK_WEIGHT;
}

// ---------------------------------------------------------------------------
// Curvas
// ---------------------------------------------------------------------------

// Progresso normalizado, à prova do relógio que chega de fora. O `deltaMS` do `Ticker` acumula:
// um quadro perdido, uma aba em segundo plano, e o decorrido passa da duração. Tempo não finito
// vale como "ainda não começou" — devolver `NaN` daqui pintaria a peça em lugar nenhum.
function progress(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (durationMs <= 0) return 1;
  return Math.min(1, elapsedMs / durationMs);
}

// Sai devagar, ganha o percurso, freia na chegada. É a diferença entre uma peça com massa e o
// lerp linear que o cliente usava desde M6 — e, ao contrário de "ficou melhor", ela é
// mensurável: a velocidade no meio é uma ordem de grandeza maior que na largada.
// Exata nos extremos (0 e 1), o que importa porque o commit acontece no último quadro.
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2) * (-2 * t + 2)) / 2;
}

function easeOutQuad(t: number): number {
  return t * (2 - t);
}

// `-0` é finito, desenha igual a `0` e ainda assim não é `0` para `Object.is` — que é o que
// `toEqual` usa. Uma descrição de movimento é dado que se compara (o teste de pureza compara
// duas amostras do mesmo instante), então ela precisa ser canônica: um eixo sem deslocamento
// vale zero, e não "zero com sinal de menos" porque a curva por acaso estava negativa.
function semZeroNegativo(n: number): number {
  return n === 0 ? 0 : n;
}

// Um pulso que vale 0 nas duas pontas e 1 no meio, sem passar por seno: `Math.sin(Math.PI)` não
// é zero em ponto flutuante, e "quase zero" no último quadro deixaria a peça achatada por uma
// fração de pixel depois que a animação acabou.
function pulse(u: number): number {
  return 4 * u * (1 - u);
}

// ---------------------------------------------------------------------------
// Movimento
// ---------------------------------------------------------------------------

// A janela final do percurso em que a peça assenta. Fora dela a escala é exatamente 1.
const SETTLE_WINDOW = 0.22;

function polylineLength(points: readonly Point[]): { readonly total: number; readonly segments: readonly number[] } {
  const segments: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    segments.push(d);
    total += d;
  }
  return { total, segments };
}

// O deslocamento ao longo do caminho inteiro, e não segmento a segmento. A diferença aparece na
// curva: interpolar por segmento (o que o cliente fazia) dá uma parada dura em cada tile, e o
// caminho que `computeReachableTiles` devolve dobra esquinas o tempo todo.
export function moveMotion(centers: readonly Point[], weight: WeightProfile): Motion {
  const { total, segments } = polylineLength(centers);
  const origem = centers[0];
  const destino = centers[centers.length - 1];

  if (centers.length < 2 || total <= 0 || !origem || !destino) {
    return { durationMs: 0, sampleAt: () => PARADO_FIM };
  }

  const durationMs = weight.msPerTile * (centers.length - 1);
  const fim: MotionSample = {
    dx: destino.x - origem.x,
    dy: destino.y - origem.y,
    scaleX: 1,
    scaleY: 1,
    alpha: 1,
    done: true,
  };

  return {
    durationMs,
    sampleAt(elapsedMs) {
      const t = progress(elapsedMs, durationMs);
      if (t >= 1) return fim;

      const p = easeInOutCubic(t);
      let restante = p * total;
      let i = 0;
      while (i < segments.length - 1 && restante > segments[i]!) {
        restante -= segments[i]!;
        i++;
      }
      const de = centers[i]!;
      const para = centers[i + 1]!;
      const fracao = segments[i]! > 0 ? Math.min(1, restante / segments[i]!) : 0;

      // O assentamento: a massa chega ao chão, achata e volta. `pulse` garante que ele nasce e
      // morre exatamente em zero, então o último quadro é a peça inteira de novo — sem isso a
      // unidade ficaria deformada no tabuleiro depois de andar, porque o commit do estado
      // acontece justamente quando a animação termina.
      const u = p > 1 - SETTLE_WINDOW ? (p - (1 - SETTLE_WINDOW)) / SETTLE_WINDOW : 0;
      const squash = weight.settle * pulse(u);

      return {
        dx: de.x + (para.x - de.x) * fracao - origem.x,
        dy: de.y + (para.y - de.y) * fracao - origem.y,
        scaleX: 1 + squash * 0.6,
        scaleY: 1 - squash,
        alpha: 1,
        done: false,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Impacto
// ---------------------------------------------------------------------------

// Onde a batida cai, em fração da duração do golpe. Exportado porque o `MapCanvas` sincroniza o
// tremor do alvo e o número de dano com este instante: som e imagem chegando em momentos
// diferentes é o jeito mais barato de um golpe perder o peso.
export const IMPACT_PEAK_AT = 0.55;

// Quanto do tile a peça avança no golpe. Menos de meio tile de propósito: a peça bate e volta,
// ela não entra no tile do alvo — posição é regra, e uma peça sobre o tile do vizinho mentiria
// sobre quem está onde.
const LUNGE_RATIO = 0.34;

const ANTICIPATION_END = 0.35;

// A curva do golpe: recua (antecipação), avança até o pico e volta ao lugar. Vale exatamente 0
// nas duas pontas e exatamente 1 no pico.
function lungeCurve(t: number, anticipation: number): number {
  if (t <= 0 || t >= 1) return 0;
  if (t < ANTICIPATION_END) {
    // O impulso: acelera para TRÁS. É a parte que o olho lê como "vai bater".
    const u = t / ANTICIPATION_END;
    return -anticipation * u * u;
  }
  if (t < IMPACT_PEAK_AT) {
    const u = (t - ANTICIPATION_END) / (IMPACT_PEAK_AT - ANTICIPATION_END);
    return -anticipation + (1 + anticipation) * easeOutQuad(u);
  }
  const u = (t - IMPACT_PEAK_AT) / (1 - IMPACT_PEAK_AT);
  return 1 - easeOutQuad(u);
}

export function impactMotion(direction: Point, tileSize: number, weight: WeightProfile): Motion {
  const comprimento = Math.hypot(direction.x, direction.y);
  // Direção nula não acontece em jogo (duas unidades não ocupam o mesmo tile), mas normalizar
  // um vetor nulo divide por zero e o resultado seria uma peça desenhada em lugar nenhum.
  const nx = comprimento > 0 ? direction.x / comprimento : 0;
  const ny = comprimento > 0 ? direction.y / comprimento : 0;
  const amplitude = tileSize * LUNGE_RATIO;
  const durationMs = weight.impactMs;

  return {
    durationMs,
    sampleAt(elapsedMs) {
      const t = progress(elapsedMs, durationMs);
      if (t >= 1) return PARADO_FIM;

      const f = lungeCurve(t, weight.anticipation);
      // Estica no avanço e não no recuo: é o alongamento do golpe, não do impulso.
      const stretch = Math.max(0, f) * 0.1;
      return {
        dx: semZeroNegativo(nx * amplitude * f),
        dy: semZeroNegativo(ny * amplitude * f),
        scaleX: 1 + stretch,
        scaleY: 1 - stretch,
        alpha: 1,
        done: false,
      };
    },
  };
}

const SHAKE_CYCLES = 2.5;

// O tremor de quem apanha. Oscila (um deslocamento só para um lado seria um empurrão, não uma
// pancada), amortece, e para exatamente onde começou. A amplitude vem do peso: o couraçado
// treme menos que o grifeiro com a mesma pancada.
export function shakeMotion(tileSize: number, weight: WeightProfile): Motion {
  const amplitude = tileSize * weight.shake;
  const durationMs = weight.impactMs * 0.8;

  return {
    durationMs,
    sampleAt(elapsedMs) {
      const t = progress(elapsedMs, durationMs);
      if (t >= 1) return PARADO_FIM;

      const decaimento = 1 - t;
      const fase = 2 * Math.PI * SHAKE_CYCLES * t;
      return {
        dx: semZeroNegativo(amplitude * Math.sin(fase) * decaimento),
        dy: semZeroNegativo((amplitude / 2) * Math.sin(fase * 2) * decaimento),
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        done: false,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Morte e número de dano
// ---------------------------------------------------------------------------

export const DEATH_MS = 260;
const DEATH_COLLAPSE = 0.6; // quanto da altura a peça perde ao desabar

// Até esta fatia a unidade morta simplesmente sumia no quadro em que o duelo era commitado: o
// jogador via o tabuleiro com uma peça a menos e tinha de deduzir qual era. §1.1 põe a
// legibilidade tática entre os pilares — quem caiu é a informação que decide o turno seguinte.
export function deathMotion(tileSize: number, _weight: WeightProfile): Motion {
  const quedaFinal = (tileSize * DEATH_COLLAPSE) / 2;
  const fim: MotionSample = {
    dx: 0,
    dy: quedaFinal,
    scaleX: 1,
    scaleY: 1 - DEATH_COLLAPSE,
    alpha: 0,
    done: true,
  };

  return {
    durationMs: DEATH_MS,
    sampleAt(elapsedMs) {
      const t = progress(elapsedMs, DEATH_MS);
      if (t >= 1) return fim;
      const colapso = DEATH_COLLAPSE * t;
      return {
        dx: 0,
        // Desaba para o CHÃO e não para o centro: a peça encolhe pela base, como uma coisa que
        // cai. Sem o deslocamento, ela mingua no ar.
        dy: (tileSize * colapso) / 2,
        scaleX: 1,
        scaleY: 1 - colapso,
        alpha: 1 - t,
        done: false,
      };
    },
  };
}

export const DAMAGE_FLOAT_MS = 700;
// Fração do tile que o número sobe. Encurtou de 0.9 para 0.55 quando a âncora subiu para FORA
// do tile (ver `MapCanvas`): a excursão total continua a mesma, o que mudou foi de onde ela
// parte. Um número que sobe uma altura de tile inteira a partir da borda de cima acabaria dois
// tiles acima do alvo, longe de quem levou a pancada.
const DAMAGE_RISE = 0.55;
const DAMAGE_HOLD = 0.45; // fração da vida do número em que ele fica opaco

// Decisão do usuário nesta fatia — o briefing não lista número de dano entre os estados a
// exibir, e o preview de duelo (§11) já narra troca a troca. O argumento aceito: sem o número,
// a batida diz que doeu e não diz quanto, e a decisão de engajar de novo acontece olhando o
// tabuleiro. Sobe e some por completo: um número que ficasse na tela viraria sujeira sobre o
// tile na jogada seguinte.
// Para onde o número sai, em TILES a partir do centro do alvo. Ele nasce fora do tile do alvo
// (3/N: nascendo no centro ele atravessava a plaqueta de AP/PP), e o tile de cima é o espaço
// mais próximo da pancada — mas só quando esse tile está VAZIO. Verificado em navegador em 4/N,
// no capítulo 1: o bandido bate no herói que está logo abaixo dele, o número do golpe nasce
// acima do tile do herói e cai exatamente em cima do próprio bandido, sobre a plaqueta e o
// glifo dele. É o mesmo defeito de 3/N com outra causa — lá o número disputava espaço com a
// peça do ALVO, aqui com a peça do VIZINHO —, e ele só aparece quando duas peças estão
// verticalmente adjacentes, que é a posição em que todo duelo corpo a corpo acontece.
//
// A ordem das candidatas é a distância à pancada: em cima, depois as duas diagonais de cima.
// Nenhuma delas serve (canto do mapa, tabuleiro cheio) e vale a de cima mesmo assim — um número
// sobreposto ainda é lido; um número desenhado fora do tabuleiro, não.
const DAMAGE_ANCHOR_CANDIDATES: readonly Point[] = [
  { x: 0, y: -1 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
];

export function tileKeyOf(coord: Point): string {
  return `${coord.x},${coord.y}`;
}

export function damageAnchorDirection(
  target: Point,
  occupied: ReadonlySet<string>,
  bounds: { readonly width: number; readonly height: number },
): Point {
  for (const dir of DAMAGE_ANCHOR_CANDIDATES) {
    const tile = { x: target.x + dir.x, y: target.y + dir.y };
    if (tile.x < 0 || tile.y < 0 || tile.x >= bounds.width || tile.y >= bounds.height) continue;
    if (occupied.has(tileKeyOf(tile))) continue;
    return dir;
  }
  return DAMAGE_ANCHOR_CANDIDATES[0]!;
}

export function damageNumberMotion(tileSize: number): Motion {
  const fim: MotionSample = { dx: 0, dy: -tileSize * DAMAGE_RISE, scaleX: 1, scaleY: 1, alpha: 0, done: true };

  return {
    durationMs: DAMAGE_FLOAT_MS,
    sampleAt(elapsedMs) {
      const t = progress(elapsedMs, DAMAGE_FLOAT_MS);
      if (t >= 1) return fim;
      return {
        dx: 0,
        dy: -tileSize * DAMAGE_RISE * easeOutQuad(t),
        scaleX: 1,
        scaleY: 1,
        alpha: t <= DAMAGE_HOLD ? 1 : 1 - (t - DAMAGE_HOLD) / (1 - DAMAGE_HOLD),
        done: false,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// §11 — modo resultado instantâneo
// ---------------------------------------------------------------------------

// "Modo resultado instantâneo (pula animações) — essencial para farm". Pular vira uma operação
// sobre a DESCRIÇÃO, e não um `if` espalhado pelo componente: `instantly` devolve a mesma
// animação com duração zero e já no estado final, o que dá ao teste como afirmar que pular e
// assistir até o fim terminam no mesmo lugar. Um `if` no componente não teria como provar isso.
export function instantly(motion: Motion): Motion {
  const fim = motion.sampleAt(motion.durationMs);
  return { durationMs: 0, sampleAt: () => fim };
}

// ---------------------------------------------------------------------------
// A coreografia do duelo
// ---------------------------------------------------------------------------

// Subconjunto estrutural de `DuelResult` (§6): só o que a coreografia lê. Um `DuelResult` de
// verdade satisfaz este tipo, e depender do tipo inteiro obrigaria o teste a montar quinze
// campos que a animação nunca olha.
export interface DuelChoreographyInput {
  readonly attackerId: string;
  readonly defenderId: string;
  readonly trocas: readonly {
    readonly actions: readonly {
      readonly actorId: string;
      readonly targetId: string;
      readonly damage: number;
      // M26 2/N — o que a TELA de duelo precisa e o tabuleiro nunca precisou.
      //
      // Os três são aditivos e opcionais de propósito: `duelBeats` não os lê, então nenhum
      // teste e nenhuma fixture de M16 muda, e uma entrada antiga continua produzindo
      // exatamente as mesmas batidas de tabuleiro.
      //
      // `hit: false` é a ESQUIVA. No tabuleiro ela não vira nada — sacudir a peça num golpe
      // que a evasão de `spd` fez errar seria a animação afirmando o contrário do que o core
      // decidiu. Na tela ela precisa aparecer: §8 dá à `spd` exatamente três benefícios, e a
      // evasão com teto é um deles — se o jogador nunca a vê acontecer, o stat vira número de
      // planilha.
      readonly hit?: boolean | null;
      readonly isCrit?: boolean;
      readonly skillId?: string | null;
      // §6.5.3 (M24) — a cura que o ator aplicou nesta ação, e a da reação de cura. Elas não
      // viram animação (curar não sacode ninguém), mas viram SOM: sem isso, "curei" e "não
      // aconteceu nada" soam igual.
      readonly heal?: number;
      readonly reaction: { readonly counterDamage: number | null; readonly healDone?: number | null } | null;
    }[];
  }[];
  readonly finalHpAttacker: number;
  readonly finalHpDefender: number;
}

export interface DuelBeat {
  readonly actorId: string;
  readonly targetId: string;
  readonly damage: number;
  // M24 — `counter` e `heal` entraram para o ÁUDIO, e não mudam desenho nenhum: o
  // contra-ataque é animado como o golpe que ele é (mesmo caminho de impacto), e a cura não
  // tem animação — ela existe aqui para ter um instante ao qual pendurar o som.
  readonly kind: 'strike' | 'counter' | 'heal' | 'death';
}

// O duelo já aconteceu inteiro no core antes do primeiro quadro (§6: até 3 trocas, resolvidas
// de uma vez). A animação não decide nada — ela LÊ o log e o conta em ordem. Ação que não
// causou dano não vira batida: sacudir a peça num golpe que a evasão de `spd` fez errar seria
// a animação afirmando o contrário do que o core decidiu.
export function duelBeats(result: DuelChoreographyInput): readonly DuelBeat[] {
  const beats: DuelBeat[] = [];

  for (const troca of result.trocas) {
    for (const acao of troca.actions) {
      if (acao.damage > 0) {
        beats.push({ actorId: acao.actorId, targetId: acao.targetId, damage: acao.damage, kind: 'strike' });
      }
      // §6.5.3 (M24) — auto-cura do ator. Não desenha nada; existe para o som ter onde cair.
      if ((acao.heal ?? 0) > 0) {
        beats.push({ actorId: acao.actorId, targetId: acao.actorId, damage: 0, kind: 'heal' });
      }
      // §6.4 — a reação é do ALVO contra quem bateu, e vem depois do golpe que a disparou.
      // Desenhá-la no mesmo sentido faria o contra-ataque parecer parte do ataque.
      const contra = acao.reaction?.counterDamage ?? 0;
      if (contra > 0) {
        beats.push({ actorId: acao.targetId, targetId: acao.actorId, damage: contra, kind: 'counter' });
      }
      // §6.4 — "Cura de emergência": a reação com a tag `heal` cura o reagente em vez de
      // contra-atacar, e é simétrica ao contra-ataque.
      const curaDaReacao = acao.reaction?.healDone ?? 0;
      if (curaDaReacao > 0) {
        beats.push({ actorId: acao.targetId, targetId: acao.targetId, damage: 0, kind: 'heal' });
      }
    }
  }

  // §6.4 — os dois podem cair no mesmo duelo (gatilho de morte com contra-golpe letal).
  if (result.finalHpAttacker <= 0) {
    beats.push({ actorId: result.attackerId, targetId: result.attackerId, damage: 0, kind: 'death' });
  }
  if (result.finalHpDefender <= 0) {
    beats.push({ actorId: result.defenderId, targetId: result.defenderId, damage: 0, kind: 'death' });
  }

  return beats;
}


// ---------------------------------------------------------------------------
// M26 2/N — o repouso e o efeito
// ---------------------------------------------------------------------------

// A RESPIRAÇÃO. D22 escolheu uma imagem por unidade justamente porque a IA de imagem erra
// consistência entre quadros; a bateria de 1/N mediu que ela erra mesmo em movimento pequeno,
// e que a arma é o primeiro a sumir (D27). **Um idle por TRANSFORMAÇÃO não tem esse problema
// por construção: não existe segundo quadro com quem ser inconsistente.**
//
// O ciclo é lento e a amplitude é pequena de propósito. Uma peça que respira forte chama
// atenção para si a cada quadro, e num tabuleiro com dez unidades isso é ruído constante —
// §1.1 quer o olho livre para ler a posição, não preso à animação.
export const IDLE_MS = 2600;
export const IDLE_ESCALA = 0.018;

export function idleMotion(weight: WeightProfile): Motion {
  // O peso já ordena os cinco perfis (M16 3/N); o couraçado respira mais devagar que o
  // mensageiro pela mesma razão que assenta com mais força ao chegar.
  const duracao = Math.round(IDLE_MS * (weight.msPerTile / FALLBACK_WEIGHT.msPerTile));

  return {
    durationMs: duracao,
    sampleAt(elapsedMs) {
      // Nunca termina: `done` é sempre falso, e quem para o repouso é quem começa outra coisa.
      const t = ((elapsedMs % duracao) + duracao) % duracao / duracao;
      const onda = Math.sin(t * Math.PI * 2);
      return {
        dx: 0,
        // Achata e estica em torno do centro, e sobe um triz junto: só escalar dá um efeito de
        // gelatina; escalar e subir dá peito enchendo.
        dy: -onda * IDLE_ESCALA * 0.5,
        scaleX: 1 - onda * IDLE_ESCALA * 0.5,
        scaleY: 1 + onda * IDLE_ESCALA,
        alpha: 1,
        done: false,
      };
    },
  };
}

// O EFEITO de combate: surge rápido, fica no pico e some. É a curva oposta à do impacto —
// `impactMotion` acelera até o pico e volta, porque a peça vai e vem; o efeito não vai a lugar
// nenhum, ele APARECE.
export const FX_MS = 260;
export const FX_PICO_EM = 0.22;

export function fxMotion(durationMs = FX_MS): Motion {
  return {
    durationMs,
    sampleAt(elapsedMs) {
      if (elapsedMs >= durationMs) return { dx: 0, dy: 0, scaleX: 1, scaleY: 1, alpha: 0, done: true };
      const t = elapsedMs / durationMs;

      if (t < FX_PICO_EM) {
        // Entrada: cresce de 60% ao tamanho cheio e opacidade de zero a um. Rápido — o
        // jogador tem de ver o efeito APARECER no instante do golpe, não crescendo depois.
        const k = t / FX_PICO_EM;
        return { dx: 0, dy: 0, scaleX: 0.6 + 0.4 * k, scaleY: 0.6 + 0.4 * k, alpha: k, done: false };
      }

      // Saída: continua abrindo um pouco enquanto some. Abrir e sumir junto é o que faz o
      // efeito se dissipar em vez de ser apagado.
      const k = (t - FX_PICO_EM) / (1 - FX_PICO_EM);
      return { dx: 0, dy: 0, scaleX: 1 + k * 0.35, scaleY: 1 + k * 0.35, alpha: 1 - k * k, done: false };
    },
  };
}

// ---------------------------------------------------------------------------
// M26 2/N — as batidas da TELA de duelo
// ---------------------------------------------------------------------------

export interface DuelSceneBeat {
  readonly actorId: string;
  readonly targetId: string;
  readonly damage: number;
  readonly kind: 'strike' | 'counter' | 'miss' | 'heal' | 'death';
  readonly crit: boolean;
  readonly skillId: string | null;
}

// **Por que uma segunda leitura do MESMO log, e não um parâmetro em `duelBeats`.**
//
// As duas leituras querem coisas diferentes, e a diferença é de regra e não de gosto. O
// tabuleiro só pode animar o que aconteceu: "ação que não causou dano não vira batida", porque
// sacudir uma peça num golpe que errou seria a animação contradizendo o core. A tela precisa
// do contrário — ela existe para MOSTRAR o duelo, e um duelo em que a evasão de `spd` decidiu
// a troca não pode aparecer como um silêncio.
//
// O risco de duas leituras é divergirem. É o que o teste de paridade cobra: filtrar estas
// batidas pelas que têm dano tem de devolver exatamente as de `duelBeats`.
export function duelSceneBeats(result: DuelChoreographyInput): readonly DuelSceneBeat[] {
  const beats: DuelSceneBeat[] = [];

  for (const troca of result.trocas) {
    for (const acao of troca.actions) {
      const comum = { crit: acao.isCrit ?? false, skillId: acao.skillId ?? null };

      if (acao.damage > 0) {
        beats.push({ actorId: acao.actorId, targetId: acao.targetId, damage: acao.damage, kind: 'strike', ...comum });
      } else if (acao.hit === false) {
        // §8 — a evasão com teto. Só aqui, e nunca no tabuleiro.
        beats.push({ actorId: acao.actorId, targetId: acao.targetId, damage: 0, kind: 'miss', ...comum });
      }

      if ((acao.heal ?? 0) > 0) {
        beats.push({ actorId: acao.actorId, targetId: acao.actorId, damage: 0, kind: 'heal', ...comum });
      }

      const contra = acao.reaction?.counterDamage ?? 0;
      if (contra > 0) {
        beats.push({
          actorId: acao.targetId,
          targetId: acao.actorId,
          damage: contra,
          kind: 'counter',
          crit: false,
          skillId: null,
        });
      }

      const curaDaReacao = acao.reaction?.healDone ?? 0;
      if (curaDaReacao > 0) {
        beats.push({
          actorId: acao.targetId,
          targetId: acao.targetId,
          damage: 0,
          kind: 'heal',
          crit: false,
          skillId: null,
        });
      }
    }
  }

  if (result.finalHpAttacker <= 0) {
    beats.push({
      actorId: result.attackerId,
      targetId: result.attackerId,
      damage: 0,
      kind: 'death',
      crit: false,
      skillId: null,
    });
  }
  if (result.finalHpDefender <= 0) {
    beats.push({
      actorId: result.defenderId,
      targetId: result.defenderId,
      damage: 0,
      kind: 'death',
      crit: false,
      skillId: null,
    });
  }

  return beats;
}
