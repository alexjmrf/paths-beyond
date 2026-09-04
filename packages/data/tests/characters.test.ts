import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import characterSchema from '../schemas/characters.schema.js';
import { findJsonFiles } from '../validate.js';

// §10/D14 (M18, 6/N) — a FICHA INICIAL do personagem.
//
// Até esta fatia, `POST /summon` concedia POSSE e mais nada: o personagem invocado não
// virava herói nenhum, e o critério de aceite 1 pede que ele seja JOGÁVEL. O buraco é o
// mesmo para o núcleo de quatro — uma conta nova não tinha como receber as instâncias
// deles, porque todo herói do projeto até aqui nasceu de seed de banco ou de fixture.
//
// A ficha mora no CATÁLOGO e não no servidor por causa da regra 4: nível, arma e skills
// iniciais são conteúdo, e derivá-los por convenção de id dentro de `apps/server` seria
// exatamente o "conteúdo hardcoded" que a regra proíbe. O que a ficha NÃO carrega é
// progresso — exp, awakening, imprint e talentos são estado de conta, e um catálogo que
// os declarasse teria dois donos para o mesmo número.

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Personagem {
  readonly id: string;
  readonly classId: string;
  readonly acquisition: 'story' | 'summon';
  readonly startingHero?: {
    readonly level: number;
    readonly weaponType: string;
    readonly equipment: Readonly<Record<string, string | null>>;
    readonly duelSkills: readonly string[];
    readonly mapSkills: readonly string[];
    readonly tacticsScript: readonly unknown[];
  };
}

const elenco = findJsonFiles(join(dataRoot, 'characters')).map(
  (file) => JSON.parse(readFileSync(file, 'utf8')) as Personagem,
);

// A ficha do Aren, tal como a campanha a autora no capítulo 1 — o molde dos casos
// negativos abaixo.
function fichaValida(): Record<string, unknown> {
  return {
    level: 10,
    weaponType: 'sword',
    equipment: {
      weapon: 'item-arma-espadachim',
      helmet: null,
      armor: null,
      necklace: 'item-colar-forca',
      ring: null,
      boots: null,
    },
    duelSkills: ['skill-ataque-espadachim', 'skill-especial-espadachim'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-espadachim', conditions: [] }],
  };
}

function personagemCom(startingHero: unknown): unknown {
  return {
    id: 'personagem-teste',
    name: 'Teste',
    classId: 'class-espadachim',
    acquisition: 'summon',
    fragmentMaterialId: 'material-fragmento-personagem-teste',
    ...(startingHero === undefined ? {} : { startingHero }),
  };
}

describe('M18 §10 — todo personagem declara a ficha com que ele entra no jogo', () => {
  it('os nove personagens do elenco têm ficha inicial, e o schema aceita cada um', () => {
    expect(elenco.length).toBeGreaterThan(0);
    for (const personagem of elenco) {
      expect(personagem.startingHero, `sem ficha inicial: ${personagem.id}`).toBeDefined();
      expect(characterSchema.safeParse(personagem).success, personagem.id).toBe(true);
    }
  });

  it('rejeita personagem SEM ficha inicial — ele seria posse sem herói para levar ao mapa', () => {
    expect(characterSchema.safeParse(personagemCom(undefined)).success).toBe(false);
  });

  it('rejeita ficha sem arma: um herói sem arma não tem duelo a jogar', () => {
    const base = fichaValida();
    const semArma = { ...base, equipment: { ...(base.equipment as Record<string, unknown>), weapon: null } };
    expect(characterSchema.safeParse(personagemCom(semArma)).success).toBe(false);
  });

  it('rejeita ficha sem nenhuma skill de duelo', () => {
    expect(characterSchema.safeParse(personagemCom({ ...fichaValida(), duelSkills: [] })).success).toBe(false);
  });

  // A ficha é o PONTO DE PARTIDA, não um herói salvo: quem sobe de nível, desperta,
  // imprime ou aloca talento é a conta. Um catálogo que declarasse esses números teria
  // dois donos para o mesmo estado, e o segundo dono nunca ganha.
  it('rejeita ficha que declare progresso (exp, awakening, imprint ou talentos)', () => {
    for (const progresso of [{ exp: 100 }, { awakening: 3 }, { imprint: 2 }, { talents: { 'talent-aren-fio-agressivo': 1 } }]) {
      expect(
        characterSchema.safeParse(personagemCom({ ...fichaValida(), ...progresso })).success,
        Object.keys(progresso)[0],
      ).toBe(false);
    }
  });

  // §8.2/D2 — o herói escolhe UM `weaponType` dentre os da classe. O cruzamento com o
  // catálogo de classes vive em `packages/content` (este pacote não lê classe nenhuma);
  // aqui trava só a forma.
  it('rejeita `weaponType` que não é um tipo de arma do jogo', () => {
    expect(characterSchema.safeParse(personagemCom({ ...fichaValida(), weaponType: 'chicote' })).success).toBe(false);
  });
});
