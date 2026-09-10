import { hashState, resolveEnemyCombatProfile } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';

// §8.1 (M17, sub-sessão 3/N) — A FORÇA CONGELADA.
//
// A tabela abaixo foi medida ANTES da migração, com o conteúdo ainda no modelo antigo: é o
// hash do `HeroCombatProfile` resolvido pelo caminho de `Hero` com o catálogo real inteiro —
// curva do nível, multiplicador de despertar, flat de imprint, equipamento, sets, alcance de
// arma e as reações universais de §6.4. Depois da migração, cada inimigo é resolvido por
// `resolveEnemyCombatProfile` a partir de uma ficha autorada, e os hashes têm de bater.
//
// É o teste que autorizou aquela fatia a existir. A decisão do usuário ao abri-la foi
// "congelar a força de hoje em vez de reescolhê-la", e sem esta tabela isso seria uma
// intenção: trocar o modelo de inimigo mexeria na dificuldade dos encontros em silêncio, e os
// testes de campanha e masmorra que já existem — que medem DESFECHO — só reprovariam se a
// diferença fosse grande o bastante para virar o resultado. Um inimigo 8% mais fraco passaria
// por todos eles.
//
// **M27 2/N — a chave passou a ser o INIMIGO, e não a POSIÇÃO dele num encontro.**
//
// A tabela nasceu com uma linha por unidade colocada (`encounter-campanha-4/unit-cerco-1`),
// que era o recorte certo com 43 unidades em 14 encontros. A demo levou a campanha a 30
// missões e umas 70 unidades inimigas colocadas — e o hash NUNCA dependeu da posição: ele sai
// de `catalog.enemies[enemyId]` e de mais nada. A tabela antiga guardava, portanto, o mesmo
// hash repetido em até seis linhas, e autorar uma missão obrigava a copiá-lo de novo.
//
// A propriedade que ela protege continua inteira e ficou mais forte: agora ela cobre os 41
// inimigos do catálogo, inclusive os que nenhum encontro coloca hoje — antes, um inimigo sem
// posição podia mudar de stat sem nada reclamar. O que a chave por posição também dizia (QUAL
// inimigo está em qual vaga) nunca foi assunto deste arquivo; quem responde por isso é
// `campanha.test.ts`, que joga o encontro.
//
// Quando alguém for de fato AFINAR dificuldade (a fatia de balanceamento, ou qualquer
// milestone futura), o certo é editar a ficha em `enemies/` e atualizar o hash aqui, num
// commit que diga que a dificuldade mudou. O que este arquivo impede é a dificuldade mudar
// sem ninguém dizer.
const PERFIS_CONGELADOS: Readonly<Record<string, string>> = {
  'enemy-bandido': '55231a87',
  'enemy-capelao': '32ed05ca',
  'enemy-cerco-arqueiro': '3cb7d4c5',
  'enemy-cerco-grifeiro': '70d1efb8',
  'enemy-cerco-guerreiro': 'be1c829d',
  'enemy-cerco-lanceiro': '82e1bedc',
  'enemy-chefe': '18ce8005',
  'enemy-emboscada-arqueiro': '3cb7d4c5',
  'enemy-emboscada-couracado': '9054056d',
  'enemy-emboscada-guerreiro': 'be1c829d',
  'enemy-emboscada-lanceiro': '82e1bedc',
  'enemy-forja-arqueiro': '3cb7d4c5',
  'enemy-forja-elite-arcanista': 'dd884c7f',
  'enemy-forja-elite-arqueiro': 'aeadb4ae',
  'enemy-forja-elite-guarda-couracado': '19478d05',
  'enemy-forja-elite-guarda-espadachim': '41b506c7',
  'enemy-forja-guarda-couracado': '9763dcad',
  'enemy-forja-guarda-espadachim': 'a8bd14dd',
  'enemy-guarda-portao': '44f7841c',
  'enemy-invasor-arqueiro': '3cb7d4c5',
  'enemy-invasor-guerreiro': 'be1c829d',
  'enemy-invasor-lanceiro': '82e1bedc',
  'enemy-patrulheiro-arqueiro': '60952e0d',
  'enemy-patrulheiro-guerreiro': '55231a87',
  'enemy-patrulheiro-lanceiro': 'c694beb4',
  'enemy-sentinela-alada': 'f76b04af',
  'enemy-tirano': '3fdbf79d',
  'enemy-tirano-elite': 'ebf5ebac',
  'enemy-tirano-elite-clerigo': '8b473a60',
  'enemy-tirano-elite-guarda': '533736b3',
  'enemy-tirano-guarda': '04407ded',
  'enemy-treino-alvo-espadachim': 'd3bc1fc3',
  'enemy-treino-alvo-guerreiro': '55231a87',
  'enemy-treino-elite-arqueiro': '1780ac1e',
  'enemy-treino-elite-clerigo': '805b84e1',
  'enemy-treino-elite-espadachim': '793e0c9a',
  'enemy-veio-elite-couracado': '2e1b3464',
  'enemy-veio-elite-espadachim': '68a2c46b',
  'enemy-veio-elite-grifeiro': 'f0e4c593',
  'enemy-veio-saqueador-couracado': 'd9d582f2',
  'enemy-veio-saqueador-espadachim': 'd8136206',
};

const catalog = loadCatalogFromDisk();

const inimigosDoCatalogo = Object.keys(catalog.enemies).sort();

// Toda unidade inimiga colocada, de campanha e de masmorra. Não é a chave da tabela — é o
// consumidor dela: o que este arquivo cobra é que ninguém coloque no tabuleiro um inimigo
// cuja força não esteja congelada.
const colocados = [...catalog.encounters, ...Object.values(catalog.dungeonEncounters)].flatMap((encontro) =>
  encontro.units.filter((u) => u.side === 'enemy').map((u) => [`${encontro.id}/${u.unitId}`, u.enemyId] as const),
);

describe('a força dos inimigos migrados é a mesma de antes da migração', () => {
  it('a tabela cobre o catálogo inteiro, e nada além dele', () => {
    // Nos dois sentidos: inimigo novo sem hash entra sem ninguém medir a força dele, e hash
    // órfão é uma linha que sobreviveu ao inimigo que ela descrevia.
    expect(inimigosDoCatalogo).toEqual(Object.keys(PERFIS_CONGELADOS).sort());
  });

  it('nenhuma unidade colocada usa inimigo de fora da tabela', () => {
    expect(colocados.length).toBeGreaterThan(0);
    for (const [onde, enemyId] of colocados) {
      expect(PERFIS_CONGELADOS[enemyId], `${onde} usa ${enemyId}, que não está congelado`).toBeDefined();
    }
  });

  it.each(inimigosDoCatalogo)('%s: o perfil de combate resolvido tem o hash de antes', (enemyId) => {
    const perfil = resolveEnemyCombatProfile({
      enemy: catalog.enemies[enemyId]!,
      skillsCatalog: catalog.skills,
      weaponDuelRanges: catalog.weaponDuelRanges,
      baselineReactionSkillIds: catalog.baselineReactionSkillIds,
    });

    expect(hashState(perfil), enemyId).toBe(PERFIS_CONGELADOS[enemyId]);
  });
});
