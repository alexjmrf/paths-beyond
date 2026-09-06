import type { MoveType, UnitType, WeaponType } from '@paths-beyond/core';

// M26 — o prompt DERIVADO da unidade.
//
// D22: "a especificação de cada peça derivada do que já está autorado em `packages/data`
// (classe, arma, papel e árvore de cada personagem já descrevem o que a imagem precisa
// mostrar)". Este arquivo é essa frase virando código.
//
// Escrever cinquenta prompts à mão seria cinquenta chances de o elenco não parecer o mesmo
// jogo — e D25 registrou que o que separa "arte de IA" de "slop" nos casos pesquisados foi
// **consistência e acabamento**. Derivar dá as duas de graça: o bloco de estilo é literalmente
// o mesmo texto em todas as peças, e o que varia varia por um campo que já está autorado.
//
// O arquivo é PURO e não fala com ninguém: é o que permite ver os cinquenta prompts sem gastar
// uma geração da assinatura.

export interface EspecificacaoDeArte {
  readonly unitId: string;
  readonly nome: string;
  readonly side: 'player' | 'enemy';
  readonly weaponType: WeaponType;
  readonly unitType: UnitType;
  readonly moveType: MoveType;
  // Só a campanha conhece a classe (o `BattleSetup` do PvP e da masmorra não a carrega). Ela
  // entra como refinamento quando existe, no mesmo espírito da resolução em três níveis do
  // `classGlyphs.ts`: o perfil sozinho já produz uma peça legível.
  readonly classId?: string;
}

// O bloco que NÃO varia. Ele carrega as três exigências que o tabuleiro faz e que não se
// corrigem depois — se saírem erradas, se regera:
//   - vista de cima, porque o tabuleiro é visto de cima e um sprite de perfil não assenta no
//     tile;
//   - fundo transparente, porque a peça é desenhada por cima do terreno programático;
//   - contorno escuro e paleta curta, porque a peça precisa se ler sobre a rampa de luminância
//     dos terrenos de M16 sem competir com ela em detalhe (D22, item 5).
export const ESTILO =
  'pixel art game sprite, low top-down 3/4 view, single character centered and fully inside the frame, ' +
  'full body, facing the viewer, transparent background, crisp dark outline, limited palette, ' +
  'flat shading with one light source from the upper left, readable silhouette at small size, no text, no shadow on the ground';

// §6.1 — a arma decide o alcance no duelo, e é a informação tática mais cara de se perder num
// relance. Cada uma tem de sair com uma silhueta própria pelo mesmo motivo que cada glifo de
// classe tem: distinguir só por cor falha no modo daltônico e falha a três tiles de distância.
const ARMA: Readonly<Record<WeaponType, string>> = {
  sword: 'wielding a straight steel sword and a small round shield',
  axe: 'wielding a heavy two-handed battle axe',
  spear: 'wielding a long spear held upright',
  bow: 'drawing a tall longbow, a quiver of arrows on the back',
  arcane: 'holding an arcane staff crowned with a glowing crystal',
  nature: 'holding a gnarled wooden staff wrapped in living vines',
  holy: 'holding a holy mace and a hanging censer',
};

// §4 — o tipo de unidade é o que o triângulo de dano e o terreno enxergam. Ele decide a MASSA
// da peça, que é o que o olho lê antes de qualquer detalhe.
const PAPEL: Readonly<Record<UnitType, string>> = {
  infantry: 'a nimble foot soldier in light leather armour',
  cavalry: 'a mounted rider in a flowing riding cloak',
  flying: 'an airborne rider in a windswept cloak',
  armored: 'a heavily armoured knight in thick layered plate',
  caster: 'a robed spellcaster with a hooded mantle',
};

// A montaria vem do `moveType` e não do `unitType`, porque é o `moveType` que decide o que a
// unidade atravessa no mapa (§5.1). Uma unidade que voa desenhada a pé mente sobre a regra que
// mais muda o tabuleiro.
const MONTARIA: Readonly<Record<MoveType, string>> = {
  foot: '',
  heavy: '',
  aquatic: '',
  cavalry: 'mounted on a armoured warhorse',
  flying: 'mounted on a winged griffin with spread feathered wings',
};

// A paleta por lado. O HUD já diz de que lado a peça é — forma do corpo e anel, sem depender de
// cor (M13 4/N) —, então isto não é o que carrega a informação: é o que evita que 41 inimigos
// pareçam o exército do jogador, o que é legibilidade tática (§1.1) e não decoração.
const PALETA: Readonly<Record<'player' | 'enemy', string>> = {
  player: 'steel blue and warm bronze colour scheme',
  enemy: 'dark crimson and blackened iron colour scheme',
};

export function descricaoDe(espec: EspecificacaoDeArte): string {
  const montaria = MONTARIA[espec.moveType];
  return [PAPEL[espec.unitType], ARMA[espec.weaponType], montaria, PALETA[espec.side], ESTILO]
    .filter((parte) => parte.length > 0)
    .join(', ');
}
