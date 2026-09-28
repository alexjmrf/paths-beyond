import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import characterSchema from '../schemas/characters.schema.js';
import dungeonSchema from '../schemas/dungeons.schema.js';
import economySchema from '../schemas/economy-rules.schema.js';
import heroSchema from '../schemas/heroes.schema.js';
import materialSchema from '../schemas/materials.schema.js';

// M39 3/N (D60) — A SOUL, do lado do dado: as 2–3 opções de mainstat de CADA personagem (no
// arquivo do personagem), o bloco `soul` de `economy.json` (nível de abertura, tabela própria de
// substats, custos de craft e recraft), a Essência de Alma e o drop dela na Forja Abandonada.
// Todos os números são a proposta aprovada pelo usuário em 2026-09-26.

const ler = (caminho: string) => JSON.parse(readFileSync(new URL(caminho, import.meta.url), 'utf8'));
const lerPasta = (pasta: string) => readdirSync(new URL(`../${pasta}/`, import.meta.url)).map((f) => ler(`../${pasta}/${f}`));

const economia = ler('../economy-rules/economy.json');
const personagens = lerPasta('characters');
const umPersonagem = personagens[0];
const substatsDosItens: { stat: string; weight: number; valueRange: { min: number; max: number } }[] = ler(
  '../substat-weights/substat-weights.json',
);

const ESSENCIA = 'material-essencia-de-alma';

// A tabela aprovada: opções por personagem, peso igual.
const OPCOES_APROVADAS: Record<string, string[]> = {
  'hero-jogador': ['atk', 'chd', 'eff'],
  'ally-escudeira': ['def', 'hp', 'eff'],
  'ally-guerreiro': ['atk', 'pen', 'eff'],
  'ally-machadeira': ['atk', 'chc', 'pen'],
  'ally-lanceiro': ['def', 'eff', 'hp'],
  'ally-piqueiro': ['hp', 'def', 'eff'],
  'ally-grifeiro': ['atk', 'chc', 'chd'],
  'ally-mensageira': ['heal', 'hp', 'efr'],
  'ally-couracado': ['def', 'hp', 'efr'],
  'ally-sentinela': ['hp', 'def', 'efr'],
  'ally-arqueiro': ['atk', 'chc', 'chd'],
  'ally-batedora': ['chc', 'chd', 'atk'],
  'ally-arcanista': ['atk', 'eff', 'pen'],
  'ally-clerigo': ['heal', 'atk', 'efr'],
  'ally-acolito': ['heal', 'hp', 'efr'],
};

// As faixas aprovadas, as mesmas para qualquer personagem que tenha o stat como opção.
const FAIXAS_APROVADAS: Record<string, { min: number; max: number }> = {
  atk: { min: 20, max: 45 },
  hp: { min: 80, max: 160 },
  def: { min: 15, max: 35 },
  chc: { min: 45, max: 90 },
  chd: { min: 70, max: 140 },
  eff: { min: 50, max: 100 },
  efr: { min: 50, max: 100 },
  pen: { min: 45, max: 80 },
  heal: { min: 45, max: 90 },
};

describe('as opções de mainstat da Soul, no arquivo do personagem', () => {
  const opcao = (stat: string) => ({ stat, weight: 1, valueRange: { min: 10, max: 20 } });
  const comSoul = (mainstatOptions: unknown[]) => ({ ...umPersonagem, soul: { mainstatOptions } });

  it('é obrigatória: personagem sem Soul é recusado', () => {
    const { soul: _fora, ...sem } = umPersonagem;
    expect(characterSchema.safeParse(sem).success).toBe(false);
  });

  it('são 2 ou 3 opções — nem 1, nem 4', () => {
    expect(characterSchema.safeParse(comSoul([opcao('atk')])).success).toBe(false);
    expect(characterSchema.safeParse(comSoul([opcao('atk'), opcao('hp')])).success).toBe(true);
    expect(characterSchema.safeParse(comSoul([opcao('atk'), opcao('hp'), opcao('def')])).success).toBe(true);
    expect(characterSchema.safeParse(comSoul([opcao('atk'), opcao('hp'), opcao('def'), opcao('chc')])).success).toBe(false);
  });

  it('recusa opção repetida, faixa invertida, peso não positivo e stat inexistente', () => {
    expect(characterSchema.safeParse(comSoul([opcao('atk'), opcao('atk')])).success).toBe(false);
    expect(characterSchema.safeParse(comSoul([opcao('atk'), { ...opcao('hp'), valueRange: { min: 30, max: 20 } }])).success).toBe(false);
    expect(characterSchema.safeParse(comSoul([opcao('atk'), { ...opcao('hp'), weight: 0 }])).success).toBe(false);
    expect(characterSchema.safeParse(comSoul([opcao('atk'), opcao('mana')])).success).toBe(false);
  });

  it('não declara dono: o dono é o próprio personagem (nada de `soulOf` para errar no dado)', () => {
    expect(characterSchema.safeParse({ ...umPersonagem, soul: { ...umPersonagem.soul, soulOf: 'ally-x' } }).success).toBe(false);
  });

  it('todo personagem do elenco tem as opções aprovadas, com peso igual e as faixas aprovadas', () => {
    expect(personagens.map((p) => p.id).sort()).toEqual(Object.keys(OPCOES_APROVADAS).sort());
    for (const p of personagens) {
      const opcoes = p.soul.mainstatOptions;
      expect(opcoes.map((o: { stat: string }) => o.stat), p.id).toEqual(OPCOES_APROVADAS[p.id]);
      for (const o of opcoes) {
        expect(o.weight, `${p.id} ${o.stat}`).toBe(1);
        expect(o.valueRange, `${p.id} ${o.stat}`).toEqual(FAIXAS_APROVADAS[o.stat]);
      }
    }
  });

  it('focus e vigor ficam FORA por agora (decisão do usuário: abaixo do limiar seriam decoração)', () => {
    for (const p of personagens) {
      for (const o of p.soul.mainstatOptions) expect(['focus', 'vigor'], p.id).not.toContain(o.stat);
    }
  });
});

