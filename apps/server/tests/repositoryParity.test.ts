import { loadCatalogFromDisk, toStartingHero } from '@paths-beyond/content';
import type { ItemInstance } from '@paths-beyond/core';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate.js';
import {
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryPartyPresetRepository,
  createMemoryRewardsRepository,
} from '../src/repository/memoryRepository.js';
import {
  createPostgresCharacterOwnershipRepository,
  createPostgresEconomyRepository,
  createPostgresHeroRepository,
  createPostgresPlayerRepository,
  createPostgresPartyPresetRepository,
  createPostgresRewardsRepository,
} from '../src/repository/postgresRepository.js';
import type {
  CharacterOwnershipRepository,
  PartyPresetRepository,
  EconomyActionRecord,
  EconomyRepository,
  HeroRepository,
  PlayerRepository,
  RewardsRepository,
} from '../src/repository/types.js';

// §9.4 (M19) — a MESMA bateria contra os dois backends de repositório.
//
// O projeto tem 125 arquivos de teste e **nenhum deles jamais tocou o Postgres**. Tudo é
// exercitado contra os repositórios de memória, que existem desde M7 para o teste não
// precisar de banco — e a consequência é que produção era o único caminho sem prova.
//
// O preço disso já estava cobrado e ninguém tinha visto: `economy_actions.kind` nasceu na
// migration 0008 com `CHECK IN ('enhance','awaken','imprint','equip')`, e a M18 3/N passou a
// escrever `'summon'` e `'energy'`. Em memória um `Map` aceita qualquer string; no Postgres a
// constraint recusa. **Todo summon e toda compra de energia falhariam em produção**, e a
// suíte inteira continuaria verde.
//
// Por isso este arquivo não testa "o Postgres funciona": ele roda as MESMAS asserções nos
// dois, e é a igualdade que é o resultado. Um teste só do Postgres não pegaria uma memória
// que divergiu; um teste só da memória é o que já existia.
//
// Sem `DATABASE_URL`, o bloco do Postgres é PULADO em vez de falhar: o laço de trabalho
// local não deve exigir banco. Quem garante que ele não fica pulado para sempre é o CI, que
// sobe um Postgres de verdade — sem isso, este arquivo seria uma promessa e não uma prova.

const DATABASE_URL = process.env.DATABASE_URL;

interface Backend {
  readonly players: PlayerRepository;
  readonly economy: EconomyRepository;
  readonly ownership: CharacterOwnershipRepository;
  readonly rewards: RewardsRepository;
  readonly heroes: HeroRepository;
  // M35 3/N — os presets de party (D42).
  readonly presets: PartyPresetRepository;
}

const catalog = loadCatalogFromDisk();

// Um item de verdade na forma que o inventário guarda (§7.2). Serializado e lido de volta
// como `jsonb` no Postgres, então ele existe para provar a ida e a volta inteira.
function item(id: string): ItemInstance {
  return {
    id,
    setId: 'set-teste',
    slot: 'weapon',
    rarity: 'rare',
    ilvl: 60,
    mainstat: { stat: 'atk', value: 40 },
    substats: [{ stat: 'chc', value: 25, rolls: 1 }],
    enhance: 0,
    reforged: false,
  };
}

const ACAO_KINDS: readonly EconomyActionRecord['kind'][] = [
  'enhance',
  'awaken',
  'imprint',
  'equip',
  // M18 3/N — os dois que a migration 0008 não previa.
  'summon',
  'energy',
];

// Cada execução usa ids próprios: rodar contra um Postgres que já tem dado (o do CI roda a
// suíte inteira) não pode depender de o banco estar vazio.
const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PLAYER = `parity-player-${sufixo}`;

