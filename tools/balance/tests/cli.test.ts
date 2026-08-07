import { describe, expect, it } from 'vitest';
import { parseArgs, runCli } from '../src/cli.js';

describe('parseArgs', () => {
  it('usa defaults quando nenhum argumento é passado', () => {
    expect(parseArgs([])).toEqual({ runs: 10_000, seed: 1 });
  });

  it('lê --runs e --seed', () => {
    expect(parseArgs(['--runs', '500', '--seed', '99'])).toEqual({ runs: 500, seed: 99 });
  });

  it('ignora argumentos desconhecidos', () => {
    expect(parseArgs(['--foo', 'bar', '--runs', '10'])).toEqual({ runs: 10, seed: 1 });
  });
});

describe('runCli', () => {
  it('roda de ponta a ponta com --runs pequeno e produz um relatório em texto', () => {
    const output = runCli(['--runs', '2', '--seed', '1']);
    expect(output).toContain('Matriz de winrate');
    expect(output).toContain('Winrate global por composição');
  });
});
