import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findJsonFiles } from '../validate.js';

// M38 2/N (D53/D54) — o CONTEÚDO dos artefatos: um por personagem do elenco, a curva de
// awakening própria e o material novo, os fragmentos e o drop. As asserções são sobre os JSON
// reais; o que o schema já garante por forma não se repete aqui.

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = <T>(tipo: string): T[] => findJsonFiles(join(dataRoot, tipo)).map((f) => JSON.parse(readFileSync(f, 'utf8')) as T);

interface Artefato {
  id: string;
  signatureOf: string;
  classId: string;
  rank: 'adventurer' | 'hero';
  atkByAwakening: number[];
  variableStat: { stat: string; byAwakening: number[] };
  imprintFlat: unknown[];
  passive: { t: string; skillId?: string; amountByImprint?: number[]; multiplierByImprint?: number[] };
}
interface Personagem { id: string; classId: string; rank: 'adventurer' | 'hero' }
interface Material { id: string; kind: string; forArtifactId?: string }
interface Skill { id: string; kind: string; trigger?: string }

const artefatos = ler<Artefato>('artifacts');
const elenco = ler<Personagem>('characters');
const materiais = ler<Material>('materials');
const skills = new Map(ler<Skill>('skills').map((s) => [s.id, s]));
const economia = ler<{ artifactAwakening: { gold: number; materials: Record<string, number> }[]; artifactImprint: unknown[]; awakening: unknown[]; imprint: unknown[] }>('economy-rules')[0]!;

// A régua de D54-B: o quanto de cada stat vale 1 de `atk`, derivada das faixas de substat
// que já existem (atk 4–12 ≈ hp 20–60 ≈ def 4–10 ≈ …), em escala 1000.
const REGUA: Record<string, number> = { hp: 5000, def: 830, chc: 4000, chd: 6500, eff: 5000, efr: 5000, pen: 4000 };
const ATK = [8, 10, 12, 14, 17, 20, 24];

describe('os artefatos do elenco', () => {
  it('um artefato por personagem, e nenhum sem dono', () => {
    const donos = artefatos.map((a) => a.signatureOf).sort();
    expect(donos).toEqual(elenco.map((p) => p.id).sort());
  });

  it('classe e rank de base vêm do dono: a trava de classe é a dele, e o artefato de um Hero é Hero', () => {
    const porId = new Map(elenco.map((p) => [p.id, p]));
    for (const a of artefatos) {
      const dono = porId.get(a.signatureOf)!;
      expect(a.classId, a.id).toBe(dono.classId);
      expect(a.rank, a.id).toBe(dono.rank);
    }
  });

  it('o tier não carrega poder nos status: mesma curva de atk e o mesmo imprint para os 15', () => {
    for (const a of artefatos) {
      expect(a.atkByAwakening, a.id).toEqual(ATK);
      expect(a.imprintFlat, a.id).toEqual(artefatos[0]!.imprintFlat);
    }
  });

  it('o stat variável é a curva de atk convertida pela régua — o mesmo orçamento para todos', () => {
    for (const a of artefatos) {
      const fator = REGUA[a.variableStat.stat];
      expect(fator, `${a.id}: stat variável ${a.variableStat.stat} sem régua`).toBeDefined();
      expect(a.variableStat.byAwakening, a.id).toEqual(ATK.map((v) => Math.trunc((v * fator!) / 1000)));
    }
  });

  it('nenhuma passiva de % de spd (regra 8)', () => {
    for (const a of artefatos) expect(a.passive.t === 'stat' && (a.passive as { stat?: string }).stat === 'spd', a.id).toBe(false);
  });

  it('toda passiva de reação aponta para uma skill de reação do catálogo', () => {
    for (const a of artefatos.filter((x) => x.passive.t === 'reaction')) {
      const s = skills.get(a.passive.skillId!);
      expect(s, a.id).toBeDefined();
      expect(s!.kind, a.id).toBe('reaction');
      expect(['onAttacked', 'onDamaged', 'onDebuffed'], a.id).toContain(s!.trigger);
    }
  });

  // D54 — "mais simples" para o `adventurer`: só o que já existe (stat %, pool FIXO, ou uma
  // reação que não é dele), sem skill própria e sem magnitude de pool crescendo com o imprint.
  it('a passiva do adventurer é a mais simples: nenhuma skill só dele e nenhum pool que cresce', () => {
    const skillsDeHero = new Set(artefatos.filter((a) => a.rank === 'hero' && a.passive.skillId).map((a) => a.passive.skillId));
    for (const a of artefatos.filter((x) => x.rank === 'adventurer')) {
      if (a.passive.t === 'startingPool') expect(new Set(a.passive.amountByImprint).size, a.id).toBe(1);
      if (a.passive.t === 'reaction') expect(skillsDeHero.has(a.passive.skillId), a.id).toBe(false);
    }
  });

  it('a do Hero traz skill própria ou pool que cresce com o imprint', () => {
    for (const a of artefatos.filter((x) => x.rank === 'hero')) {
      const skillPropria = a.passive.t === 'reaction' && artefatos.filter((x) => x.passive.skillId === a.passive.skillId).length === 1;
      const poolQueCresce = a.passive.t === 'startingPool' && new Set(a.passive.amountByImprint).size > 1;
      const statQueCresce = a.passive.t === 'stat';
      expect(skillPropria || poolQueCresce || statQueCresce, a.id).toBe(true);
    }
  });
});

