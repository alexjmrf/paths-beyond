import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ECONOMY_ACTION_KINDS } from '../src/repository/types.js';

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
