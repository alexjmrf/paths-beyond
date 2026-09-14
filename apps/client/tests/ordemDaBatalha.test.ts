import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAINEIS_DA_BATALHA, type PainelDaBatalha } from '../src/logic/ordemDaBatalha.js';

// M35 4/N (D44) — a ORDEM do que fica ao lado do tabuleiro, e a regra que a decide.
//
// §1.1 (legibilidade tática): o jogador DEVE conseguir prever o resultado antes de confirmar.
// A regra de ordem do briefing é derivada disso — o que ele precisa para DECIDIR e PREVER fica
// mais perto do tabuleiro do que o que ele precisa para ADMINISTRAR (abandonar, enviar a
// batalha). Até aqui a coluna começava pelo painel do modo ("Jogando A Trilha · Abandonar
// missão") e o objetivo com as skills de Valor, e a unidade selecionada — a decisão em curso —
// ficava por último, abaixo da dobra num 1080p.
//
// A ordem é uma LISTA em runtime com o papel de cada painel, e `App.tsx` a itera: a regra
// existe num lugar só e este teste a lê, em vez de ler o JSX.

describe('a ordem dos painéis da batalha (D44)', () => {
  it('nenhum painel de administração vem antes de um de decisão ou previsão', () => {
    const papeis = PAINEIS_DA_BATALHA.map((p) => p.papel);
    const primeiraAdministracao = papeis.indexOf('administracao');
    const ultimaPrevisao = Math.max(papeis.lastIndexOf('decisao'), papeis.lastIndexOf('previsao'));
    expect(primeiraAdministracao).toBeGreaterThan(ultimaPrevisao);
  });

  it('a unidade selecionada — a decisão em curso — é o primeiro painel', () => {
    expect(PAINEIS_DA_BATALHA[0]).toEqual({ painel: 'unidade', papel: 'decisao' });
  });

  it('a iniciativa (§11: "sempre visível") vem antes do objetivo e do painel do modo', () => {
    const ordem = PAINEIS_DA_BATALHA.map((p) => p.painel);
    expect(ordem.indexOf('iniciativa')).toBeLessThan(ordem.indexOf('objetivo'));
    expect(ordem.indexOf('iniciativa')).toBeLessThan(ordem.indexOf('modo'));
  });

  it('a lista cobre os cinco painéis, sem repetir', () => {
    const esperados: readonly PainelDaBatalha[] = ['unidade', 'iniciativa', 'recursos', 'objetivo', 'modo'];
    expect([...PAINEIS_DA_BATALHA.map((p) => p.painel)].sort()).toEqual([...esperados].sort());
  });

  it('App.tsx desenha a coluna A PARTIR da lista, e não numa ordem escrita no JSX', () => {
    const fonte = readFileSync(join(import.meta.dirname, '..', 'src', 'App.tsx'), 'utf8');
    expect(fonte).toContain('PAINEIS_DA_BATALHA.map(');
    // O antigo bloco fixo não pode ter sobrado ao lado da lista.
    expect(fonte).not.toMatch(/<ObjectivePanel \/>\s*<InitiativePanel \/>\s*<ResourcePanel \/>\s*<UnitActionBar \/>/);
  });
});
