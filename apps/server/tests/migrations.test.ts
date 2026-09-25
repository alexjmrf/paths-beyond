import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RANKS_DE_BASE } from '@paths-beyond/core';
import { BANNER_KINDS } from '@paths-beyond/gacha';
import { loadCatalogFromDisk, toStartingHero } from '@paths-beyond/content';
import { CAMPOS_COLETADOS, ECONOMY_ACTION_KINDS, MATCH_KINDS } from '../src/repository/types.js';

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

// Um `Hero` de verdade, montado do catálogo pelo mesmo caminho que o servidor usa ao conceder
// um personagem. Lido do conteúdo e não escrito à mão: um campo novo em `Hero` aparece aqui
// sozinho, que é o ponto.
const catalogoParaHeroi = loadCatalogFromDisk();
const HERO_DE_REFERENCIA = toStartingHero(Object.values(catalogoParaHeroi.characters)[0]!, 'heroi-de-referencia');

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

// M36 2/N (D47) — a tabela `matches` conferida contra o TypeScript, pelo mesmo motivo que fez
// este arquivo existir: uma cláusula `CHECK` que não acompanha o código é uma constraint que
// recusa em produção o que a suíte aceita em memória. A `kind` é o caso exato do defeito de
// `economy_actions.kind` (migration 0008 × M18 3/N), um milestone depois.
describe('a tabela de partidas bate com o TypeScript', () => {
  const sql = sqlDasMigrations();

  // O corpo do `CREATE TABLE matches`, isolado uma vez: as duas cláusulas `CHECK` que
  // interessam vivem dentro dele, e ler o arquivo inteiro pegaria o `CHECK` de outra tabela.
  const criacaoDaTabela = sql.split(/;\s*/).find((trecho) => /CREATE TABLE matches/i.test(trecho)) ?? '';

  function valoresDoCheck(coluna: string): readonly string[] {
    const linha = criacaoDaTabela.split('\n').find((l) => l.trim().startsWith(coluna) && /CHECK/i.test(l)) ?? '';
    const dentro = /IN\s*\(([^)]*)\)/i.exec(linha)?.[1] ?? '';
    return dentro
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .filter((v) => v.length > 0);
  }

  it('o CHECK de `matches.kind` cobre exatamente as superfícies que o código abre', () => {
    // Não é "contém": é igualdade. Um kind a mais no SQL é uma constraint que deixou de
    // significar o que promete; um a menos é a batalha que não abre em produção.
    expect([...valoresDoCheck('kind')].sort()).toEqual([...MATCH_KINDS].sort());
  });

  it('o CHECK de `matches.outcome` cobre os três estados, e `ongoing` é um deles', () => {
    // `ongoing` não é um detalhe: é o estado em que a partida VIVE. Uma constraint que só
    // aceitasse desfecho impediria a tabela de guardar a única coisa que ela existe para
    // guardar.
    expect([...valoresDoCheck('outcome')].sort()).toEqual(['defeat', 'ongoing', 'victory']);
  });

  it('há um índice único PARCIAL que garante uma partida em andamento por jogador', () => {
    // A trava não pode viver só na rota: ela é o que faz o custo cobrado na abertura (D48)
    // valer alguma coisa. Sem o índice, duas requisições simultâneas abririam duas partidas.
    const indice = /CREATE UNIQUE INDEX[^;]*ON matches[^;]*WHERE outcome = 'ongoing'/i.test(sql);
    expect(indice, 'falta o índice único parcial de partida em andamento').toBe(true);
  });
});

// M37 2/N (D50) — o pity de DOIS ANDARES conferido contra os ranks de `packages/core`.
//
// Mesmo motivo de sempre: os contadores viraram uma coluna por rank, e `RANKS_DE_BASE` é a
// lista fechada que os nomeia. O dia em que um rank de base novo entrar no core, o repositório
// para de compilar (o tipo é `PityState`) — mas o SQL não pararia, e uma coluna a menos é um
// rank sem garantia nenhuma, em silêncio. É esta asserção que o impede.
describe('os contadores de pity batem com os ranks de base', () => {
  // `colunasDaTabela` lê só o `CREATE TABLE`, e `banner_pity` foi ALTERADA depois de criada.
  // O que interessa é o estado FINAL do banco, então as alterações entram na conta — pelo
  // mesmo princípio que faz `kindsDoCheck` usar a ÚLTIMA cláusula e não a primeira.
  function colunasDepoisDosAlters(sql: string, tabela: string): readonly string[] {
    const colunas = new Set(colunasDaTabela(sql, tabela));

    for (const trecho of sql.split(/;\s*/)) {
      if (!new RegExp(`ALTER\\s+TABLE\\s+${tabela}\\b`, 'i').test(trecho)) continue;

      for (const [, coluna] of trecho.matchAll(/ADD\s+COLUMN\s+([a-z_]+)/gi)) colunas.add(coluna!);
      for (const [, coluna] of trecho.matchAll(/DROP\s+COLUMN\s+([a-z_]+)/gi)) colunas.delete(coluna!);
    }

    return [...colunas];
  }

  const sql = sqlDasMigrations();

  it('`banner_pity` tem exatamente uma coluna `rolls_since_<rank>` por rank de base', () => {
    const colunas = colunasDepoisDosAlters(sql, 'banner_pity').filter((c) => c.startsWith('rolls_since_'));

    expect([...colunas].sort()).toEqual([...RANKS_DE_BASE].map((rank) => `rolls_since_${rank}`).sort());
  });

  it('a coluna de um andar só não sobreviveu à migração', () => {
    // `rolls_since_new` contava "rolagens desde um personagem NOVO", semântica que D50
    // reverteu. Deixá-la para trás seria um número que ninguém escreve e alguém lê.
    expect(sql).toContain('ALTER TABLE banner_pity DROP COLUMN rolls_since_new');
    expect(colunasDepoisDosAlters(sql, 'banner_pity')).not.toContain('rolls_since_new');
  });
});