describe('o bloco `soul` de economy.json', () => {
  it('existe e o schema o exige', () => {
    expect(economySchema.safeParse(economia).success).toBe(true);
    const { soul: _fora, ...sem } = economia;
    expect(economySchema.safeParse(sem).success).toBe(false);
  });

  it('o slot abre no nível 20 (D58)', () => {
    expect(economia.soul.unlockLevel).toBe(20);
  });

  it('craft 40 Essências + 5.000 de ouro; recraft 20 + 2.500 (a metade: o sumidouro repetível)', () => {
    expect(economia.soul.craftCost).toEqual({ gold: 5000, materials: { [ESSENCIA]: 40 } });
    expect(economia.soul.recraftCost).toEqual({ gold: 2500, materials: { [ESSENCIA]: 20 } });
  });

  it('a tabela de substats é PRÓPRIA: os mesmos stats e pesos dos itens, com a faixa em dobro', () => {
    const esperado = substatsDosItens.map((s) => ({
      stat: s.stat,
      weight: s.weight,
      valueRange: { min: s.valueRange.min * 2, max: s.valueRange.max * 2 },
    }));
    expect(economia.soul.substats).toEqual(esperado);
  });

  it('recusa substat repetido e nível fora de 1..60', () => {
    const s = economia.soul;
    expect(economySchema.safeParse({ ...economia, soul: { ...s, substats: [s.substats[0], s.substats[0]] } }).success).toBe(false);
    expect(economySchema.safeParse({ ...economia, soul: { ...s, unlockLevel: 0 } }).success).toBe(false);
    expect(economySchema.safeParse({ ...economia, soul: { ...s, unlockLevel: 61 } }).success).toBe(false);
  });
});

describe('a Essência de Alma e o drop dela', () => {
  it('é material GENÉRICO: serve a qualquer personagem, e não tem dono', () => {
    const essencia = ler(`../materials/${ESSENCIA}.json`);
    expect(materialSchema.safeParse(essencia).success).toBe(true);
    expect(essencia.kind).toBe('generic');
    expect(essencia.forCharacterId).toBeUndefined();
  });

  it('dropa na Forja Abandonada: normal 3–5, elite 7–11, uma rolagem por run', () => {
    const normal = ler('../dungeons/dungeon-forja-abandonada.json');
    const elite = ler('../dungeons/dungeon-forja-abandonada-elite.json');
    for (const d of [normal, elite]) expect(dungeonSchema.safeParse(d).success, d.id).toBe(true);
    expect(normal.materialDropCount).toBe(1);
    expect(normal.materialDrops).toEqual([{ weight: 1, materialId: ESSENCIA, amount: { min: 3, max: 5 } }]);
    expect(elite.materialDropCount).toBe(1);
    expect(elite.materialDrops).toEqual([{ weight: 1, materialId: ESSENCIA, amount: { min: 7, max: 11 } }]);
  });

  it('e em nenhum outro lugar', () => {
    for (const d of lerPasta('dungeons')) {
      if (d.id.startsWith('dungeon-forja-abandonada')) continue;
      const ids = (d.materialDrops ?? []).map((m: { materialId: string }) => m.materialId);
      expect(ids, d.id).not.toContain(ESSENCIA);
    }
  });
});

describe('o herói guarda a Soul equipada', () => {
  const heroi = {
    id: 'h',
    characterId: 'hero-jogador',
    classId: 'class-espadachim',
    level: 20,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType: 'sword',
    duelSkills: [],
    mapSkills: [],
    tacticsScript: [],
  };

  it('`soul` é opcional e anulável, como o artefato', () => {
    expect(heroSchema.safeParse(heroi).success).toBe(true);
    expect(heroSchema.safeParse({ ...heroi, soul: null }).success).toBe(true);
    expect(heroSchema.safeParse({ ...heroi, soul: 'soul-1' }).success).toBe(true);
    expect(heroSchema.safeParse({ ...heroi, soul: '' }).success).toBe(false);
  });
});
