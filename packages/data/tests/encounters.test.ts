import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import dungeonEncounterSchema from '../schemas/dungeon-encounters.schema.js';
import encounterSchema from '../schemas/encounters.schema.js';
import { findJsonFiles } from '../validate.js';

// §8.1 (M17, 3/N) — o CRITÉRIO 2 do milestone, provado onde ele é decidível: na forma.
//
// "Nenhum inimigo de campanha ou masmorra passa por `Hero`/classe: todos são autorados
// direto, e um teste garante que o caminho antigo não é mais alcançável a partir do
// conteúdo." A garantia mais forte possível não é varrer os arquivos procurando `hero` do
// lado inimigo — é o schema tornar esse arquivo IMPOSSÍVEL de escrever. Uma unidade
// `side: 'enemy'` não tem onde pôr um herói; uma `side: 'player'` não tem onde pôr um
// `enemyId`. Os dois testes existem mesmo assim: o do schema porque prova a forma, e a
// varredura do conteúdo real porque prova que a migração dos 14 encontros terminou.

const DATA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const unidadeJogador = {
  unitId: 'unit-heroi',
  side: 'player',
  hero: {
    id: 'hero-jogador',
    characterId: 'hero-jogador',
    classId: 'class-espadachim',
    level: 10,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType: 'sword',
    duelSkills: ['skill-basico'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-basico', conditions: [] }],
  },
  pos: { x: 1, y: 1 },
  height: 0,
};

const unidadeInimiga = {
  unitId: 'unit-bandido-1',
  side: 'enemy',
  enemyId: 'enemy-bandido',
  pos: { x: 5, y: 5 },
  height: 0,
  aiArchetype: 'aggressive',
};

function encontro(overrides: Record<string, unknown> = {}) {
  return {
    id: 'encounter-teste',
    name: 'Teste',
    mapId: 'map-teste',
    chapter: 1,
    permadeath: 'casual',
    units: [unidadeJogador, unidadeInimiga],
    ...overrides,
  };
}

function masmorra(units: unknown[]) {
  return { id: 'encounter-masmorra', name: 'Masmorra', mapId: 'map-teste', permadeath: 'casual', units };
}

describe('encounter: o lado do jogador traz personagem, o lado inimigo traz inimigo autorado', () => {
  it('aceita um encontro com as duas formas convivendo', () => {
    expect(() => encounterSchema.parse(encontro())).not.toThrow();
    expect(() => dungeonEncounterSchema.parse(masmorra([unidadeJogador, unidadeInimiga]))).not.toThrow();
  });

  it('unidade inimiga com `hero` é RECUSADA — é o caminho antigo, e ele não é mais escrevível', () => {
    const antiga = { ...unidadeJogador, unitId: 'unit-bandido-1', side: 'enemy', pos: { x: 5, y: 5 } };
    expect(() => encounterSchema.parse(encontro({ units: [unidadeJogador, antiga] }))).toThrow();
    expect(() => dungeonEncounterSchema.parse(masmorra([unidadeJogador, antiga]))).toThrow();
  });

  it('unidade do jogador com `enemyId` é recusada — o recíproco, e ele importa igual', () => {
    // Sem esta metade, um personagem poderia ser trocado por um inimigo autorado no elenco
    // do jogador, e a party entraria em campo sem progressão nenhuma por trás.
    const trocada = { unitId: 'unit-heroi', side: 'player', enemyId: 'enemy-bandido', pos: { x: 1, y: 1 }, height: 0 };
    expect(() => encounterSchema.parse(encontro({ units: [trocada, unidadeInimiga] }))).toThrow();
  });

  it('unidade inimiga sem `enemyId` é recusada', () => {
    const semFicha = { unitId: 'unit-bandido-1', side: 'enemy', pos: { x: 5, y: 5 }, height: 0 };
    expect(() => encounterSchema.parse(encontro({ units: [unidadeJogador, semFicha] }))).toThrow();
  });

  it('herói de CAMPANHA sem `characterId` é recusado — na campanha, o herói do jogador é o elenco', () => {
    // §8.1/§8.2 (M17, 4/N). `heroSchema` deixa `characterId` opcional porque nem todo
    // `Hero` é personagem: o blueprint de reforço invocável (D13) e a VAGA de referência da
    // masmorra são fichas de cenário, não gente que o jogador progride. Na campanha não há
    // esse caso — quem está do lado do jogador é alguém do elenco —, e a árvore de talentos
    // só é resolvível a partir dele (D6).
    //
    // A trava é a forma, e não uma varredura, pelo mesmo motivo do critério 2: um herói de
    // campanha sem personagem não perde o talento com um erro, ele o perde EM SILÊNCIO.
    const { characterId: _omitido, ...semPersonagem } = unidadeJogador.hero;
    const orfao = { ...unidadeJogador, hero: semPersonagem };
    expect(() => encounterSchema.parse(encontro({ units: [orfao, unidadeInimiga] }))).toThrow();

    // A masmorra continua aceitando: ali a unidade do jogador é uma VAGA, substituída pelos
    // heróis reais que o jogador manda (`assembleDungeonBattle`). Exigir personagem numa
    // vaga seria exigir que o conteúdo já soubesse quem vai preenchê-la.
    expect(() => dungeonEncounterSchema.parse(masmorra([orfao, unidadeInimiga]))).not.toThrow();
  });

  it('as travas que já existiam continuam valendo com a forma nova', () => {
    // 1 herói = 1 tile, e unitId único — as duas travas são do ENCONTRO, não da unidade,
    // e precisam continuar pegando um par misto (jogador + inimigo) e não só dois iguais.
    const mesmoTile = { ...unidadeInimiga, pos: { x: 1, y: 1 } };
    expect(() => encounterSchema.parse(encontro({ units: [unidadeJogador, mesmoTile] }))).toThrow();

    const mesmoId = { ...unidadeInimiga, unitId: 'unit-heroi' };
    expect(() => encounterSchema.parse(encontro({ units: [unidadeJogador, mesmoId] }))).toThrow();
  });
});

describe('critério 2: o conteúdo real não tem um único inimigo passando por Hero', () => {
  const arquivos = [
    ...findJsonFiles(join(DATA_DIR, 'encounters')),
    ...findJsonFiles(join(DATA_DIR, 'dungeon-encounters')),
  ];

  it('há conteúdo para varrer', () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  it.each(arquivos)('%s: toda unidade inimiga referencia um enemyId e nenhuma tem hero', (arquivo) => {
    const encontroReal = JSON.parse(readFileSync(arquivo, 'utf8')) as {
      units: { side: string; hero?: unknown; enemyId?: string }[];
    };
    const inimigos = encontroReal.units.filter((u) => u.side === 'enemy');
    expect(inimigos.length, 'encontro sem inimigo').toBeGreaterThan(0);
    for (const inimigo of inimigos) {
      expect(inimigo.enemyId, JSON.stringify(inimigo)).toBeTruthy();
      expect('hero' in inimigo, 'inimigo ainda carrega uma ficha de herói').toBe(false);
    }
  });
});
