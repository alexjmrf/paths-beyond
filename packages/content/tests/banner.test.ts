import { describe, expect, it } from 'vitest';
import { rateOf, validateBanner, type BannerDef } from '@paths-beyond/gacha';
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
  it('tem exatamente 4 de núcleo de história e 5 adquiríveis', () => {
    expect(nucleo.map((c) => c.id).sort()).toEqual(
      ['ally-arcanista', 'ally-arqueiro', 'ally-clerigo', 'hero-jogador'].sort(),
    );
    expect(adquiriveis.map((c) => c.id).sort()).toEqual(
      ['ally-couracado', 'ally-grifeiro', 'ally-guerreiro', 'ally-lanceiro', 'ally-mensageira'].sort(),
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

describe('os banners conversam com o elenco', () => {
  it('há pelo menos um banner', () => {
    expect(banners.length).toBeGreaterThan(0);
  });

  it('todo banner passa na validação de autoria de `packages/gacha`', () => {
    // O motor e o dado concordando, e é isto que impede as duas metades de M18 de
    // divergirem: a validação que a 1/N escreveu roda contra o conteúdo que a 2/N autorou.
    for (const banner of banners) {
      const issues = validateBanner(asBannerDef(banner), {
        acquirableCharacterIds: adquiriveis.map((c) => c.id),
      });

      expect(issues, `${banner.id}: ${issues.map((i) => i.message).join('; ')}`).toEqual([]);
    }
  });

  it('nenhum personagem de NÚCLEO DE HISTÓRIA aparece em pool de banner', () => {
    const nucleoIds = new Set(nucleo.map((c) => c.id));

    for (const banner of banners) {
      for (const entry of banner.pool) {
        expect(nucleoIds.has(entry.characterId), `${banner.id} oferece ${entry.characterId}, que é garantido`).toBe(
          false,
        );
      }
    }
  });

  it('o fragmento declarado na entrada é o MESMO que o personagem declara', () => {
    // Duas fontes para a mesma verdade é duas chances de divergir. O banner declara o
    // fragmento porque o motor não pode derivá-lo (regra 4); esta asserção é o preço.
    for (const banner of banners) {
      for (const entry of banner.pool) {
        const character = catalog.characters[entry.characterId];
        expect(character, `${banner.id} oferece ${entry.characterId}, que não existe`).toBeDefined();
        expect(entry.fragmentMaterialId).toBe(character?.fragmentMaterialId);
      }
    }
  });

  it('TODO adquirível está em algum pool — senão ele é inalcançável em silêncio', () => {
    const noPool = new Set(banners.flatMap((banner) => banner.pool.map((entry) => entry.characterId)));

    for (const character of adquiriveis) {
      expect(noPool.has(character.id), `${character.id} é 'summon' e não está em banner nenhum`).toBe(true);
    }
  });
});

describe('os números do summon (D17/D18)', () => {
  it('o pity do banner e o padrão do jogo não divergem', () => {
    // Enquanto houver um banner só, os dois têm de bater. Divergirem em silêncio faria a
    // tela mostrar um número e a rolagem usar outro.
    for (const banner of banners) {
      expect(banner.pityThreshold).toBe(catalog.premiumRules.summon.pityThreshold);
    }
  });

  it('o custo do summon e da energia extra são positivos e inteiros', () => {
    const { summon, energyPurchase } = catalog.premiumRules;

    expect(Number.isInteger(summon.premiumCost) && summon.premiumCost > 0).toBe(true);
    expect(Number.isInteger(energyPurchase.premiumCost) && energyPurchase.premiumCost > 0).toBe(true);
    expect(Number.isInteger(energyPurchase.energy) && energyPurchase.energy > 0).toBe(true);
  });

  it('a energia comprada não passa do teto de conta — comprar acima do teto seria queimar moeda', () => {
    expect(catalog.premiumRules.energyPurchase.energy).toBeLessThanOrEqual(catalog.economyRules.energy.max);
  });

  it('as chances declaradas somam exatamente 1000 por mil, sem sobra de arredondamento', () => {
    for (const banner of banners) {
      const total = banner.pool.reduce((sum, entry) => sum + rateOf(asBannerDef(banner), entry.characterId), 0);

      expect(total, `${banner.id}`).toBe(1000);
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

    expect(fim?.condition).toEqual({ kind: 'chaptersCleared', atLeast: catalog.encounters.length });
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
