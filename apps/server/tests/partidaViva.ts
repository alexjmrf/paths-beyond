import {
  computeReachableTiles,
  coordKey,
  isInBounds,
  manhattanDistance,
  openGateCoords,
  orthogonalNeighbors,
  tileAt,
  type BattleCommand,
  type BattleUnit,
  type Coord,
  type GridMap,
  type MoveType,
  type WinCondition,
} from '@paths-beyond/core';
import type { FastifyInstance } from 'fastify';

// M36 2/N (D47) — O PILOTO CEGO: joga uma batalha viva vendo só o que o jogador vê.
//
// **Por que ele não é `playFromSetup`.** O piloto de `packages/content` joga a partir do
// `BattleSetup` COMPLETO — ele lê `enemy.moveRange` e `enemy.duelRange` para calcular ameaça, e
// decide com a ficha do inimigo na mão. Depois de D47 nenhum cliente tem isso, então um teste
// que continuasse usando aquele piloto estaria provando que o jogo é jogável com uma informação
// que o jogo não entrega mais. Este piloto joga com o que `EstadoVisivel` traz: posição, HP, AP,
// PP, iniciativa — e as próprias unidades inteiras.
//
// **O que ele perdeu, e é a decisão de D47 em ação:** a zona de ameaça. O piloto antigo mantinha
// a unidade escoltada fora do alcance inimigo porque sabia o alcance; este SUPÕE um alcance
// (`ALCANCE_SUPOSTO`), que é literalmente o que um jogador faz — estimar pelo que já viu. A
// estimativa é conservadora de propósito: errar para mais mantém a escoltada cautelosa, e é
// melhor um piloto medroso do que um teste que mede a imprudência dele.
//
// Ele também é a prévia do que o cliente faz na 4/N: um comando por requisição, o estado
// chegando de volta redigido, e nenhuma simulação local.

/**
 * O alcance que o piloto SUPÕE de todo inimigo (movimento + arma). Sai de uma leitura do
 * conteúdo: a maioria das unidades anda 4 e engaja a 1. É uma suposição, não um dado — e é
 * exatamente por isso que ela é um número escrito aqui e não uma leitura do estado.
 */
const ALCANCE_SUPOSTO = 5;

/** Teto de comandos, como `COMMAND_BUDGET` do piloto de conteúdo: um laço travado falha alto. */
const TETO_DE_COMANDOS = 400;

interface UnidadeVisivelDeTeste {
  readonly unitId: string;
  readonly side: 'player' | 'enemy';
  readonly pos: Coord;
  readonly hp: number;
  readonly hasActedThisRound: boolean;
  // Presentes só nas unidades do próprio jogador — é essa a assimetria que se está testando.
  readonly moveType?: MoveType;
  readonly moveRange?: number;
  readonly duelRange?: number;
}

export interface EstadoVisivelDeTeste {
  readonly map: GridMap;
  readonly units: readonly UnidadeVisivelDeTeste[];
  readonly initiativeOrder: readonly { readonly unitId: string }[];
  readonly round: number;
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
  readonly winCondition: WinCondition;
  readonly distanceMovedThisTurn: Readonly<Record<string, number>>;
  readonly gateState?: Readonly<Record<string, { readonly opened: boolean; readonly hits: number }>>;
}

function minhas(estado: EstadoVisivelDeTeste): readonly UnidadeVisivelDeTeste[] {
  return estado.units.filter((u) => u.side === 'player');
}

function inimigasVivas(estado: EstadoVisivelDeTeste): readonly UnidadeVisivelDeTeste[] {
  return estado.units.filter((u) => u.side !== 'player' && u.hp > 0);
}

function rotaAte(map: GridMap, moveType: MoveType, goal: Coord): ReadonlyMap<string, number> {
  const dist = new Map<string, number>([[coordKey(goal), 0]]);
  let fronteira: Coord[] = [goal];
  while (fronteira.length > 0) {
    const proxima: Coord[] = [];
    for (const coord of fronteira) {
      const base = dist.get(coordKey(coord))!;
      for (const vizinho of orthogonalNeighbors(coord)) {
        if (!isInBounds(map, vizinho)) continue;
        const key = coordKey(vizinho);
        if (dist.has(key)) continue;
        const tile = tileAt(map, vizinho);
        if (!tile) continue;
        if (tile.object === 'wall') continue;
        if (map.terrains[tile.terrain]?.moveCost[moveType] === 'impassable') continue;
        dist.set(key, base + 1);
        proxima.push(vizinho);
      }
    }
    fronteira = proxima;
  }
  return dist;
}

