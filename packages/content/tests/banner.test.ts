import { describe, expect, it } from 'vitest';
import { entryId, rateOf, validateBanner, type BannerDef } from '@paths-beyond/gacha';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';

// §10 (M18, 2/N) — a conformidade entre o BANNER e o ELENCO.
//
// Este arquivo existe porque nenhum schema de `packages/data` pode fazer estas perguntas:
// lá cada arquivo é validado isolado, e "o personagem do pool existe?" cruza dois tipos de
// conteúdo. É a mesma divisão de trabalho de todo o projeto — schema valida forma,
// `packages/content` valida que o conteúdo conversa entre si.
//
// A pergunta mais importante daqui é o RECÍPROCO, que é a lacuna que M17 4/N e 5/N
// encontraram duas vezes: não basta "todo id do pool existe", também tem de valer "todo
// adquirível está em algum pool". Sem o segundo, marcar um personagem como `summon` e
// esquecê-lo fora do banner o deixa inalcançável por qualquer caminho — sem erro nenhum.

const catalog = loadCatalogFromDisk();

const characters = Object.values(catalog.characters);
const banners = Object.values(catalog.banners);

const nucleo = characters.filter((c) => c.acquisition === 'story');
const adquiriveis = characters.filter((c) => c.acquisition === 'summon');

function asBannerDef(banner: (typeof banners)[number]): BannerDef {
  // Sem conversão: o `BannerContent` do catálogo É a forma que `packages/gacha` consome.
  // Se um dia deixar de ser, este teste para de compilar — que é o aviso que se quer.
  return banner;
}

describe('o elenco partido em núcleo e adquiríveis (D14)', () => {
  it('tem exatamente 4 de núcleo de história e 11 adquiríveis', () => {
    // O núcleo não mudou no M37: os seis `Adventurer` que D49 acrescentou são todos de
    // banner, porque é do banner de `Hero` que o tier de baixo sai (D50).
    expect(nucleo.map((c) => c.id).sort()).toEqual(
      ['ally-arcanista', 'ally-arqueiro', 'ally-clerigo', 'hero-jogador'].sort(),
    );
    expect(adquiriveis.map((c) => c.id).sort()).toEqual(
      [
        'ally-acolito',
        'ally-batedora',
        'ally-couracado',
        'ally-escudeira',
        'ally-grifeiro',
        'ally-guerreiro',
        'ally-lanceiro',
        'ally-machadeira',
        'ally-mensageira',
        'ally-piqueiro',
        'ally-sentinela',
      ].sort(),
    );
  });

  it('todo personagem declara um fragmento que existe no catálogo de materiais', () => {
    for (const character of characters) {
      const material = catalog.materials[character.fragmentMaterialId];
      expect(material, `${character.id} aponta para fragmento inexistente`).toBeDefined();
      expect(material?.kind).toBe('heroFragment');
      expect(material?.forCharacterId).toBe(character.id);
    }
  });
});

