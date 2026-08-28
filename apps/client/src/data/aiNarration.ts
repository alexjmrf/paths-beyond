import type { AiTurnStep, BattleState, Coord, DuelResult } from '@paths-beyond/core';

// M16, sub-sessão 4/N — a narração do turno da IA.
//
// O defeito que esta fatia fecha: até 3/N os inimigos TELEPORTAVAM. O jogador confirmava a
// jogada dele, o tabuleiro piscava e os inimigos estavam noutros tiles — sem percurso, sem
// duelo na tela, às vezes com uma peça a menos. §1.1 põe legibilidade tática entre os pilares,
// e a ameaça do round seguinte se decide olhando exatamente por onde o inimigo veio.
//
// A mesma inversão de 1/N (a forma) e de 3/N (o tempo), agora aplicada à SEQUÊNCIA: este módulo
// converte o relato do core (`AiTurnStep[]`) numa lista ordenada de CENAS e não anima nada.
// Quem tem relógio continua sendo o `MapCanvas`, num ponto só. O ganho é o mesmo das outras
// duas: dá para afirmar a propriedade que define a fatia — *toda peça que mudou de tile tem uma
// cena que a leva até lá, e quem não saiu do lugar não ganha cena* — sem browser e sem Pixi.
//
// A narração não decide nada. O core já resolveu o turno inteiro antes do primeiro quadro; aqui
// só se escolhe o que TEM imagem. Ela também não infere: caminho e duelo vêm do relato, nunca
// reconstruídos — foi a razão de `resolveAiTurnsLogged` existir (ver DECISIONS.md, M16 4/N).

export type AiScene =
  | {
      readonly kind: 'move';
      // O estado imediatamente antes do passo: é de onde sai a geometria da cena (onde cada
      // peça estava, quem ainda estava viva) sem o cliente reaplicar um comando sequer.
      readonly stateBefore: BattleState;
      readonly unitId: string;
      readonly path: readonly Coord[];
    }
  | {
      readonly kind: 'duel';
      readonly stateBefore: BattleState;
      readonly duelResult: DuelResult;
    };

export function narrateAiTurns(steps: readonly AiTurnStep[]): readonly AiScene[] {
  const scenes: AiScene[] = [];

  for (const step of steps) {
    const { command } = step;

    if (command.t === 'move') {
      // Caminho de um tile só não tem imagem: a peça sairia e chegaria no mesmo lugar, e a
      // pausa apareceria como o tabuleiro travando sem motivo.
      if (command.path.length < 2) continue;
      scenes.push({ kind: 'move', stateBefore: step.stateBefore, unitId: command.unitId, path: command.path });
      continue;
    }

    if (command.t === 'engage') {
      // Sem `duelResult` não há o que contar, e inventar batidas seria a animação afirmando o
      // que o core não decidiu. Não acontece em jogo (`applyCommand` sempre devolve o resultado
      // de um `engage` aceito); a guarda existe porque o tipo permite e o silêncio seria pior.
      if (!step.duelResult) continue;
      scenes.push({ kind: 'duel', stateBefore: step.stateBefore, duelResult: step.duelResult });
      continue;
    }

    // `wait` — e qualquer comando futuro sem imagem própria — não vira cena. A IA de mapa só
    // emite `move`, `engage` e `wait` (§9.1), e ficar parado é exatamente o que o tabuleiro já
    // mostra.
  }

  return scenes;
}
