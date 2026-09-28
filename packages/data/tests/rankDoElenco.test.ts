import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import characterSchema from '../schemas/characters.schema.js';
import { findJsonFiles } from '../validate.js';

// M37, sub-sessão 1/N — O RANK DE BASE É CATÁLOGO, e é aqui que isso vira trava.
//
// **O que este arquivo impede.** `rank` é identidade do personagem, como `classId` e
// `acquisition`: um `Adventurer` é `Adventurer` para sempre, em toda conta. O que a conta
// move é o rank CORRENTE, que é função do awakening e não mora em arquivo nenhum
// (`packages/core/src/economy/rank.ts`). Se um dia alguém escrever `rank: 'legend'` num JSON,
// ou acrescentar um personagem sem rank, é este teste que reprova — antes de o dado existir.
//
// **A divisão do elenco segue a profundidade da árvore, e isso não é convenção solta.** D9
// travou o orçamento em 9 pontos para todo mundo e declarou que profundidade é troca de FORMA,
// não de poder; DECISIONS.md §2 leu isso como o eixo do rank — `Adventurer` ≈ 5–6,
// `Hero` ≈ 7–9. É por isso que a faixa é conferida contra as árvores de verdade, e não contra
// uma lista escrita à mão: um personagem novo entra na conferência sozinho.

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Personagem {
  readonly id: string;
  readonly name: string;
  readonly rank?: string;
  readonly acquisition: 'story' | 'summon';
}

interface Arvore {
  readonly characterId: string;
  readonly depth: number;
  readonly nodes: readonly { readonly maxPoints?: number }[];
}

const elenco = findJsonFiles(join(dataRoot, 'characters')).map(
  (file) => JSON.parse(readFileSync(file, 'utf8')) as Personagem,
);
const arvores = findJsonFiles(join(dataRoot, 'character-talent-trees')).map(
  (file) => JSON.parse(readFileSync(file, 'utf8')) as Arvore,
);
const arvorePorPersonagem = new Map(arvores.map((a) => [a.characterId, a] as const));

/** A faixa de profundidade de cada rank, como DECISIONS.md §2 a fixou. */
const PROFUNDIDADE_POR_RANK: Readonly<Record<string, readonly [number, number]>> = {
  adventurer: [5, 6],
  hero: [7, 9],
};

function comRank(rank: string): Personagem {
  return {
    id: 'ally-teste',
    name: 'Teste',
    classId: 'class-espadachim',
    acquisition: 'summon',
    rank,
    fragmentMaterialId: 'material-fragmento-teste',
    startingHero: {
      level: 10,
      weaponType: 'sword',
      equipment: { weapon: 'item-arma-espadachim', helmet: null, armor: null, necklace: null, ring: null, boots: null },
      duelSkills: ['skill-ataque-espadachim'],
      mapSkills: [],
      tacticsScript: [],
    },
    soul: {
      mainstatOptions: [
        { stat: 'atk', weight: 1, valueRange: { min: 20, max: 45 } },
        { stat: 'hp', weight: 1, valueRange: { min: 80, max: 160 } },
      ],
    },
  } as unknown as Personagem;
}

