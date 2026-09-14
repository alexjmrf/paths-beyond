import type { BattleOutcome, Hero } from '@paths-beyond/core';
import type { ContentCatalog } from '@paths-beyond/content/src/types.js';
import { nomeDeConteudo } from '../i18n/conteudo.js';
import type { Tradutor } from '../i18n/idioma.js';

// M32 — os rótulos que a batalha real mostrou crus.
//
// Com sessão de verdade (Railway) a tela dizia "Resultado: ongoing", listava quem vai à
// missão como `dev-wbsobanv-hero-jogador (class-espadachim)` e chamava a unidade na lista de
// iniciativa de `player-dev-wbsobanv-hero-jogador`. Nenhum dos três é texto de jogo: o
// primeiro é a união do core, os outros dois são chaves de transporte. O M25 traduziu as
// frases em volta e o M29 os nomes de conteúdo; o que ficou de fora foi exatamente o que só
// aparece com uma conta de verdade, porque a fixture local tem ids curtos e legíveis.
//
// Nome PRÓPRIO não se traduz (decisão do M25): Aren é Aren nas duas línguas. O que passa
// pela camada de idioma é a classe (`conteudo.classe.*`) e o desfecho (`desfecho.*`).

// `Record<BattleOutcome, string>` é exaustivo em tempo de compilação: um desfecho novo no
// core não compila sem chave, e `rotulosNaTela.test.ts` cobra o texto nas duas línguas.
export const CHAVE_DO_DESFECHO: Readonly<Record<BattleOutcome, string>> = {
  ongoing: 'desfecho.ongoing',
  victory: 'desfecho.victory',
  defeat: 'desfecho.defeat',
};

export function nomeDoDesfecho(t: Tradutor, desfecho: BattleOutcome): string {
  return t(CHAVE_DO_DESFECHO[desfecho]);
}

export interface RotuloDeHeroi {
  readonly nome: string;
  readonly classe: string;
}

type CatalogoDeRotulos = Pick<ContentCatalog, 'characters' | 'classes' | 'enemies'>;

// O personagem vem do catálogo do CLIENTE (`data/catalog.ts`, o mesmo `packages/data` lido
// por `import.meta.glob`), e não do servidor: o roster carrega `characterId`, e quem sabe o
// nome dele é o conteúdo. Sem personagem (herói de teste, dado antigo) fica o id — nunca
// `undefined` na tela.
export function rotuloDeHeroi(
  t: Tradutor,
  hero: Pick<Hero, 'id' | 'characterId' | 'classId'>,
  catalogo: CatalogoDeRotulos,
): RotuloDeHeroi {
  const personagem = hero.characterId ? catalogo.characters[hero.characterId] : undefined;
  const classe = catalogo.classes[hero.classId];
  return {
    nome: personagem?.name ?? hero.id,
    classe: nomeDeConteudo(t, 'classe', hero.classId, classe?.name ?? hero.classId),
  };
}

// A unidade do tabuleiro pelo nome de quem ela é. `heroesByUnitId` só existe do lado do
// jogador (ver a nota no store); o inimigo vem por `artIdByUnitId` — o mapa do ticket cobre os
// DOIS lados, e do lado inimigo o valor é o id de `enemies/`, que tem nome autorado desde o M27
// (M35 1/N, D43: `<função> [de <facção>]`, traduzido por `conteudo.inimigo.*`). Quem não é
// nem um nem outro (replay antigo, id desconhecido) continua com o `unitId`.
export function nomeDeUnidade(
  t: Tradutor,
  unitId: string,
  heroesByUnitId: Readonly<Record<string, Hero>>,
  artIdByUnitId: Readonly<Record<string, string>>,
  catalogo: CatalogoDeRotulos,
): string {
  const hero = heroesByUnitId[unitId];
  if (hero) return rotuloDeHeroi(t, hero, catalogo).nome;
  const artId = artIdByUnitId[unitId];
  const inimigo = artId ? catalogo.enemies[artId] : undefined;
  return inimigo && artId ? nomeDeConteudo(t, 'inimigo', artId, inimigo.name) : unitId;
}