function contrato(nome: string, criar: () => Promise<Backend> | Backend) {
  describe(`${nome}`, () => {
    let backend: Backend;

    beforeAll(async () => {
      backend = await criar();
      await backend.players.createPlayer({
        id: PLAYER,
        platformProvider: 'dev' as const,
        platformId: `parity-token-${sufixo}`,
        displayName: 'Paridade',
      });
      // O segundo jogador existe para o teste de isolamento de inventário. No Postgres ele
      // não é opcional: `player_items.owner_player_id` tem chave estrangeira, e escrever
      // para um jogador inexistente falharia por integridade em vez de pelo que se mede.
      await backend.players.createPlayer({
        id: `${PLAYER}-outro`,
        platformProvider: 'dev' as const,
        platformId: `parity-token-outro-${sufixo}`,
        displayName: 'Paridade (outro)',
      });
    });

    describe('materiais', () => {
      it('grava e lê de volta', async () => {
        await backend.economy.setMaterials(PLAYER, { 'material-a': 3, 'material-b': 1 });

        expect(await backend.economy.getMaterials(PLAYER)).toEqual({ 'material-a': 3, 'material-b': 1 });
      });

      it('gravar de novo SUBSTITUI: o que sumiu do objeto some da conta', async () => {
        await backend.economy.setMaterials(PLAYER, { 'material-a': 3, 'material-b': 1 });
        await backend.economy.setMaterials(PLAYER, { 'material-a': 1 });

        expect(await backend.economy.getMaterials(PLAYER)).toEqual({ 'material-a': 1 });
      });

      it('conta sem material devolve objeto vazio, e não erro', async () => {
        expect(await backend.economy.getMaterials(`${PLAYER}-inexistente`)).toEqual({});
      });
    });

    describe('inventário', () => {
      it('acrescenta, lê um e lista', async () => {
        await backend.economy.addItems(PLAYER, [item(`item-x-${sufixo}`), item(`item-y-${sufixo}`)]);

        const um = await backend.economy.getItem(PLAYER, `item-x-${sufixo}`);
        expect(um?.id).toBe(`item-x-${sufixo}`);
        // A ida e volta pelo `jsonb` tem de devolver o item INTEIRO, não só o id.
        expect(um?.mainstat).toEqual({ stat: 'atk', value: 40 });

        const lista = (await backend.economy.listItems(PLAYER)).map((i) => i.id);
        expect(lista).toContain(`item-x-${sufixo}`);
        expect(lista).toContain(`item-y-${sufixo}`);
      });

      it('substituir troca o conteúdo e não duplica a linha', async () => {
        const id = `item-z-${sufixo}`;
        await backend.economy.addItems(PLAYER, [item(id)]);
        await backend.economy.replaceItem(PLAYER, { ...item(id), enhance: 3 });

        const lidos = (await backend.economy.listItems(PLAYER)).filter((i) => i.id === id);
        expect(lidos).toHaveLength(1);
        expect(lidos[0]?.enhance).toBe(3);
      });

      it('remover tira do inventário', async () => {
        const id = `item-w-${sufixo}`;
        await backend.economy.addItems(PLAYER, [item(id)]);
        await backend.economy.removeItem(PLAYER, id);

        expect(await backend.economy.getItem(PLAYER, id)).toBeNull();
      });

      it('item de outro jogador não aparece nem é buscável', async () => {
        const id = `item-alheio-${sufixo}`;
        await backend.economy.addItems(`${PLAYER}-outro`, [item(id)]);

        expect(await backend.economy.getItem(PLAYER, id)).toBeNull();
      });
    });

    describe('limpezas de masmorra', () => {
      it('marca e lista', async () => {
        await backend.economy.markCleared(PLAYER, 'dungeon-a');

        expect(await backend.economy.listClears(PLAYER)).toContain('dungeon-a');
      });

      it('marcar duas vezes não duplica nem explode', async () => {
        await backend.economy.markCleared(PLAYER, 'dungeon-b');
        await backend.economy.markCleared(PLAYER, 'dungeon-b');

        expect((await backend.economy.listClears(PLAYER)).filter((d) => d === 'dungeon-b')).toHaveLength(1);
      });
    });

    describe('trava de entrada', () => {
      it('ausente é null, e o que foi gravado volta igual', async () => {
        expect(await backend.economy.getEntryState(PLAYER, 'dungeon-sem-entrada')).toBeNull();

        await backend.economy.setEntryState(PLAYER, 'dungeon-c', { used: 2, asOfMs: 1_767_225_600_000 });

        // `asOfMs` é bigint no Postgres e o driver devolve string: se a conversão sumir, o
        // core recebe `NaN` e a trava de tempo passa a liberar entrada para sempre.
        const lido = await backend.economy.getEntryState(PLAYER, 'dungeon-c');
        expect(lido).toEqual({ used: 2, asOfMs: 1_767_225_600_000 });
        expect(typeof lido?.asOfMs).toBe('number');
      });

      it('gravar de novo sobrescreve', async () => {
        await backend.economy.setEntryState(PLAYER, 'dungeon-d', { used: 1, asOfMs: 10 });
        await backend.economy.setEntryState(PLAYER, 'dungeon-d', { used: 5, asOfMs: 20 });

        expect(await backend.economy.getEntryState(PLAYER, 'dungeon-d')).toEqual({ used: 5, asOfMs: 20 });
      });
    });

    describe('idempotência', () => {
      it('run ausente é null, e a gravada volta inteira', async () => {
        const nonce = `run-${sufixo}`;
        expect(await backend.economy.getRun(nonce)).toBeNull();

        await backend.economy.saveRun({
          nonce,
          playerId: PLAYER,
          dungeonId: 'dungeon-a',
          mode: 'manual',
          outcome: 'victory',
          createdAt: new Date(1_767_225_600_000).toISOString(),
        });

        const lida = await backend.economy.getRun(nonce);
        expect(lida).toMatchObject({ nonce, playerId: PLAYER, dungeonId: 'dungeon-a', mode: 'manual', outcome: 'victory' });
      });

      // O teste que este milestone existe para escrever. Os quatro primeiros kinds
      // passavam; `summon` e `energy` são de M18 3/N e a constraint de 0008 não os conhecia.
      it.each(ACAO_KINDS)('aceita a ação de kind %s', async (kind) => {
        const nonce = `acao-${kind}-${sufixo}`;

        await backend.economy.saveAction({
          nonce,
          playerId: PLAYER,
          kind,
          createdAt: new Date(1_767_225_600_000).toISOString(),
        });

        expect(await backend.economy.getAction(nonce)).toMatchObject({ nonce, kind });
      });

      it('ação ausente é null', async () => {
        expect(await backend.economy.getAction(`acao-que-nao-existe-${sufixo}`)).toBeNull();
      });
    });

    // §10/D14 (M18) — a posse e o pity moram no banco desde a 3/N e nunca foram lidos de um
    // Postgres em teste nenhum. É o estado que decide se o jogador tem o personagem.
    describe('posse de personagem e pity', () => {
      it('conceder aparece na lista, e conceder de novo não duplica', async () => {
        await backend.ownership.grant(PLAYER, 'ally-grifeiro');
        await backend.ownership.grant(PLAYER, 'ally-grifeiro');

        const adquiridos = await backend.ownership.listAcquired(PLAYER);
        expect(adquiridos.filter((id) => id === 'ally-grifeiro')).toHaveLength(1);
      });

      it('pity ausente é null; gravado, volta igual', async () => {
        expect(await backend.ownership.getPity(PLAYER, 'banner-sem-rolagem')).toBeNull();

        await backend.ownership.setPity(PLAYER, 'banner-elenco', 7);
        expect(await backend.ownership.getPity(PLAYER, 'banner-elenco')).toBe(7);

        await backend.ownership.setPity(PLAYER, 'banner-elenco', 0);
        expect(await backend.ownership.getPity(PLAYER, 'banner-elenco')).toBe(0);
      });
    });

    // §10/D17 — as duas fontes que devolvem "foi a primeira vez?". A resposta delas é o que
    // decide se a moeda premium é paga, então uma divergência aqui paga duas vezes ou
    // nenhuma.
    describe('prêmios e primeira completude', () => {
      it('a primeira reivindicação devolve true; a segunda, false', async () => {
        expect(await backend.rewards.claim(PLAYER, 'achievement-x')).toBe(true);
        expect(await backend.rewards.claim(PLAYER, 'achievement-x')).toBe(false);
        expect(await backend.rewards.listClaims(PLAYER)).toContain('achievement-x');
      });

      it('a primeira limpeza de capítulo devolve true; a segunda, false', async () => {
        expect(await backend.rewards.markChapterCleared(PLAYER, 'encounter-campanha-1')).toBe(true);
        expect(await backend.rewards.markChapterCleared(PLAYER, 'encounter-campanha-1')).toBe(false);
        expect(await backend.rewards.listClearedChapters(PLAYER)).toContain('encounter-campanha-1');
      });
    });

    describe('a carteira premium', () => {
      it('atualiza e volta lida', async () => {
        const atualizado = await backend.players.updatePremium(PLAYER, 1500);
        expect(atualizado.premium).toBe(1500);

        expect((await backend.players.getPlayerById(PLAYER))?.premium).toBe(1500);
      });
    });

    // M27 2/N — a ORDEM em que os heróis voltam, que é contrato desde esta fatia.
    //
    // O de memória sempre devolveu na ordem do pedido; o de Postgres consultava com
    // `hero_id = ANY($1)`, que não promete ordem nenhuma. `assembleChapterBattle` casa
    // `stored[index]` com `slots[index]` — então a divergência não aparece como erro, ela
    // aparece como o jogador mandando o espadachim para a vaga da frente e ele nascendo
    // atrás. E quem ocupa qual vaga decide a partida: medido nesta fatia, a mesma missão dá
    // 20/20 com hero-jogador+clérigo e 0/20 com arcanista+arqueiro.
    describe('heróis', () => {
      const IDS = [`${PLAYER}-h1`, `${PLAYER}-h2`, `${PLAYER}-h3`];

      it('grava três e devolve NA ORDEM PEDIDA, não na ordem de gravação', async () => {
        const personagens = Object.values(catalog.characters).slice(0, 3);
        for (const [i, id] of IDS.entries()) {
          await backend.heroes.createHero({
            ownerPlayerId: PLAYER,
            hero: toStartingHero(personagens[i]!, id),
            equippedItems: [],
          });
        }

        // Pedido ao contrário da inserção de propósito: é a única forma de a asserção
        // distinguir "respeitou o pedido" de "devolveu na ordem em que estava guardado".
        const pedido = [IDS[2]!, IDS[0]!, IDS[1]!];
        const lidos = await backend.heroes.getHeroesByIds(pedido);
        expect(lidos.map((h) => h.hero.id)).toEqual(pedido);
      });

      it('id desconhecido some da lista em vez de virar buraco', async () => {
        // É comparando os tamanhos que a rota detecta "herói desconhecido"; um `undefined`
        // no meio da lista viraria uma vaga sem herói lá na montagem da batalha.
        const lidos = await backend.heroes.getHeroesByIds([IDS[0]!, `${PLAYER}-nao-existe`, IDS[1]!]);
        expect(lidos.map((h) => h.hero.id)).toEqual([IDS[0]!, IDS[1]!]);
      });
    });

    // M35 3/N (D42) — os presets de party. Mesmo contrato nos dois backends: a lista volta
    // ordenada por slot (a tela desenha os oito na ordem), salvar de novo substitui, apagar
    // um slot não toca nos outros, e apagar a conta leva todos.
    describe('presets de party', () => {
      it('salva, lista em ordem de slot, e a ida e volta pelo jsonb devolve os ids inteiros', async () => {
        await backend.presets.savePreset({ ownerPlayerId: PLAYER, slot: 4, name: 'Serra', heroIds: [`${PLAYER}-h2`] });
        await backend.presets.savePreset({ ownerPlayerId: PLAYER, slot: 1, name: 'Estrada', heroIds: [`${PLAYER}-h1`, `${PLAYER}-h3`] });

        expect(await backend.presets.listPresetsByOwner(PLAYER)).toEqual([
          { ownerPlayerId: PLAYER, slot: 1, name: 'Estrada', heroIds: [`${PLAYER}-h1`, `${PLAYER}-h3`] },
          { ownerPlayerId: PLAYER, slot: 4, name: 'Serra', heroIds: [`${PLAYER}-h2`] },
        ]);
      });

      it('salvar de novo no mesmo slot substitui', async () => {
        await backend.presets.savePreset({ ownerPlayerId: PLAYER, slot: 4, name: 'Serra II', heroIds: [`${PLAYER}-h3`] });
        const lidos = await backend.presets.listPresetsByOwner(PLAYER);
        expect(lidos.find((p) => p.slot === 4)).toEqual({ ownerPlayerId: PLAYER, slot: 4, name: 'Serra II', heroIds: [`${PLAYER}-h3`] });
        expect(lidos).toHaveLength(2);
      });

      it('apagar um slot: true; apagar de novo: false; o outro slot fica', async () => {
        expect(await backend.presets.deletePreset(PLAYER, 4)).toBe(true);
        expect(await backend.presets.deletePreset(PLAYER, 4)).toBe(false);
        expect((await backend.presets.listPresetsByOwner(PLAYER)).map((p) => p.slot)).toEqual([1]);
      });

      it('outra conta não vê nada, e apagar a conta leva tudo', async () => {
        expect(await backend.presets.listPresetsByOwner(`${PLAYER}-outro`)).toEqual([]);
        await backend.presets.deletePlayerData(PLAYER);
        expect(await backend.presets.listPresetsByOwner(PLAYER)).toEqual([]);
      });
    });
  });
}