describe('M37 1/N — o rank de base, no catálogo', () => {
  it('todo personagem do elenco declara um rank, e o schema aceita cada um', () => {
    expect(elenco.length).toBeGreaterThan(0);
    for (const personagem of elenco) {
      expect(personagem.rank, `${personagem.id} não declara rank`).toBeDefined();
      expect(() => characterSchema.parse(personagem), personagem.id).not.toThrow();
    }
  });

  it('rejeita personagem SEM rank — ele nasceria `Adventurer` por omissão e ninguém repararia', () => {
    // Mesmo argumento de `acquisition`: obrigatório e sem padrão. Um campo com default é um
    // campo que ninguém preenche, e rank decide de que banner o personagem sai.
    const { rank: _rank, ...semRank } = comRank('hero') as unknown as Record<string, unknown>;
    expect(() => characterSchema.parse(semRank)).toThrow();
  });

  it('rejeita `legend` como rank de BASE — o topo não é invocável, chega-se nele por evolução', () => {
    expect(() => characterSchema.parse(comRank('legend'))).toThrow();
    expect(() => characterSchema.parse(comRank('adventurer'))).not.toThrow();
    expect(() => characterSchema.parse(comRank('hero'))).not.toThrow();
  });

  it('rejeita rank inventado', () => {
    expect(() => characterSchema.parse(comRank('lendario'))).toThrow();
    expect(() => characterSchema.parse(comRank(''))).toThrow();
  });

  it('o rank bate com a PROFUNDIDADE da árvore, personagem a personagem', () => {
    // A ponte entre o rank e "kit mais simples, não mais fraco" (DECISIONS.md §2). Derivada
    // das árvores reais: um personagem novo com árvore fora da faixa do rank dele reprova
    // aqui, no commit dele.
    for (const personagem of elenco) {
      const arvore = arvorePorPersonagem.get(personagem.id);
      expect(arvore, `${personagem.id} não tem árvore`).toBeDefined();

      const faixa = PROFUNDIDADE_POR_RANK[personagem.rank!];
      expect(faixa, `${personagem.id}: rank ${personagem.rank} sem faixa declarada`).toBeDefined();

      const [minimo, maximo] = faixa!;
      expect(arvore!.depth, `${personagem.id} (${personagem.rank})`).toBeGreaterThanOrEqual(minimo);
      expect(arvore!.depth, `${personagem.id} (${personagem.rank})`).toBeLessThanOrEqual(maximo);
    }
  });

  it('as duas faixas não se tocam: nenhuma profundidade serve aos dois ranks', () => {
    // Sem isto, uma faixa sobreposta faria o teste acima passar com o rank errado — e a
    // asserção viraria decoração.
    const [advMin, advMax] = PROFUNDIDADE_POR_RANK.adventurer!;
    const [heroMin, heroMax] = PROFUNDIDADE_POR_RANK.hero!;
    expect(advMax).toBeLessThan(heroMin);
    expect(advMin).toBeLessThanOrEqual(advMax);
    expect(heroMin).toBeLessThanOrEqual(heroMax);
  });

  it('o ORÇAMENTO de talento é o mesmo nos dois ranks — rank é forma, nunca poder (D9)', () => {
    // A trava do milestone inteiro, medida no dado. Se um dia um `Hero` ganhar mais pontos que
    // um `Adventurer`, o rank passou a carregar poder e `pnpm balance` vai reprovar depois —
    // este teste reprova antes.
    const orcamento = (arvore: Arvore) => arvore.nodes.reduce((soma, no) => soma + (no.maxPoints ?? 1), 0);
    const porRank = new Map<string, number[]>();
    for (const personagem of elenco) {
      const arvore = arvorePorPersonagem.get(personagem.id)!;
      const lista = porRank.get(personagem.rank!) ?? [];
      lista.push(orcamento(arvore));
      porRank.set(personagem.rank!, lista);
    }

    // Mede a CAPACIDADE da árvore (quantos pontos ela comporta), que é o que difere com a
    // profundidade. O que não pode diferir é o orçamento GASTÁVEL, e esse é uma constante do
    // core (`TALENT_BUDGET`), conferida em `packages/core`. Aqui basta que os dois ranks
    // existam no elenco para a comparação valer alguma coisa.
    expect([...porRank.keys()].sort()).toEqual(['adventurer', 'hero']);
  });

  it('o elenco tem pelo menos 1,5 `Adventurer` para cada `Hero` — a proporção é decisão do usuário', () => {
    // DECISIONS.md §8 dimensiona a milestone por aqui, e o usuário fechou 1,5× a 2× sobre o
    // elenco INTEIRO. Enquanto a 3/N não autorar os novos, este teste é o que diz que falta.
    const porRank = new Map<string, number>();
    for (const personagem of elenco) porRank.set(personagem.rank!, (porRank.get(personagem.rank!) ?? 0) + 1);

    const adventurers = porRank.get('adventurer') ?? 0;
    const heroes = porRank.get('hero') ?? 0;
    expect(heroes).toBeGreaterThan(0);
    expect(adventurers / heroes, `${adventurers} adventurers para ${heroes} heroes`).toBeGreaterThanOrEqual(1.5);
  });
});
