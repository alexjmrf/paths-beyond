import type { BattleUnit, Hero, Placement } from '@paths-beyond/core';

// M26 3/N — quem é cada unidade do tabuleiro, para o cliente DESENHAR.
//
// Medido em 1/N: em PvP, masmorra e replay o `BattleSetup` chega pronto do servidor e o
// cliente não consegue dizer que personagem é cada unidade. `BattleUnit.heroId` guarda a
// INSTÂNCIA de herói ("h-9f3a"), que é o que a conta possui — e o manifesto de arte é
// indexado pelo PERSONAGEM ("ally-guerreiro"), que é quem a pessoa é. Na campanha o cliente
// fecha essa distância pelo roster; em PvP não fecha nem em princípio, porque o time do
// defensor são instâncias de outra conta.
//
// **Por que ao lado do `BattleSetup` e não dentro dele** (decisão do usuário, 3/N):
// `characterId` em `BattleUnit` mexeria em `packages/core` e obrigaria `RULES_VERSION` a
// subir (regra 11) por um dado que NENHUMA regra lê — enquanto o critério de aceite do M26
// afirma o contrário, que o core sai intocado. Este mapa viaja no ticket, que é resposta de
// rota, e some sem deixar rastro no dia em que a arte mudar de forma.
//
// Puro, e num arquivo só, porque as quatro superfícies (arena, masmorra, capítulo, replay)
// precisam da MESMA resposta: quatro montagens seriam quatro chances de a mesma unidade sair
// desenhada de um jeito numa tela e de outro na seguinte.

/**
 * `unitId` → id de arte, para as unidades que TÊM um. Ausência é o estado normal de uma ficha
 * de cenário (reforço invocado, aliado de NPC) e significa "desenhe o glifo do M16".
 */
export function characterIdsForPlacements(placements: readonly Placement[]): Record<string, string> {
  const porUnidade: Record<string, string> = {};
  for (const placement of placements) {
    // O inimigo autorado JÁ é a chave do manifesto (M17 3/N autora o inimigo direto, e
    // `assemble.ts` copia o id dele para `heroId`). Ele entra aqui mesmo assim: um mapa que
    // cobrisse um lado só obrigaria o cliente a manter dois caminhos para sempre, e é
    // exatamente por manter dois caminhos que a campanha tinha arte e o resto não.
    if ('enemy' in placement) {
      porUnidade[placement.unitId] = placement.enemy.id;
      continue;
    }
    const characterId = placement.hero.characterId;
    if (characterId) porUnidade[placement.unitId] = characterId;
  }
  return porUnidade;
}

/**
 * O mesmo mapa para um REPLAY, onde não há mais placements — só o `BattleSetup` gravado.
 *
 * Derivado na leitura, e não gravado junto do replay: gravar exigiria migração e, pior,
 * deixaria de fora todo replay que já está no banco. Derivar dá arte aos antigos de graça.
 *
 * O preço, e é aceitável: um herói apagado desde a partida não resolve mais, e a unidade cai
 * no glifo do M16. Um replay é um registro do que aconteceu, não do que a conta tem hoje.
 */
export function characterIdsForReplayUnits(
  units: readonly Pick<BattleUnit, 'unitId' | 'heroId'>[],
  heroes: readonly Hero[],
): Record<string, string> {
  const porHeroId = new Map(heroes.map((hero) => [hero.id, hero.characterId] as const));
  const porUnidade: Record<string, string> = {};
  for (const unit of units) {
    const characterId = porHeroId.get(unit.heroId);
    if (characterId) porUnidade[unit.unitId] = characterId;
  }
  return porUnidade;
}
