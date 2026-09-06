import type { ContentCatalog } from '@paths-beyond/content/src/types.js';
import type { EspecificacaoDeArte } from './prompt.js';

// M26 — a lista de peças a gerar, LIDA do que já está autorado.
//
// Ninguém escolhe aqui o que cada unidade é: o personagem já declara a classe e a arma
// inicial, a classe já declara o tipo de unidade e o de movimento, e o inimigo de fase já
// declara os três direto (M17 3/N). Este arquivo só junta.
//
// A consequência prática é o teste de completude do M26 nunca precisar de manutenção: unidade
// nova em `packages/data` aparece nesta lista sozinha, e é a lista que o gerador percorre.

export function especificacoesDe(catalogo: ContentCatalog): readonly EspecificacaoDeArte[] {
  const specs: EspecificacaoDeArte[] = [];

  for (const personagem of Object.values(catalogo.characters)) {
    const classe = catalogo.classes[personagem.classId];
    if (!classe) throw new Error(`${personagem.id} referencia a classe ${personagem.classId}, que não existe.`);
    specs.push({
      unitId: personagem.id,
      nome: personagem.name,
      side: 'player',
      // A arma da ficha inicial, e não a primeira arma permitida da classe: é a que o jogador
      // vê na primeira batalha, e a peça tem de mostrar o que ele está segurando.
      weaponType: personagem.startingHero.weaponType,
      unitType: classe.unitType,
      moveType: classe.moveType,
      classId: classe.id,
    });
  }

  for (const inimigo of Object.values(catalogo.enemies)) {
    specs.push({
      unitId: inimigo.id,
      nome: inimigo.name,
      side: 'enemy',
      weaponType: inimigo.weaponType,
      unitType: inimigo.unitType,
      moveType: inimigo.moveType,
    });
  }

  // Ordem estável por id: o gerador percorre esta lista, e uma ordem que dependesse da ordem
  // de leitura do disco mudaria qual unidade recebe qual seed derivada.
  return [...specs].sort((a, b) => a.unitId.localeCompare(b.unitId));
}