function alcancaveis(estado: EstadoVisivelDeTeste, unidade: UnidadeVisivelDeTeste) {
  const aliados = estado.units
    .filter((u) => u.side === 'player' && u.unitId !== unidade.unitId && u.hp > 0)
    .map((u) => u.pos);
  const inimigos = inimigasVivas(estado).map((u) => u.pos);
  const restante = (unidade.moveRange ?? 0) - (estado.distanceMovedThisTurn[unidade.unitId] ?? 0);
  return computeReachableTiles(
    {
      map: estado.map,
      moveType: unidade.moveType ?? 'foot',
      occupiedByAlly: aliados,
      occupiedByEnemy: inimigos,
      // `openGateCoords` só lê `map` e `gateState` — as duas coisas visíveis.
      openGates: openGateCoords({ map: estado.map, gateState: estado.gateState } as never),
    },
    unidade.pos,
    restante,
  );
}

function objetivoDe(
  condition: WinCondition,
  unidade: UnidadeVisivelDeTeste,
  portadorDoObjetivo: string | undefined,
): Coord | undefined {
  switch (condition.t) {
    case 'rout':
    case 'surviveRounds':
      return undefined;
    case 'escort':
      return unidade.unitId === condition.unitId ? condition.target : undefined;
    case 'seize':
    case 'defend':
      return unidade.unitId === portadorDoObjetivo ? condition.target : undefined;
  }
}

function ameacado(estado: EstadoVisivelDeTeste, coord: Coord): boolean {
  // A suposição, em lugar do dado. É o que o jogador faz depois de D47.
  return inimigasVivas(estado).some((inimigo) => manhattanDistance(coord, inimigo.pos) <= ALCANCE_SUPOSTO);
}

function passoRumoA(
  estado: EstadoVisivelDeTeste,
  unidade: UnidadeVisivelDeTeste,
  goal: Coord,
  evitandoAmeaca = false,
): BattleCommand | undefined {
  const rota = rotaAte(estado.map, unidade.moveType ?? 'foot', goal);
  const atual = rota.get(coordKey(unidade.pos)) ?? Infinity;
  const melhor = [...alcancaveis(estado, unidade)]
    .map((tile) => ({ tile, distancia: rota.get(coordKey(tile.coord)) ?? Infinity }))
    .filter((entrada) => entrada.distancia < atual)
    .filter((entrada) => !evitandoAmeaca || !ameacado(estado, entrada.tile.coord))
    .sort((a, b) => {
      if (a.distancia !== b.distancia) return a.distancia - b.distancia;
      if (a.tile.cost !== b.tile.cost) return a.tile.cost - b.tile.cost;
      return a.tile.coord.y - b.tile.coord.y || a.tile.coord.x - b.tile.coord.x;
    })[0];
  return melhor ? { t: 'move', unitId: unidade.unitId, path: melhor.tile.path } : undefined;
}