describe('os banners conversam com o elenco e com os artefatos (M38 3/N)', () => {
  const artefatos = Object.values(catalog.artifacts);
  const contexto = {
    acquirableCharacterIds: adquiriveis.map((c) => c.id),
    knownArtifactIds: artefatos.map((a) => a.id),
  };

  it('há exatamente os três banners de D55: um rotativo de cada tipo e o genérico', () => {
    expect(banners.map((b) => `${b.kind}:${b.id}`).sort()).toEqual([
      'generic:banner-generico',
      'rotatingArtifact:banner-rotativo-artefato-rurik',
      'rotatingCharacter:banner-rotativo-rurik',
    ]);
  });

  it('todo banner passa na validação de autoria de `packages/gacha`', () => {
    for (const banner of banners) {
      const issues = validateBanner(asBannerDef(banner), contexto);
      expect(issues, `${banner.id}: ${issues.map((i) => i.message).join('; ')}`).toEqual([]);
    }
  });

  it('nenhum personagem de NÚCLEO DE HISTÓRIA aparece em pool de banner', () => {
    const nucleoIds = new Set(nucleo.map((c) => c.id));
    for (const banner of banners) {
      for (const entry of banner.pool) {
        if (entry.characterId) expect(nucleoIds.has(entry.characterId), `${banner.id}/${entry.characterId}`).toBe(false);
      }
    }
  });

  it('o fragmento declarado na entrada é o MESMO do personagem ou do artefato', () => {
    for (const banner of banners) {
      for (const entry of banner.pool) {
        if (entry.characterId) {
          expect(entry.fragmentMaterialId).toBe(catalog.characters[entry.characterId]?.fragmentMaterialId);
        } else {
          const material = catalog.materials[entry.fragmentMaterialId];
          expect(material?.kind, `${banner.id}/${entry.artifactId}`).toBe('artifactFragment');
          expect(material?.forArtifactId).toBe(entry.artifactId);
        }
      }
    }
  });

  it('o `rank` de cada entrada é o do personagem ou do artefato — derivado, nunca autorado (D49)', () => {
    for (const banner of banners) {
      for (const entry of banner.pool) {
        const esperado = entry.characterId
          ? catalog.characters[entry.characterId]?.rank
          : catalog.artifacts[entry.artifactId!]?.rank;
        expect(entry.rank, `${banner.id}/${entryId(entry)}`).toBe(esperado);
      }
    }
  });

  it('TODO adquirível está em algum pool — senão ele é inalcançável em silêncio', () => {
    const noPool = new Set(banners.flatMap((banner) => banner.pool.map((entry) => entry.characterId)));
    for (const character of adquiriveis) {
      expect(noPool.has(character.id), `${character.id} é 'summon' e não está em banner nenhum`).toBe(true);
    }
  });

  it('TODO artefato está em algum pool — inclusive os dos Heroes de história', () => {
    const noPool = new Set(banners.flatMap((banner) => banner.pool.map((entry) => entry.artifactId)));
    for (const artefato of artefatos) {
      expect(noPool.has(artefato.id), `${artefato.id} não sai de banner nenhum`).toBe(true);
    }
  });
});

describe('o rotativo de personagem (D54)', () => {
  const rotativo = banners.find((b) => b.kind === 'rotatingCharacter')!;
  if (rotativo.kind !== 'rotatingCharacter') throw new Error('inalcançável');

  it('o destaque é Rurik, um `Hero` invocável, e é o ÚNICO `Hero` do pool', () => {
    expect(rotativo.featuredCharacterId).toBe('ally-guerreiro');
    expect(catalog.characters[rotativo.featuredCharacterId]?.rank).toBe('hero');
    expect(rotativo.pool.filter((e) => e.rank === 'hero').map(entryId)).toEqual(['ally-guerreiro']);
  });

  it('o preenchimento são os Adventurers invocáveis, com o mesmo peso', () => {
    const adv = rotativo.pool.filter((e) => e.rank === 'adventurer');
    expect(adv.map(entryId).sort()).toEqual(adquiriveis.filter((c) => c.rank === 'adventurer').map((c) => c.id).sort());
    expect(new Set(adv.map((e) => e.weight)).size).toBe(1);
  });

  it('o teto é o P do jogo, e a curva é a de D54: 0,6%, rampa da 74ª, +6%', () => {
    expect(rotativo.pityThresholds).toEqual(catalog.premiumRules.summon.pityThresholds);
    expect(rotativo.softPity).toEqual({ baseRate: 6, softStart: 74, step: 60 });
  });

  it('o token é 1,5·P = 135 e entrega o artefato ASSINATURA do destaque, com o fragmento dele', () => {
    const P = catalog.premiumRules.summon.pityThresholds.hero;
    expect(rotativo.token.threshold).toBe((P * 3) / 2);
    expect(rotativo.token.threshold).toBe(135);
    expect(catalog.artifacts[rotativo.token.artifactId]?.signatureOf).toBe(rotativo.featuredCharacterId);
    expect(catalog.materials[rotativo.token.fragmentMaterialId]?.forArtifactId).toBe(rotativo.token.artifactId);
  });

  it('declara a janela de 2026-09-25 a 2026-10-09', () => {
    expect(rotativo.activeFrom).toBe('2026-09-25T00:00:00Z');
    expect(rotativo.activeUntil).toBe('2026-10-09T00:00:00Z');
  });
});

