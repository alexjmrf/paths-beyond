import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import chapterSchema from '../schemas/chapters.schema.js';
import encounterSchema from '../schemas/encounters.schema.js';

// M27 1/N — capítulo e missão como camadas DISTINTAS.
//
// **Isto é mudança de forma antes de ser de volume.** Até aqui `encounters` tinha seis
// capítulos de um encontro cada: capítulo *era* missão, e o campo `chapter` era um número
// que só servia para ordenar. D23 pede três capítulos de dez missões, e a demo não cabe
// nesse formato — não por tamanho, mas porque não existe onde pendurar "a missão 4 do
// capítulo 2".
//
// **A direção do ponteiro é decisão, e é a missão que aponta para o capítulo.** O contrário
// — o capítulo listando as missões — obrigaria a editar dois arquivos para acrescentar uma
// missão, e é exatamente assim que um arquivo de índice fica dessincronizado do diretório.
// Aqui o capítulo não sabe quantas missões tem, e quem responde isso é a varredura.
//
// O que ESTE arquivo trava é a forma de cada peça isolada e a coerência entre as duas
// camadas dentro de `packages/data`. A validação cruzada com mapas, inimigos e elenco
// continua em `packages/content`, que é quem carrega tudo junto.

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function lerJson<T>(dir: string, arquivo: string): T {
  return JSON.parse(readFileSync(join(dataDir, dir, arquivo), 'utf8')) as T;
}

function arquivosDe(dir: string): string[] {
  return readdirSync(join(dataDir, dir)).filter((f) => f.endsWith('.json'));
}

interface Capitulo {
  readonly id: string;
  readonly order: number;
  readonly name: string;
}

interface Missao {
  readonly id: string;
  readonly name: string;
  readonly chapterId: string;
  readonly order: number;
}

const capitulos = arquivosDe('chapters').map((f) => lerJson<Capitulo>('chapters', f));
const missoes = arquivosDe('encounters').map((f) => lerJson<Missao>('encounters', f));

