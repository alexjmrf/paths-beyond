import { validateSoul } from '@paths-beyond/core';
import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/cli.js';
import { runSoulDelta, runTournament, soulMediana, toPlacements } from '../src/runTournament.js';

// M39 6/N — a medição com Soul e em outro nível.
//
// Decisões do usuário (2026-09-28): a Soul da medição é a MEDIANA determinística (a primeira
// opção de mainstat do personagem, os dois substats de maior peso da tabela, tudo no ponto médio
// da faixa); e o nível da medição é sobrescrito na ferramenta (`--nivel`), sem tocar nas comps.

const content = loadCatalogFromDisk();
const regras = content.economyRules.soul!;
const TIER = { awakening: 3, imprint: 0 } as const;
const comp = content.comps.find((c) => c.id === 'comp-guerreiro')!;

describe('a Soul mediana', () => {
  it('passa em validateSoul para todo personagem das comps', () => {
    const personagens = new Set(content.comps.flatMap((c) => c.units.map((u) => u.hero.characterId!)));
    expect(personagens.size).toBeGreaterThan(0);
    for (const characterId of personagens) {
      const def = content.characterSouls[characterId]!;
      expect(validateSoul(soulMediana(characterId, content, 'x'), def, regras)).toEqual([]);
    }
  });

  it('é a primeira opção de mainstat, no ponto médio, com os dois substats de maior peso', () => {
    const def = content.characterSouls['ally-guerreiro']!;
    const soul = soulMediana('ally-guerreiro', content, 'x');
    const opcao = def.mainstatOptions[0]!;
    expect(soul.mainstat).toEqual({ stat: opcao.stat, value: Math.trunc((opcao.valueRange.min + opcao.valueRange.max) / 2) });

    const elegiveis = regras.substats.filter((s) => s.stat !== opcao.stat);
    const pesoMinimoEscolhido = Math.min(...soul.substats.map((s) => regras.substats.find((e) => e.stat === s.stat)!.weight));
    const pesoMaximoDeFora = Math.max(
      ...elegiveis.filter((e) => !soul.substats.some((s) => s.stat === e.stat)).map((e) => e.weight),
    );
    expect(pesoMinimoEscolhido).toBeGreaterThanOrEqual(pesoMaximoDeFora);
  });

  // D63, fechamento — a medição usa TODAS as opções, com peso igual, e não só a primeira (a ordem
  // das opções no dado não foi escolhida para medir). `opcao` escolhe qual, módulo o número delas.
  it('`opcao` escolhe a opção de mainstat, em ciclo', () => {
    const def = content.characterSouls['ally-guerreiro']!;
    def.mainstatOptions.forEach((opcao, i) => {
      expect(soulMediana('ally-guerreiro', content, 'x', i).mainstat.stat).toBe(opcao.stat);
      expect(soulMediana('ally-guerreiro', content, 'x', i + def.mainstatOptions.length).mainstat.stat).toBe(opcao.stat);
    });
    for (const [characterId, d] of Object.entries(content.characterSouls)) {
      d.mainstatOptions.forEach((_, i) => expect(validateSoul(soulMediana(characterId, content, 'x', i), d, regras)).toEqual([]));
    }
  });

  it('toPlacements leva a opção pedida para cada unidade', () => {
    const placements = toPlacements(comp, content, 'player', 0, TIER, '', { souls: true, opcaoDaSoul: 1 });
    comp.units.forEach((unit, i) => {
      const opcoes = content.characterSouls[unit.hero.characterId!]!.mainstatOptions;
      expect(placements[i]!.soul?.mainstat.stat).toBe(opcoes[1 % opcoes.length]!.stat);
    });
  });

  it('é determinística', () => {
    expect(soulMediana('ally-guerreiro', content, 'x')).toEqual(soulMediana('ally-guerreiro', content, 'x'));
  });
});

describe('toPlacements com Soul e nível', () => {
  it('com `souls`, cada unidade leva a Soul mediana do SEU personagem', () => {
    const placements = toPlacements(comp, content, 'player', 0, TIER, '', { souls: true });
    comp.units.forEach((unit, i) => expect(placements[i]!.soul?.soulOf).toBe(unit.hero.characterId));
  });

  it('sem a opção, ninguém leva Soul', () => {
    for (const p of toPlacements(comp, content, 'player', 0, TIER)) expect(p.soul).toBeUndefined();
  });

  it('`nivel` muda o nível na medição e não toca na comp carregada', () => {
    const antes = comp.units.map((u) => u.hero.level);
    const placements = toPlacements(comp, content, 'player', 0, TIER, '', { nivel: 60 });
    for (const p of placements) expect(p.hero.level).toBe(60);
    expect(comp.units.map((u) => u.hero.level)).toEqual(antes);
  });
});

describe('o torneio com Soul e nível', () => {
  it('é determinístico, e Soul e nível mudam o resultado', () => {
    const base = { runsPerPairing: 2, masterSeed: 7, artefatos: TIER };
    const a = runTournament(content, { ...base, souls: true, nivel: 60 });
    const b = runTournament(content, { ...base, souls: true, nivel: 60 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(runTournament(content, { ...base, nivel: 60 })));
    expect(JSON.stringify(runTournament(content, { ...base, nivel: 60 }))).not.toBe(JSON.stringify(runTournament(content, base)));
  });
});

describe('o delta da Soul — cada comp com Soul contra ela mesma sem', () => {
  it('uma linha por comp, reproduzível com a mesma seed', () => {
    const opcoes = { runsPerPairing: 4, masterSeed: 3, artefatos: TIER, nivel: 20 };
    const a = runSoulDelta(content, opcoes);
    expect(a.map((d) => d.compId).sort()).toEqual(content.comps.map((c) => c.id).sort());
    for (const linha of a) {
      expect(linha.comoAtacante.total).toBe(4);
      expect(linha.comoDefensor.total).toBe(4);
    }
    expect(JSON.stringify(runSoulDelta(content, opcoes))).toBe(JSON.stringify(a));
  });
});

describe('o CLI', () => {
  it('lê --nivel, --souls e --delta-soul', () => {
    expect(parseArgs(['--nivel', '60', '--souls', '--delta-soul'])).toMatchObject({ nivel: 60, souls: true, deltaSoul: true });
    expect(parseArgs([])).toMatchObject({ nivel: undefined, souls: false, deltaSoul: false });
  });

  it('nível fora de 1..60 falha alto', () => {
    expect(() => parseArgs(['--nivel', '61'])).toThrow(/nível/);
    expect(() => parseArgs(['--nivel', '0'])).toThrow(/nível/);
  });
});