describe('a evolução do artefato (D54-C)', () => {
  it('um fragmento por artefato', () => {
    const fragmentos = materiais.filter((m) => m.kind === 'artifactFragment').map((m) => m.forArtifactId).sort();
    expect(fragmentos).toEqual(artefatos.map((a) => a.id).sort());
  });

  it('awakening próprio: 6 passos, ouro igual ao do personagem, pago com o núcleo de artefato', () => {
    expect(economia.artifactAwakening).toHaveLength(6);
    const ouroDoPersonagem = (economia.awakening as { gold: number }[]).map((p) => p.gold);
    expect(economia.artifactAwakening.map((p) => p.gold)).toEqual(ouroDoPersonagem);
    expect(economia.artifactAwakening.map((p) => p.materials['material-nucleo-de-artefato'])).toEqual([2, 4, 6, 10, 15, 25]);
    expect(materiais.find((m) => m.id === 'material-nucleo-de-artefato')?.kind).toBe('awakening');
  });

  it('imprint: a mesma tabela do personagem', () => {
    expect(economia.artifactImprint).toEqual(economia.imprint);
  });

  // O drop é sorteio ponderado COM reposição. Somar uma entrada de peso 4 sozinho diluiria o
  // núcleo de despertar e os fragmentos; subir `materialDropCount` de 2 para 3 junto mantém o
  // número ESPERADO de cada material que já existia exatamente igual (2·4/8 = 3·4/12). No
  // elite (peso total 11, 3 sorteios) não há peso inteiro que faça isso: os pesos antigos foram
  // multiplicados por 3 — a proporção entre eles não muda — e o núcleo de artefato entra com 11.
  // A regra é NÃO DILUIR; a igualdade de peso com o núcleo de despertar só vale no normal.
  it('o núcleo de artefato dropa onde o de despertar dropa, sem diluir nenhum drop que já existia', () => {
    for (const id of ['dungeon-covil-do-tirano', 'dungeon-covil-do-tirano-elite']) {
      const m = JSON.parse(readFileSync(join(dataRoot, "dungeons", `${id}.json`), 'utf8')) as {
        materialDropCount: number;
        materialDrops: { weight: number; materialId: string; amount: unknown }[];
      };
      const despertar = m.materialDrops.find((d) => d.materialId === 'material-nucleo-de-despertar')!;
      const artefato = m.materialDrops.find((d) => d.materialId === 'material-nucleo-de-artefato');
      expect(artefato, id).toBeDefined();
      expect(artefato!.amount, id).toEqual(despertar.amount);
      const total = m.materialDrops.reduce((t, d) => t + d.weight, 0);
      const antes = { count: m.materialDropCount - 1, total: total - artefato!.weight };
      for (const d of m.materialDrops.filter((x) => x !== artefato)) {
        expect(m.materialDropCount * d.weight * antes.total, `${id} ${d.materialId}`).toBe(antes.count * d.weight * total);
      }
    }
  });
});