describe('M27 — o schema do capítulo', () => {
  it('não é vacuamente verdadeiro: existem capítulos autorados', () => {
    // Sem isto, apagar `chapters/` deixaria todas as asserções abaixo verdes sobre o vazio.
    expect(capitulos.length).toBeGreaterThan(0);
  });

  it('todo capítulo autorado passa no schema', () => {
    for (const capitulo of capitulos) {
      const parsed = chapterSchema.safeParse(capitulo);
      expect(parsed.success, `${capitulo.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it('a ordem é única — dois capítulos na mesma posição é uma campanha sem ordem definida', () => {
    const ordens = capitulos.map((c) => c.order);
    expect(new Set(ordens).size).toBe(ordens.length);
  });

  it('o id é único, e é o nome do arquivo', () => {
    expect(new Set(capitulos.map((c) => c.id)).size).toBe(capitulos.length);
    for (const arquivo of arquivosDe('chapters')) {
      expect(lerJson<Capitulo>('chapters', arquivo).id).toBe(arquivo.replace(/\.json$/, ''));
    }
  });

  it('recusa capítulo sem nome e sem ordem — os dois são o que a tela mostra e usa', () => {
    expect(chapterSchema.safeParse({ id: 'chapter-x', order: 1 }).success).toBe(false);
    expect(chapterSchema.safeParse({ id: 'chapter-x', name: 'X' }).success).toBe(false);
    expect(chapterSchema.safeParse({ id: 'chapter-x', order: 0, name: 'X' }).success).toBe(false);
  });

  it('é `.strict()`: campo desconhecido não passa despercebido', () => {
    expect(chapterSchema.safeParse({ id: 'chapter-x', order: 1, name: 'X', chapter: 1 }).success).toBe(false);
  });
});

describe('M27 — a missão aponta para o capítulo', () => {
  it('toda missão declara um `chapterId` que EXISTE', () => {
    const ids = new Set(capitulos.map((c) => c.id));
    for (const missao of missoes) {
      expect(ids.has(missao.chapterId), `${missao.id} referencia ${missao.chapterId}`).toBe(true);
    }
  });

  it('todo capítulo tem pelo menos uma missão — capítulo vazio é uma tela sem saída', () => {
    for (const capitulo of capitulos) {
      const suas = missoes.filter((m) => m.chapterId === capitulo.id);
      expect(suas.length, `${capitulo.id} não tem missão`).toBeGreaterThan(0);
    }
  });

  it('a ordem é única DENTRO do capítulo, e não globalmente', () => {
    // Global seria o modelo antigo com outro nome: a missão 1 do capítulo 2 tem de poder
    // ser a "1", senão acrescentar uma missão no capítulo 1 renumeraria a campanha inteira.
    for (const capitulo of capitulos) {
      const ordens = missoes.filter((m) => m.chapterId === capitulo.id).map((m) => m.order);
      expect(new Set(ordens).size, `${capitulo.id} tem ordem repetida`).toBe(ordens.length);
    }
  });

  it('a numeração de cada capítulo é contígua a partir de 1 — buraco é missão que ninguém alcança', () => {
    for (const capitulo of capitulos) {
      const ordens = missoes
        .filter((m) => m.chapterId === capitulo.id)
        .map((m) => m.order)
        .sort((a, b) => a - b);
      expect(ordens, `${capitulo.id}`).toEqual(ordens.map((_, i) => i + 1));
    }
  });

  it('o nome da missão é único DENTRO do capítulo — na tela, o nome é a missão', () => {
    // M27 3/N. O jogador não escolhe por id: ele lê a lista e clica num nome. Duas missões
    // homônimas no mesmo capítulo são, para quem joga, a mesma entrada aparecendo duas vezes
    // — e não há nada na tela que as distinga. Nada quebrava; a lista só ficava mentindo.
    //
    // Único dentro do CAPÍTULO, e não globalmente, pelo mesmo motivo que a ordem é: um lugar
    // pode reaparecer num capítulo seguinte, e proibir isso seria proibir a campanha de
    // voltar ao mesmo lugar.
    for (const capitulo of capitulos) {
      const nomes = missoes.filter((m) => m.chapterId === capitulo.id).map((m) => m.name);
      const repetidos = nomes.filter((nome, i) => nomes.indexOf(nome) !== i);
      expect(repetidos, `${capitulo.id} tem missões homônimas`).toEqual([]);
    }
  });

  it('o nome do capítulo é único — três cabeçalhos, e um deles não pode ser cópia de outro', () => {
    const nomes = capitulos.map((c) => c.name);
    expect(new Set(nomes).size, 'dois capítulos com o mesmo nome').toBe(nomes.length);
  });

  it('o campo `chapter` numérico SAIU — deixá-lo seria duas fontes para a mesma pergunta', () => {
    for (const missao of missoes) {
      expect('chapter' in missao, `${missao.id} ainda carrega \`chapter\``).toBe(false);
    }
  });

  it('missão sem `chapterId` é recusada pelo schema', () => {
    const base = lerJson<Record<string, unknown>>('encounters', arquivosDe('encounters')[0]!);
    const { chapterId: _, ...semCapitulo } = base;
    expect(encounterSchema.safeParse(semCapitulo).success).toBe(false);
  });

  it('missão sem `order` é recusada pelo schema', () => {
    const base = lerJson<Record<string, unknown>>('encounters', arquivosDe('encounters')[0]!);
    const { order: _, ...semOrdem } = base;
    expect(encounterSchema.safeParse(semOrdem).success).toBe(false);
  });
});

describe('M27 — a migração: o que o jogador já limpou não pode sumir', () => {
  it('os seis encontros de campanha mantêm os ids antigos', () => {
    // `listClearedChapters` guarda o ID do encontro. Renomear qualquer um destes apagaria,
    // em silêncio, o progresso de quem já jogou — e o sintoma apareceria como uma conquista
    // deixando de ser reivindicável, longe da causa.
    const ids = new Set(missoes.map((m) => m.id));
    for (let i = 1; i <= 6; i++) {
      expect(ids.has(`encounter-campanha-${i}`), `encounter-campanha-${i} sumiu`).toBe(true);
    }
  });
});
