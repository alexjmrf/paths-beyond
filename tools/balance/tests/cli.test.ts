import { describe, expect, it } from 'vitest';
import { parseArgs, runCli } from '../src/cli.js';

describe('parseArgs', () => {
  it('usa defaults quando nenhum argumento é passado', () => {
    expect(parseArgs([])).toEqual({ runs: 10_000, seed: 1, artefatos: false, delta: false });
  });

  it('lê --runs e --seed', () => {
    expect(parseArgs(['--runs', '500', '--seed', '99'])).toEqual({ runs: 500, seed: 99, artefatos: false, delta: false });
  });

  it('ignora argumentos desconhecidos', () => {
    expect(parseArgs(['--foo', 'bar', '--runs', '10'])).toEqual({ runs: 10, seed: 1, artefatos: false, delta: false });
  });
});

// M38 5/N — as duas medições do artefato.
describe('parseArgs — o artefato', () => {
  it('lê --artefatos e --delta-artefato', () => {
    expect(parseArgs(['--artefatos'])).toMatchObject({ artefatos: true, delta: false });
    expect(parseArgs(['--delta-artefato'])).toMatchObject({ artefatos: false, delta: true });
  });
});

describe('runCli', () => {
  it('com --artefatos, o relatório diz que mediu com artefato e em que tier', () => {
    const output = runCli(['--runs', '1', '--artefatos']);
    expect(output).toContain('COM artefato');
    expect(output).toContain('awakening 3, imprint 0');
    expect(output).toContain('Matriz de winrate');
  });

  it('com --delta-artefato, sai o espelho com e sem, por comp e por lado', () => {
    const output = runCli(['--runs', '2', '--delta-artefato']);
    expect(output).toContain('Delta do artefato');
    expect(output).toContain('Guerreiro');
    expect(output).toMatch(/atacando: \d+\.\d%/);
    expect(output).toMatch(/defendendo: \d+\.\d%/);
  });

  it('roda de ponta a ponta com --runs pequeno e produz um relatório em texto', () => {
    const output = runCli(['--runs', '2', '--seed', '1']);
    expect(output).toContain('Matriz de winrate');
    expect(output).toContain('Winrate global por composição');
  });
});
