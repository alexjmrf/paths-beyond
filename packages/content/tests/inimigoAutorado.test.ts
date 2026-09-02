import { hashState, resolveEnemyCombatProfile } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';

// §8.1 (M17, sub-sessão 3/N) — A FORÇA CONGELADA.
//
// A tabela abaixo foi medida ANTES da migração, com o conteúdo ainda no modelo antigo: é o
// hash do `HeroCombatProfile` de cada uma das 43 unidades inimigas dos 14 encontros,
// resolvido pelo caminho de `Hero` com o catálogo real inteiro — curva do nível,
// multiplicador de despertar, flat de imprint, equipamento, sets, alcance de arma e as
// reações universais de §6.4. Depois da migração, cada uma dessas unidades é resolvida por
// `resolveEnemyCombatProfile` a partir de uma ficha autorada, e os hashes têm de bater.
//
// É o teste que autoriza a fatia a existir. A decisão do usuário ao abrir a sub-sessão foi
// "congelar a força de hoje em vez de reescolhê-la", e sem esta tabela isso seria uma
// intenção: trocar o modelo de inimigo mexeria na dificuldade dos 14 encontros em silêncio,
// e os testes de campanha e masmorra que já existem — que medem DESFECHO — só reprovariam
// se a diferença fosse grande o bastante para virar o resultado. Um inimigo 8% mais fraco
// passaria por todos eles.
//
// Quando alguém for de fato AFINAR dificuldade (a fatia de balanceamento, ou qualquer
// milestone futura), o certo é editar a ficha em `enemies/` e atualizar o hash aqui, num
// commit que diga que a dificuldade mudou. O que este arquivo impede é a dificuldade mudar
// sem ninguém dizer.
const PERFIS_CONGELADOS: Readonly<Record<string, string>> = {
  'encounter-campanha-1/unit-bandido-1': '55231a87',
  'encounter-campanha-2/unit-patrulheiro-1': 'c694beb4',
  'encounter-campanha-2/unit-patrulheiro-2': '55231a87',
  'encounter-campanha-2/unit-patrulheiro-3': '60952e0d',
  'encounter-campanha-3/unit-invasor-1': 'be1c829d',
  'encounter-campanha-3/unit-invasor-2': '82e1bedc',
  'encounter-campanha-3/unit-invasor-3': '3cb7d4c5',
  'encounter-campanha-4/unit-cerco-1': 'be1c829d',
  'encounter-campanha-4/unit-cerco-2': '82e1bedc',
  'encounter-campanha-4/unit-cerco-3': '3cb7d4c5',
  'encounter-campanha-4/unit-cerco-4': '70d1efb8',
  'encounter-campanha-5/unit-emboscada-1': '82e1bedc',
  'encounter-campanha-5/unit-emboscada-2': 'be1c829d',
  'encounter-campanha-5/unit-emboscada-3': '3cb7d4c5',
  'encounter-campanha-5/unit-emboscada-4': '9054056d',
  'encounter-campanha-6/unit-capelao': '32ed05ca',
  'encounter-campanha-6/unit-chefe': '18ce8005',
  'encounter-campanha-6/unit-guarda-portao': '44f7841c',
  'encounter-campanha-6/unit-sentinela-alada': 'f76b04af',
  'encounter-campo-de-treino-elite/treino-elite-1': '793e0c9a',
  'encounter-campo-de-treino-elite/treino-elite-2': '1780ac1e',
  'encounter-campo-de-treino-elite/treino-elite-3': '805b84e1',
  'encounter-campo-de-treino/treino-alvo-1': 'd3bc1fc3',
  'encounter-campo-de-treino/treino-alvo-2': '55231a87',
  'encounter-covil-do-tirano-elite/tirano-elite': 'ebf5ebac',
  'encounter-covil-do-tirano-elite/tirano-elite-clerigo': '8b473a60',
  'encounter-covil-do-tirano-elite/tirano-elite-guarda-1': '533736b3',
  'encounter-covil-do-tirano-elite/tirano-elite-guarda-2': '533736b3',
  'encounter-covil-do-tirano/tirano': '3fdbf79d',
  'encounter-covil-do-tirano/tirano-guarda-1': '04407ded',
  'encounter-covil-do-tirano/tirano-guarda-2': '04407ded',
  'encounter-forja-abandonada-elite/forja-elite-arcanista': 'dd884c7f',
  'encounter-forja-abandonada-elite/forja-elite-arqueiro': 'aeadb4ae',
  'encounter-forja-abandonada-elite/forja-elite-guarda-1': '19478d05',
  'encounter-forja-abandonada-elite/forja-elite-guarda-2': '41b506c7',
  'encounter-forja-abandonada/forja-arqueiro': '3cb7d4c5',
  'encounter-forja-abandonada/forja-guarda-1': '9763dcad',
  'encounter-forja-abandonada/forja-guarda-2': 'a8bd14dd',
  'encounter-veio-de-prata-elite/veio-elite-1': '68a2c46b',
  'encounter-veio-de-prata-elite/veio-elite-2': '2e1b3464',
  'encounter-veio-de-prata-elite/veio-elite-3': 'f0e4c593',
  'encounter-veio-de-prata/veio-saqueador-1': 'd8136206',
  'encounter-veio-de-prata/veio-saqueador-2': 'd9d582f2',
};

const catalog = loadCatalogFromDisk();

const unidadesInimigas = [...catalog.encounters, ...Object.values(catalog.dungeonEncounters)].flatMap((encontro) =>
  encontro.units
    .filter((u) => u.side === 'enemy')
    .map((u) => [`${encontro.id}/${u.unitId}`, u.side === 'enemy' ? u.enemyId : ''] as const),
);

describe('a força dos inimigos migrados é a mesma de antes da migração', () => {
  it('as 43 unidades inimigas continuam existindo, e a tabela cobre todas', () => {
    expect(unidadesInimigas.length).toBe(Object.keys(PERFIS_CONGELADOS).length);
    for (const [chave] of unidadesInimigas) {
      expect(PERFIS_CONGELADOS[chave], `${chave} não está na tabela congelada`).toBeDefined();
    }
  });

  it.each(unidadesInimigas)('%s: o perfil de combate resolvido tem o hash de antes', (chave, enemyId) => {
    const enemy = catalog.enemies[enemyId];
    expect(enemy, `${chave}: ${enemyId} não está no catálogo`).toBeDefined();

    const perfil = resolveEnemyCombatProfile({
      enemy: enemy!,
      skillsCatalog: catalog.skills,
      weaponDuelRanges: catalog.weaponDuelRanges,
      baselineReactionSkillIds: catalog.baselineReactionSkillIds,
    });

    expect(hashState(perfil), chave).toBe(PERFIS_CONGELADOS[chave]);
  });
});