export function decidirComandoCego(estado: EstadoVisivelDeTeste, unidade: UnidadeVisivelDeTeste): BattleCommand {
  const portador = estado.initiativeOrder
    .map((e) => estado.units.find((u) => u.unitId === e.unitId))
    .find((u): u is UnidadeVisivelDeTeste => !!u && u.side === 'player' && u.hp > 0)?.unitId;
  const goal = objetivoDe(estado.winCondition, unidade, portador);
  const evitaCombate = estado.winCondition.t === 'escort' && unidade.unitId === estado.winCondition.unitId;
  const inimigos = inimigasVivas(estado);

  if (goal) {
    if (manhattanDistance(unidade.pos, goal) > 0) {
      const passo = passoRumoA(estado, unidade, goal, evitaCombate);
      if (passo) return passo;
    }
    if (evitaCombate) return { t: 'wait', unitId: unidade.unitId };
  }

  // O alvo é escolhido pelo HP VISÍVEL. O jogador continua podendo ver quem está ferido — é
  // exatamente o que D47 mantém na lista do que se vê.
  const noAlcance = inimigos.filter(
    (inimigo) => manhattanDistance(unidade.pos, inimigo.pos) <= (unidade.duelRange ?? 1),
  );
  const alvo = [...noAlcance].sort((a, b) => a.hp - b.hp || (a.unitId < b.unitId ? -1 : 1))[0];
  if (alvo) return { t: 'engage', unitId: unidade.unitId, targetId: alvo.unitId };

  if (!goal && inimigos.length > 0) {
    const maisPerto = [...inimigos].sort(
      (a, b) =>
        manhattanDistance(unidade.pos, a.pos) - manhattanDistance(unidade.pos, b.pos) ||
        (a.unitId < b.unitId ? -1 : 1),
    )[0]!;
    const passo = passoRumoA(estado, unidade, maisPerto.pos);
    if (passo) return passo;
  }

  return { t: 'wait', unitId: unidade.unitId };
}

export interface RespostaDeComando {
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
  readonly roundsPlayed: number;
  readonly visivel: EstadoVisivelDeTeste;
  readonly liquidacao?: Record<string, unknown>;
  readonly passosDaIa: readonly unknown[];
}

export interface JogadaViva {
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
  readonly roundsPlayed: number;
  readonly comandos: number;
  /** A resposta do comando que FECHOU a batalha — é onde mora a liquidação. */
  readonly ultima: RespostaDeComando | null;
}

/**
 * Joga uma partida viva do começo ao fim, um comando por requisição. `enviar` é a função de POST
 * do arquivo de teste, para cada um manter o seu jeito de autenticar.
 */
export async function jogarPartidaViva(
  enviar: (rota: string, corpo: unknown) => Promise<{ status: number; body: Record<string, unknown> }>,
  nonce: string,
  inicial: EstadoVisivelDeTeste,
): Promise<JogadaViva> {
  let estado = inicial;
  let ultima: RespostaDeComando | null = null;
  let comandos = 0;

  while (estado.outcome === 'ongoing' && comandos < TETO_DE_COMANDOS) {
    const proxima = estado.initiativeOrder
      .map((e) => estado.units.find((u) => u.unitId === e.unitId))
      .find((u): u is UnidadeVisivelDeTeste => !!u && u.side === 'player' && u.hp > 0 && !u.hasActedThisRound);
    if (!proxima) break; // só restou IA pendente ou ninguém

    const command = decidirComandoCego(estado, proxima);
    const resposta = await enviar(`/matches/${nonce}/commands`, { command });
    comandos += 1;
    if (resposta.status !== 200) {
      throw new Error(`comando recusado (${resposta.status}): ${JSON.stringify(resposta.body)}`);
    }
    ultima = resposta.body as unknown as RespostaDeComando;
    estado = ultima.visivel;
  }

  return { outcome: estado.outcome, roundsPlayed: estado.round, comandos, ultima };
}

/** Açúcar para o caso comum: abrir e jogar até o fim. */
export async function abrirEJogar(
  enviar: (rota: string, corpo: unknown) => Promise<{ status: number; body: Record<string, unknown> }>,
  rotaDeAbertura: string,
  corpo: unknown,
): Promise<JogadaViva & { readonly nonce: string; readonly aberturaStatus: number; readonly abertura: Record<string, unknown> }> {
  const abertura = await enviar(rotaDeAbertura, corpo);
  if (abertura.status !== 201) {
    return {
      nonce: '',
      aberturaStatus: abertura.status,
      abertura: abertura.body,
      outcome: 'ongoing',
      roundsPlayed: 0,
      comandos: 0,
      ultima: null,
    };
  }
  const nonce = abertura.body.nonce as string;
  const jogada = await jogarPartidaViva(enviar, nonce, abertura.body.visivel as unknown as EstadoVisivelDeTeste);
  return { ...jogada, nonce, aberturaStatus: abertura.status, abertura: abertura.body };
}

/** Só para tipar o que os testes leem do `BattleUnit` do próprio lado. */
export type UnidadeDoJogador = BattleUnit;
