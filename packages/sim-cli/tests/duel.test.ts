import { describe, expect, it } from 'vitest';
import { hashDuelResult, loadDuelParticipant, runDuelCommand } from '../src/duel.js';
import { resolveDuel } from '@paths-beyond/core';

function statSheetJson(overrides: Record<string, number> = {}) {
  return {
    hp: 5000,
    atk: 1000,
    def: 300,
    spd: 100,
    chc: 0,
    chd: 1500,
    eff: 0,
    efr: 0,
    pen: 0,
    heal: 0,
    lifesteal: 0,
    focus: 0,
    vigor: 0,
    ...overrides,
  };
}

function participantJson(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    stats: statSheetJson(),
    currentHp: 5000,
    ap: 3,
    pp: 2,
    unitType: 'infantry',
    weaponType: 'sword',
    duelRange: 1,
    tacticsScript: [{ enabled: true, skillId: 'skill-strike', conditions: [] }],
    reactionScript: [{ enabled: true, skillId: 'skill-counter', conditions: [] }],
    knownSkills: {
      'skill-strike': {
        id: 'skill-strike',
        name: 'Golpe',
        kind: 'duel',
        apCost: 1,
        cooldown: 0,
        multiplier: 1200,
        flat: 0,
        scalesWith: 'atk',
        effects: [],
        tags: ['physical'],
      },
      'skill-counter': {
        id: 'skill-counter',
        name: 'Contra-ataque',
        kind: 'reaction',
        apCost: 0,
        ppCost: 1,
        cooldown: 0,
        multiplier: 800,
        flat: 0,
        scalesWith: 'atk',
        trigger: 'onAttacked',
        effects: [],
        tags: ['physical'],
      },
    },
    cooldowns: {},
    activeEffects: [],
    positionalMultiplier: 1000,
    ...overrides,
  };
}

function fakeReadFile(files: Record<string, unknown>) {
  return (path: string): string => {
    const content = files[path];
    if (content === undefined) throw new Error(`arquivo não encontrado no fake: ${path}`);
    return JSON.stringify(content);
  };
}

describe('loadDuelParticipant', () => {
  it('lê e valida um DuelParticipant via o schema de packages/data', () => {
    const readFile = fakeReadFile({ 'A.json': participantJson('hero-a') });
    const participant = loadDuelParticipant(readFile, 'A.json');
    expect(participant.id).toBe('hero-a');
    expect(participant.stats.atk).toBe(1000);
  });

  it('lança se o JSON não bater com o schema (Zod rejeita)', () => {
    const readFile = fakeReadFile({ 'bad.json': { id: 'x' } });
    expect(() => loadDuelParticipant(readFile, 'bad.json')).toThrow();
  });
});

describe('hashDuelResult', () => {
  it('é determinístico: o mesmo resultado sempre produz o mesmo hash', () => {
    const readFile = fakeReadFile({ 'A.json': participantJson('hero-a'), 'B.json': participantJson('hero-b') });
    const attacker = loadDuelParticipant(readFile, 'A.json');
    const defender = loadDuelParticipant(readFile, 'B.json');
    const engagement = {
      engagementDistance: 1,
      terrainAccuracyModifier: 0,
      heightAccuracyModifier: 0,
      defenderEvasionModifier: 0,
      battleRound: 1,
    };
    const result = resolveDuel({ seed: 42, attacker, defender, effectDefs: {}, engagement });
    expect(hashDuelResult(result)).toBe(hashDuelResult(result));
  });
});

describe('runDuelCommand — sim-cli duel A.json B.json --seed 42', () => {
  it('imprime troca a troca com a linha do script que disparou', () => {
    const readFile = fakeReadFile({ 'A.json': participantJson('hero-a'), 'B.json': participantJson('hero-b') });
    const output = runDuelCommand({ heroAFile: 'A.json', heroBFile: 'B.json', seed: 42 }, readFile);
    expect(output).toContain('Troca 1');
    expect(output).toContain('[linha 0]');
    expect(output).toContain('hero-a usa skill-strike');
    expect(output).toContain('Hash:');
    expect(output).toContain('Vencedor:');
  });

  it('mesma seed → hash idêntico na saída (critério de aceite do M2)', () => {
    const readFile = fakeReadFile({ 'A.json': participantJson('hero-a'), 'B.json': participantJson('hero-b') });
    const outputA = runDuelCommand({ heroAFile: 'A.json', heroBFile: 'B.json', seed: 42 }, readFile);
    const outputB = runDuelCommand({ heroAFile: 'A.json', heroBFile: 'B.json', seed: 42 }, readFile);
    expect(outputA).toBe(outputB);
  });

  it('seeds diferentes tendem a produzir hashes diferentes', () => {
    const readFile = fakeReadFile({ 'A.json': participantJson('hero-a'), 'B.json': participantJson('hero-b') });
    const outputA = runDuelCommand({ heroAFile: 'A.json', heroBFile: 'B.json', seed: 1 }, readFile);
    const outputB = runDuelCommand({ heroAFile: 'A.json', heroBFile: 'B.json', seed: 2 }, readFile);
    expect(outputA).not.toBe(outputB);
  });
});