// M37 4/N (D49) — **O RANK CORRENTE NÃO É GRAVADO, E NENHUMA COLUNA PODE NASCER PARA ELE.**
//
// É a metade do critério de aceite 1 que nenhum outro teste alcança: o rank de BASE é catálogo
// e o CORRENTE é `rankCorrente(base, awakening)`, uma função. `rankDoElenco.test.ts` guarda o
// lado do catálogo (o JSON recusa `legend`); este guarda o lado do banco.
//
// **O erro que ele impede tem precedente exato:** o M18 2/N gravou o fragmento de imprint como
// dado quando ele era estado de conta, e o projeto pagou por isso. Uma coluna
// `current_rank` aqui seria o mesmo erro ao contrário — estado derivado virando estado
// gravado, com dois donos para o mesmo número e nenhuma garantia de que concordam.
describe('o rank corrente é derivado, e o banco não o guarda', () => {
  const sql = sqlDasMigrations();

  it('nenhuma coluna de nenhuma tabela guarda rank de personagem', () => {
    // As linhas de COMENTÁRIO falam de rank à vontade (a 0018 explica o pity por rank); o que
    // não pode existir é DECLARAÇÃO de coluna. Por isso a varredura é sobre as colunas, e não
    // sobre o texto do arquivo.
    const declaracoes = sql
      .split('\n')
      .filter((linha) => !linha.trim().startsWith('--'))
      .join('\n');

    const colunasComRank = [...declaracoes.matchAll(/^\s*([a-z_]*rank[a-z_]*)\s+[a-z]/gim)].map((m) => m[1]!);

    // `rolls_since_adventurer` e `rolls_since_hero` são contadores de PITY, não rank — e não
    // casam com o padrão. Se alguém criar `current_rank`, `hero_rank` ou `rank`, casa.
    expect(colunasComRank, `colunas de rank no SQL: ${colunasComRank.join(', ')}`).toEqual([]);
  });

  it('o `Hero` que o servidor guarda não tem campo de rank', () => {
    // O outro lado da mesma moeda: mesmo sem coluna, um `rank` dentro de um jsonb de herói
    // seria estado derivado gravado. `StoredHero` carrega o `Hero` do core, e o core não tem
    // o campo — esta asserção é o que impede alguém de acrescentá-lo sem reabrir a decisão.
    const campos = Object.keys(HERO_DE_REFERENCIA);

    expect(campos).not.toContain('rank');
    expect(campos).toContain('awakening'); // o eixo de que o rank corrente é FUNÇÃO
  });
});

// M38 3/N (D54/D55) — o pity por TIPO de banner, o token por banner, a escolha do genérico e
// a posse de artefato, conferidos contra o TypeScript sem banco.
describe('o gacha do M38 no SQL', () => {
  const sql = sqlDasMigrations();

  function valoresDoCheck(coluna: string): readonly string[] {
    const trechos = sql.split(/;\s*/).filter((t) => new RegExp(`${coluna}\\s+IN\\s*\\(`, 'i').test(t));
    const ultimo = trechos[trechos.length - 1] ?? '';
    const dentro = new RegExp(`${coluna}\\s+IN\\s*\\(([^)]*)\\)`, 'i').exec(ultimo)?.[1] ?? '';
    return dentro
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .filter((v) => v.length > 0);
  }

  it('o pity passou a ser por TIPO: `banner_pity.banner_id` virou `pity_scope`', () => {
    expect(sql).toContain('ALTER TABLE banner_pity RENAME COLUMN banner_id TO pity_scope');
  });

  it('o escopo do pity aceita exatamente os tipos de banner de `packages/gacha`', () => {
    expect([...valoresDoCheck('pity_scope')].sort()).toEqual([...BANNER_KINDS].sort());
  });

  it('os contadores do `banner-elenco` vão para o rotativo de personagem — ninguém perde pity', () => {
    expect(sql).toMatch(/UPDATE banner_pity SET pity_scope = 'rotatingCharacter' WHERE pity_scope = 'banner-elenco'/);
  });

  it('o status do token aceita exatamente os estados do motor', () => {
    expect([...valoresDoCheck('status')].sort()).toEqual(['counting', 'granted', 'pending']);
  });

  it('as tabelas novas têm as colunas que o repositório lê', () => {
    expect([...colunasDaTabela(sql, 'banner_tokens')].sort()).toEqual(['banner_id', 'player_id', 'rolls', 'status']);
    expect([...colunasDaTabela(sql, 'generic_choices')].sort()).toEqual(['banner_id', 'pending', 'player_id', 'rolls']);
    expect([...colunasDaTabela(sql, 'player_artifacts')].sort()).toEqual([
      'acquired_at',
      'artifact_id',
      'awakening',
      'id',
      'imprint',
      'player_id',
    ]);
  });

  it('um artefato por (jogador, definição): a segunda cópia é fragmento, não instância', () => {
    expect(sql).toMatch(/UNIQUE \(player_id, artifact_id\)/);
  });
});
