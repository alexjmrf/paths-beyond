import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AWAKENING_PARA_HERO, rankCorrente, type BaseRank, type CharacterRank } from '@paths-beyond/core';
import { findJsonFiles } from '@paths-beyond/data/validate.js';
import { describe, expect, it } from 'vitest';

// M37 4/N — A MATRIZ DE BALANCEAMENTO NÃO PODE MISTURAR RANKS CORRENTES.
//
// **É critério de aceite do milestone, e a razão está escrita em `DECISIONS.md` §3:** medir um
// `Legend` contra um `Adventurer` e ler o resultado como balanceamento de PERSONAGEM seria ler
// diferença de INVESTIMENTO como diferença de desenho. É a mesma lacuna de eixo que o M17 5/N
// encontrou, quando três comps eram o mesmo time e nenhuma asserção comparava comps entre si.
//
// **Por que aqui e não em `tools/balance`.** O torneio consome os comps; quem sabe o que um
// comp SIGNIFICA é o par catálogo+core, e `packages/content` é o único pacote que enxerga os
// dois (`packages/data` não depende do core, e o core não lê conteúdo — regra 1). É o mesmo
// argumento que pôs `elenco.test.ts` aqui.
//
// **O que este arquivo NÃO faz:** aferir poder. Quem mede isso é `pnpm balance` (regra 10), e
// os dois critérios do M8 continuam sendo o que decide se o rank virou poder. Aqui se afirma
// só que a medição é COMPARÁVEL — que ela mede design e não investimento.

const DATA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'data');

interface CompUnit {
  readonly hero: {
    readonly id: string;
    readonly characterId: string;
    readonly classId: string;
    readonly awakening: number;
  };
  readonly artifactId?: string;
}

interface Comp {
  readonly id: string;
  readonly name: string;
  readonly units: readonly CompUnit[];
}

interface Personagem {
  readonly id: string;
  readonly rank: BaseRank;
  readonly acquisition: 'story' | 'summon';
}

function readAll<T>(tipo: string): T[] {
  return findJsonFiles(join(DATA_DIR, tipo)).map((file) => JSON.parse(readFileSync(file, 'utf8')) as T);
}

const comps = readAll<Comp>('comps');
const elenco = readAll<Personagem>('characters');
const rankDeBase = new Map(elenco.map((c) => [c.id, c.rank] as const));

/** O rank corrente de uma unidade de comp: base do catálogo + awakening daquela instância. */
function rankDaUnidade(unit: CompUnit): CharacterRank {
  const base = rankDeBase.get(unit.hero.characterId);
  if (!base) throw new Error(`comp referencia ${unit.hero.characterId}, que não está no elenco`);
  return rankCorrente(base, unit.hero.awakening);
}