describe('o rotativo de artefato (D54)', () => {
  const rotativo = banners.find((b) => b.kind === 'rotatingArtifact')!;
  const doPersonagem = banners.find((b) => b.kind === 'rotatingCharacter')!;
  if (rotativo.kind !== 'rotatingArtifact' || doPersonagem.kind !== 'rotatingCharacter') throw new Error('inalcançável');

  it('garante o artefato do Hero em destaque no rotativo de personagem, na MESMA janela', () => {
    expect(catalog.artifacts[rotativo.featuredArtifactId]?.signatureOf).toBe(doPersonagem.featuredCharacterId);
    expect([rotativo.activeFrom, rotativo.activeUntil]).toEqual([doPersonagem.activeFrom, doPersonagem.activeUntil]);
  });

  it('o teto fica entre 0,60·P e 0,75·P (roadmap), e é 60 (D53)', () => {
    const P = catalog.premiumRules.summon.pityThresholds.hero;
    expect(rotativo.pityThresholds.hero).toBe(60);
    expect(rotativo.pityThresholds.hero * 100).toBeGreaterThanOrEqual(P * 60);
    expect(rotativo.pityThresholds.hero * 100).toBeLessThanOrEqual(P * 75);
    expect(rotativo.pityThresholds.adventurer).toBe(10);
    expect(rotativo.softPity).toEqual({ baseRate: 7, softStart: 50, step: 70 });
  });

  it('o preenchimento são os 9 artefatos `adventurer`, com o mesmo peso', () => {
    const adv = rotativo.pool.filter((e) => e.rank === 'adventurer');
    expect(adv).toHaveLength(9);
    expect(new Set(adv.map((e) => e.weight)).size).toBe(1);
  });
});

describe('o genérico misto (D54/D55)', () => {
  const generico = banners.find((b) => b.kind === 'generic')!;
  if (generico.kind !== 'generic') throw new Error('inalcançável');
  const soma = (rank: string, artefato: boolean) =>
    generico.pool
      .filter((e) => e.rank === rank && (e.artifactId !== undefined) === artefato)
      .reduce((t, e) => t + e.weight, 0);

  it('a escolha é a cada 180, e a curva é a de D54: 0,6%, rampa da 89ª, +6%, teto 105', () => {
    expect(generico.choiceEvery).toBe(180);
    expect(generico.pityThresholds).toEqual({ adventurer: 10, hero: 105 });
    expect(generico.softPity).toEqual({ baseRate: 6, softStart: 89, step: 60 });
  });

  it('o destaque do rotativo NÃO está no genérico enquanto for exclusivo', () => {
    expect(generico.pool.some((e) => e.characterId === 'ally-guerreiro')).toBe(false);
    expect(generico.pool.some((e) => e.artifactId === 'artifact-machado-do-tirano')).toBe(false);
  });

  it('o prêmio é 50% personagem e 50% artefato, com peso igual dentro de cada lado', () => {
    expect(soma('hero', false)).toBe(soma('hero', true));
    const heroes = generico.pool.filter((e) => e.rank === 'hero');
    for (const lado of [true, false]) {
      expect(new Set(heroes.filter((e) => (e.artifactId !== undefined) === lado).map((e) => e.weight)).size).toBe(1);
    }
  });

  it('o preenchimento também é 50/50', () => {
    expect(soma('adventurer', false)).toBe(soma('adventurer', true));
  });

  it('os Heroes são Bardan e Nyra; os artefatos Hero incluem os dos Heroes de história', () => {
    expect(
      generico.pool
        .filter((e) => e.rank === 'hero' && e.characterId)
        .map(entryId)
        .sort(),
    ).toEqual(['ally-couracado', 'ally-lanceiro']);
    expect(
      generico.pool
        .filter((e) => e.rank === 'hero' && e.artifactId)
        .map(entryId)
        .sort(),
    ).toEqual([
      'artifact-arco-da-alvorada',
      'artifact-egide-de-bardan',
      'artifact-lamina-do-juramento',
      'artifact-lanca-muralha',
      'artifact-relicario-de-miron',
    ]);
  });
});

describe('os números do summon (D17/D18)', () => {
  it('o custo do summon e da energia extra são positivos e inteiros', () => {
    const { summon, energyPurchase } = catalog.premiumRules;

    expect(Number.isInteger(summon.premiumCost) && summon.premiumCost > 0).toBe(true);
    expect(Number.isInteger(energyPurchase.premiumCost) && energyPurchase.premiumCost > 0).toBe(true);
    expect(Number.isInteger(energyPurchase.energy) && energyPurchase.energy > 0).toBe(true);
  });

  it('a energia comprada não passa do teto de conta — comprar acima do teto seria queimar moeda', () => {
    expect(catalog.premiumRules.energyPurchase.energy).toBeLessThanOrEqual(catalog.economyRules.energy.max);
  });

  it('as chances dentro de cada rank fecham em 1000 por mil, menos o truncamento', () => {
    for (const banner of banners) {
      for (const rank of ['adventurer', 'hero'] as const) {
        const entradas = banner.pool.filter((e) => e.rank === rank);
        const total = entradas.reduce((sum, entry) => sum + rateOf(asBannerDef(banner), entryId(entry)), 0);
        // `fpDiv` trunca: a soma fica em no máximo 1000 e perde menos de 1 por entrada.
        expect(total, `${banner.id}/${rank}`).toBeLessThanOrEqual(1000);
        expect(total, `${banner.id}/${rank}`).toBeGreaterThan(1000 - entradas.length);
      }
    }
  });
});

