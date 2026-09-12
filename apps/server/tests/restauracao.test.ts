import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

// M28, sub-sessão 2/N — o ensaio de restore conferido sem banco.
//
// **O que este arquivo protege.** `scripts/restore-drill.sh` compara a origem com o
// restaurado, tabela por tabela. Ele é bom — e é uma PROMESSA enquanto nada o executa, que é
// exatamente o estado em que o M19 deixou o procedimento de restore: escrito, correto,
// executado uma vez à mão. Um procedimento que ninguém roda apodrece em silêncio, e o dia em
// que se descobre é o único dia em que não dá para descobrir.
//
// As duas asserções abaixo são de naturezas diferentes e nenhuma substitui a outra: uma diz
// que ALGUÉM o executa, e a outra diz que executá-lo é SEGURO.

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const drill = readFileSync(join(raiz, 'scripts', 'restore-drill.sh'), 'utf8');

const ci = parseYaml(readFileSync(join(raiz, '.github', 'workflows', 'ci.yml'), 'utf8')) as {
  readonly jobs: Readonly<
    Record<string, { readonly steps?: readonly { readonly run?: string }[] }>
  >;
};

/** Todo comando `run:` de todo job do CI, como um texto só. */
function tudoQueOCiExecuta(): string {
  return Object.values(ci.jobs)
    .flatMap((job) => job.steps ?? [])
    .map((step) => step.run ?? '')
    .join('\n');
}

describe('o ensaio de restore é executado, e não só escrito', () => {
  it('o CI roda o drill', () => {
    // Sem isto o script é documentação com extensão `.sh`. O M19 provou o restore uma vez;
    // o que faltava era ele continuar sendo verdade no commit seguinte.
    expect(tudoQueOCiExecuta()).toContain('restore-drill.sh');
  });

  it('o job do drill tem um Postgres para rodar contra', () => {
    // Um passo que roda o drill sem banco falha por motivo errado — e "falhou porque não
    // havia banco" é o tipo de vermelho que vira `continue-on-error` em duas semanas.
    const jobDoDrill = Object.values(ci.jobs).find((job) =>
      (job.steps ?? []).some((s) => (s.run ?? '').includes('restore-drill.sh')),
    );
    expect(jobDoDrill, 'nenhum job roda o drill').toBeDefined();

    const comServico = jobDoDrill as { readonly services?: Readonly<Record<string, unknown>> };
    expect(Object.keys(comServico.services ?? {})).toContain('postgres');
  });
});

describe('o ensaio não escreve na origem', () => {
  it('toda consulta à origem é somente leitura', () => {
    // **A propriedade que decide se ele pode rodar em produção.** O M19 inseriu uma linha
    // canário no banco de origem; isso responde "o restore rodou?" e cobra um preço que
    // ninguém quer pagar no banco que guarda a moeda comprada com dinheiro real.
    //
    // Este ensaio lê a origem e escreve só no banco descartável. A asserção deriva do
    // fonte: toda linha que menciona `$ORIGEM` num comando de psql tem de ser um `SELECT`.
    const linhas = drill.split('\n').filter((l) => !l.trim().startsWith('#'));

    const escritasNaOrigem = linhas.filter((l) => {
      if (!l.includes('"$ORIGEM"')) return false;
      // `pg_dump` lê, por definição.
      if (l.includes('pg_dump')) return false;
      if (!l.includes('psql')) return false;
      return !/-c\s+"SELECT/i.test(l);
    });

    expect(escritasNaOrigem, 'o ensaio escreveria no banco de origem').toEqual([]);
  });

  it('o banco descartável é derrubado mesmo se o ensaio falhar no meio', () => {
    // Sem o `trap`, um ensaio que reprova deixa um banco `*_drill_*` para trás a cada
    // execução — e um disco cheio de restos de ensaio é como o ensaio deixa de ser rodado.
    expect(drill).toMatch(/trap\s+limpar\s+EXIT/);
    expect(drill).toMatch(/DROP DATABASE IF EXISTS/);
  });

  it('reprova em vez de avisar — o código de saída é o que o CI lê', () => {
    // Um drill que imprime "DIVERGIU" e sai com 0 é pior do que nenhum: dá a sensação de
    // cobertura sem a cobertura. Provado por mutação nesta fatia com dois dumps quebrados.
    expect(drill).toMatch(/exit 1/);
  });
});