describe('M37 §aceite — a matriz mede DESIGN, não investimento', () => {
  it('o teste não é vacuamente verdadeiro: ele enxerga os comps e o elenco', () => {
    // Sem esta âncora, um diretório lido errado deixaria todas as asserções abaixo
    // verdadeiras sobre listas vazias.
    expect(comps.length).toBeGreaterThanOrEqual(15);
    expect(elenco.length).toBeGreaterThanOrEqual(15);
    for (const comp of comps) expect(comp.units.length, comp.id).toBeGreaterThan(0);
  });

  it('TODAS as unidades de TODOS os comps estão no mesmo rank corrente', () => {
    const porRank = new Map<CharacterRank, string[]>();

    for (const comp of comps) {
      for (const unit of comp.units) {
        const rank = rankDaUnidade(unit);
        const lista = porRank.get(rank) ?? [];
        lista.push(`${comp.id}/${unit.hero.characterId}`);
        porRank.set(rank, lista);
      }
    }

    expect(
      [...porRank.keys()],
      `a matriz mistura ranks: ${[...porRank].map(([r, u]) => `${r}=${u.length}`).join(', ')}`,
    ).toHaveLength(1);
  });

  it('e no mesmo AWAKENING — rank corrente igual com investimento diferente ainda é incomparável', () => {
    // A asserção acima sozinha teria um buraco: um `Adventurer` em awakening 3 e um `Hero` em
    // awakening 0 são os dois rank corrente `hero`, e mesmo assim o primeiro atravessou três
    // degraus de curva que o segundo não pagou. O rank é a leitura; o awakening é o preço.
    const awakenings = new Set(comps.flatMap((comp) => comp.units.map((u) => u.hero.awakening)));

    expect([...awakenings], `awakenings distintos na matriz: ${[...awakenings].join(', ')}`).toHaveLength(1);
  });

  it('o awakening escolhido é o MÍNIMO que iguala os dois ranks de base', () => {
    // Não é um número solto: abaixo de `AWAKENING_PARA_HERO` um `Adventurer` ainda é
    // `adventurer` e a matriz volta a misturar; acima, todo comp paga curva que o
    // balanceamento não precisa para ser comparável. Se o limiar mudar em `packages/core`,
    // é aqui que os comps ficam vermelhos.
    const awakening = comps[0]!.units[0]!.hero.awakening;

    expect(awakening).toBe(AWAKENING_PARA_HERO);
    expect(rankCorrente('adventurer', awakening)).toBe(rankCorrente('hero', awakening));
  });

  it('todo personagem JOGÁVEL aparece em algum comp — ninguém fica sem ser medido', () => {
    // O recíproco, e é ele que pega o buraco de verdade: a 3/N autorou seis personagens e
    // `pnpm balance` saiu IDÊNTICO, porque nenhum deles estava em comp nenhum. Sem esta
    // asserção, metade do elenco podia nunca ser medida e o relatório continuaria verde.
    const medidos = new Set(comps.flatMap((comp) => comp.units.map((u) => u.hero.characterId)));

    for (const personagem of elenco) {
      expect(medidos.has(personagem.id), `${personagem.id} não aparece em comp nenhum`).toBe(true);
    }
  });

  it('cada comp tem ids de herói únicos — dois iguais são a MESMA unidade para o motor', () => {
    for (const comp of comps) {
      const ids = comp.units.map((u) => u.hero.id);
      expect(new Set(ids).size, comp.id).toBe(ids.length);
    }
  });

  it('os dois ranks de base estão representados na matriz — senão ela não mede a divisão', () => {
    // Com o elenco inteiro `hero`, a asserção de rank corrente passaria trivialmente e não
    // diria nada. O que se afirma aqui é que a matriz de fato atravessa a divisão do elenco.
    const basesMedidas = new Set(
      comps.flatMap((comp) => comp.units.map((u) => rankDeBase.get(u.hero.characterId)!)),
    );

    expect([...basesMedidas].sort()).toEqual(['adventurer', 'hero']);
  });
});

// M38 5/N (D53 item 7) — a medição COM artefato tem a mesma exigência de comparabilidade: todo
// artefato no MESMO rank corrente. Cada unidade declara um artefato da CLASSE dela (decisão do
// usuário: não necessariamente a assinatura), e o torneio o leva em awakening 3, imprint 0.
describe('M38 5/N — a matriz com artefato também mede design', () => {
  const artefatos = readAll<{ id: string; classId: string; rank: BaseRank }>('artifacts');
  const porId = new Map(artefatos.map((a) => [a.id, a] as const));
  const AWAKENING_DA_MEDICAO = 3;

  it('toda unidade de todo comp declara um artefato que existe', () => {
    for (const comp of comps) {
      for (const unit of comp.units) {
        expect(unit.artifactId, `${comp.id}/${unit.hero.id}`).toBeDefined();
        expect(porId.has(unit.artifactId!), `${comp.id}/${unit.artifactId}`).toBe(true);
      }
    }
  });

  it('o artefato é da CLASSE da unidade', () => {
    for (const comp of comps) {
      for (const unit of comp.units) {
        expect(porId.get(unit.artifactId!)?.classId, `${comp.id}/${unit.hero.id}`).toBe(unit.hero.classId);
      }
    }
  });

  it('no awakening da medição, todos os artefatos estão no mesmo rank corrente', () => {
    const ranks = new Set(
      comps.flatMap((comp) => comp.units.map((u) => rankCorrente(porId.get(u.artifactId!)!.rank, AWAKENING_DA_MEDICAO))),
    );
    expect([...ranks]).toEqual(['hero']);
    expect(AWAKENING_DA_MEDICAO).toBe(AWAKENING_PARA_HERO);
  });

  it('a escolha é a combinada: o artefato Hero da classe, e o adventurer só onde a classe não tem Hero', () => {
    for (const comp of comps) {
      for (const unit of comp.units) {
        const daClasse = artefatos.filter((a) => a.classId === unit.hero.classId);
        const esperado = daClasse.find((a) => a.rank === 'hero') ?? daClasse[0];
        expect(unit.artifactId, `${comp.id}/${unit.hero.id}`).toBe(esperado?.id);
      }
    }
  });
});
