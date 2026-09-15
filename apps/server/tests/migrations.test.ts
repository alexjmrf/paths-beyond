import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAMPOS_COLETADOS, ECONOMY_ACTION_KINDS } from '../src/repository/types.js';

// M19 — o SQL e o TypeScript conferidos um contra o outro, SEM banco.
//
// Este arquivo existe por causa de um defeito real: `economy_actions.kind` nasceu na
// migration 0008 com quatro valores no `CHECK`, a M18 3/N acrescentou `summon` e `energy` no
// TypeScript, e ninguém tocou o SQL. Com Postgres ligado, os dois sumidouros da moeda
// premium falhariam por violação de constraint.
//
// O teste de paridade (`repositoryParity.test.ts`) pega isso — mas só quando há um Postgres
// para rodar contra, e local não há. **Este pega sem banco nenhum**, lendo o SQL como texto,
// e é por isso que ele é o que protege o laço de trabalho de todo dia. Se um dia a suíte
// rodar sem `DATABASE_URL` para sempre, esta asserção continua de pé.

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

function sqlDasMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');
}

// Os valores da ÚLTIMA cláusula `CHECK (kind IN (...))` aplicada a `economy_actions`. A
// última é a que vale: 0008 cria a tabela com uma e 0011 a substitui, e é o estado final do
// banco que importa.
function kindsDoCheck(sql: string): readonly string[] {
  const linhas = sql.split(/;\s*/);
  const comCheck = linhas.filter(
    (trecho) => /economy_actions/i.test(trecho) && /kind\s+IN\s*\(/i.test(trecho),
  );
  const ultima = comCheck[comCheck.length - 1];
  if (!ultima) return [];

  const dentro = /kind\s+IN\s*\(([^)]*)\)/i.exec(ultima)?.[1] ?? '';
  return dentro
    .split(',')
    .map((valor) => valor.trim().replace(/^'|'$/g, ''))
    .filter((valor) => valor.length > 0);
}

describe('as migrations conversam com o TypeScript', () => {
  it('o CHECK de `economy_actions.kind` cobre exatamente os kinds que o código escreve', () => {
    const noSql = [...kindsDoCheck(sqlDasMigrations())].sort();
    const noCodigo = [...ECONOMY_ACTION_KINDS].sort();

    // Não é "o SQL contém": é igualdade. Um kind a mais no SQL é uma constraint que deixou
    // de significar o que ela promete; um a menos é a falha em produção que este milestone
    // encontrou.
    expect(noSql).toEqual(noCodigo);
  });

  it('há uma cláusula CHECK para o kind — a tabela não pode aceitar string livre', () => {
    expect(kindsDoCheck(sqlDasMigrations()).length).toBeGreaterThan(0);
  });

  it('as migrations são nomeadas em ordem estável e sem número repetido', () => {
    // `runMigrations` aplica por ordem alfabética do nome do arquivo. Dois arquivos com o
    // mesmo prefixo tornariam a ordem dependente do sistema de arquivos.
    const prefixos = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.slice(0, 4));

    expect(prefixos).toEqual([...prefixos].sort());
    expect(new Set(prefixos).size).toBe(prefixos.length);
  });
});

// M34 1/N (D45) — a DECLARAÇÃO do que a telemetria coleta é uma lista em código
// (`CAMPOS_COLETADOS`), que a rota devolve e a tela mostra. Se alguém acrescentar uma coluna
// à tabela sem acrescentar à lista, a declaração passa a mentir — e é este teste que reprova.
// As colunas fora da lista são as que NÃO são dado de comportamento: a chave (nonce), a conta
// (player_id, que o servidor já tem) e a própria escolha de recusar.
function colunasDaTabela(sql: string, tabela: string): readonly string[] {
  const trecho = new RegExp(`CREATE TABLE ${tabela} \\(([^;]*)\\)`, 'i').exec(sql)?.[1] ?? '';
  return trecho
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => /^[a-z_]+\s/.test(linha) && !/^(PRIMARY|FOREIGN|CHECK|UNIQUE)/i.test(linha))
    .map((linha) => linha.split(/\s+/)[0]!);
}

function snake(campo: string): string {
  return campo.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

describe('a declaração da telemetria bate com as tabelas', () => {
  const sql = sqlDasMigrations();
  const FORA_DA_DECLARACAO = new Set(['nonce', 'player_id', 'opt_out']);

  it('toda coluna de comportamento de mission_attempts e telemetry_accounts está declarada, e nada a mais', () => {
    const colunas = [...colunasDaTabela(sql, 'mission_attempts'), ...colunasDaTabela(sql, 'telemetry_accounts')].filter(
      (c) => !FORA_DA_DECLARACAO.has(c),
    );
    expect(colunas.length).toBeGreaterThan(0);
    expect([...colunas].sort()).toEqual([...CAMPOS_COLETADOS].map(snake).sort());
  });
});