// §10 (M18, 4/N) — as duas fontes AUTORADAS da moeda premium conversando com o resto do
// conteúdo. Mesma divisão de trabalho de sempre: o schema valida a forma de um arquivo, e
// aqui se pergunta o que cruza tipos de conteúdo.
describe('as fontes autoradas da moeda premium', () => {
  const achievements = Object.values(catalog.achievements);
  const events = Object.values(catalog.events);

  it('há conquistas e eventos autorados', () => {
    expect(achievements.length).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(0);
  });

  it('nenhuma conquista é INALCANÇÁVEL: o limiar cabe no que o jogo tem', () => {
    // O erro provável aqui é autorar "limpe 8 capítulos" com 6 no jogo, ou "tenha 12
    // personagens" com 9 no elenco — uma conquista que ninguém nunca pode reivindicar, e
    // que nenhum schema pega porque o número é válido isoladamente.
    const capitulos = catalog.encounters.length;
    const masmorras = Object.keys(catalog.dungeons).length;
    const personagens = Object.keys(catalog.characters).length;

    for (const achievement of [...achievements, ...events]) {
      const condition = 'condition' in achievement ? achievement.condition : undefined;
      if (!condition) continue;

      if (condition.kind === 'chaptersCleared') {
        expect(condition.atLeast, `${achievement.id}`).toBeLessThanOrEqual(capitulos);
      }
      if (condition.kind === 'dungeonsCleared') {
        expect(condition.atLeast, `${achievement.id}`).toBeLessThanOrEqual(masmorras);
      }
      if (condition.kind === 'charactersOwned') {
        expect(condition.atLeast, `${achievement.id}`).toBeLessThanOrEqual(personagens);
      }
      // Os tetos de imprint e awakening são do motor (§10: 0–5 e 0–6), não do conteúdo.
      if (condition.kind === 'heroImprint') expect(condition.atLeast, `${achievement.id}`).toBeLessThanOrEqual(5);
      if (condition.kind === 'heroAwakening') expect(condition.atLeast, `${achievement.id}`).toBeLessThanOrEqual(6);
    }
  });

  it('a conquista de "elenco completo" pede exatamente o elenco, nem mais nem menos', () => {
    // Um alvo móvel de propósito: se um personagem entrar no elenco e esta conquista não
    // acompanhar, ela deixa de significar "completo" sem nada ficar vermelho.
    const completo = achievements.find((a) => a.id === 'achievement-elenco-completo');

    expect(completo?.condition).toEqual({
      kind: 'charactersOwned',
      atLeast: Object.keys(catalog.characters).length,
    });
  });

  it('a conquista de "fortaleza caiu" pede exatamente os capítulos que existem', () => {
    const fim = achievements.find((a) => a.id === 'achievement-a-fortaleza-caiu');

    // M27 — `chaptersCleared` continua significando CAPÍTULO INTEIRO, e a campanha passou a
    // ter duas camadas: a conquista de fim de linha pede os CAPÍTULOS, não as missões. Ler
    // `encounters.length` aqui era correto quando capítulo era missão, e viraria uma
    // conquista inalcançável (30) no dia em que a demo estivesse autorada.
    expect(fim?.condition).toEqual({ kind: 'chaptersCleared', atLeast: catalog.chapters.length });
  });

  it('nenhum id se repete entre conquistas e eventos — eles dividem a tabela de reivindicação', () => {
    const ids = [...achievements.map((a) => a.id), ...events.map((e) => e.id)];

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a energia de um evento e o custo de summon são coerentes: nenhum prêmio é zero', () => {
    for (const reward of [...achievements, ...events]) {
      expect(reward.premium, `${reward.id}`).toBeGreaterThan(0);
    }
  });

  it('os dois números de primeira completude são positivos', () => {
    const { chapterFirstClear, dungeonFirstClear } = catalog.premiumRules.premiumRewards;

    expect(chapterFirstClear).toBeGreaterThan(0);
    expect(dungeonFirstClear).toBeGreaterThan(0);
  });
});