contrato('memória', () => ({
  players: createMemoryPlayerRepository(),
  economy: createMemoryEconomyRepository(),
  ownership: createMemoryCharacterOwnershipRepository(),
  rewards: createMemoryRewardsRepository(),
  heroes: createMemoryHeroRepository(),
  presets: createMemoryPartyPresetRepository(),
}));

// Sem `DATABASE_URL` o bloco inteiro é pulado. O CI define a variável e sobe o serviço, e é
// lá que a paridade deixa de ser opcional.
const descrevePostgres = DATABASE_URL ? describe : describe.skip;

descrevePostgres('postgres', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await runMigrations(pool);
  });

  afterAll(async () => {
    // Limpa o que este arquivo criou. A ordem respeita as chaves estrangeiras: tudo que
    // referencia `players` sai antes do jogador.
    if (!pool) return;
    for (const [tabela, coluna] of [
      ['player_materials', 'player_id'],
      ['player_items', 'owner_player_id'],
      ['dungeon_clears', 'player_id'],
      ['dungeon_entries', 'player_id'],
      ['dungeon_runs', 'player_id'],
      ['economy_actions', 'player_id'],
      ['player_characters', 'player_id'],
      ['banner_pity', 'player_id'],
      ['player_claims', 'player_id'],
      ['campaign_clears', 'player_id'],
      // M27 2/N — a bateria passou a criar heróis; sem esta linha eles ficariam no banco do
      // CI e a próxima execução colidiria na chave primária.
      ['heroes', 'owner_player_id'],
      ['party_presets', 'owner_player_id'],
    ] as const) {
      await pool.query(`DELETE FROM ${tabela} WHERE ${coluna} LIKE $1`, [`${PLAYER}%`]).catch(() => undefined);
    }
    await pool.query('DELETE FROM players WHERE id LIKE $1', [`${PLAYER}%`]).catch(() => undefined);
    await pool.end();
  });

  contrato('postgres', () => ({
    players: createPostgresPlayerRepository(pool),
    economy: createPostgresEconomyRepository(pool),
    ownership: createPostgresCharacterOwnershipRepository(pool),
    rewards: createPostgresRewardsRepository(pool),
    heroes: createPostgresHeroRepository(pool),
    presets: createPostgresPartyPresetRepository(pool),
  }));
});
