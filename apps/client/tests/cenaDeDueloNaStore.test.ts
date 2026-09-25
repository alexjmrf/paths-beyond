import { beforeEach, describe, expect, it } from 'vitest';
import { parseSave } from '../src/logic/save.js';
import { saveProjection, useBattleStore } from '../src/store/battleStore.js';

// M26 2/N — quando a TELA de duelo abre, e quando ela não abre.
//
// A tela é a resposta a uma medida: os quadros gerados perdem a arma (D27), e §6.1 faz a arma
// decidir o alcance no duelo. Mas ela introduz três estados novos, e os três podem quebrar
// coisas que já funcionavam:
//
//   - §11 exige "modo resultado instantâneo (pula animações), essencial para farm". Se a cena
//     ignorasse isso, o farm de masmorra viraria vinte cenas seguidas;
//   - o interruptor próprio é o meio-termo entre assistir e não ver nada, e é o nível que o
//     farm usa;
//   - a cena precisa das unidades de ANTES do engajamento. `confirmEngage` commita o estado
//     novo no mesmo `set()`, e nele o perdedor já está morto.

const ATACANTE = {
  unitId: 'u-atacante',
  heroId: 'hero-jogador',
  side: 'player',
  hp: 900,
  unitType: 'infantry',
  weaponType: 'sword',
  pos: { x: 1, y: 1 },
  stats: { hp: 1000 },
  effects: [],
};

const DEFENSOR = {
  unitId: 'u-defensor',
  heroId: 'enemy-bandido',
  side: 'enemy',
  hp: 40,
  unitType: 'infantry',
  weaponType: 'axe',
  pos: { x: 2, y: 1 },
  stats: { hp: 560 },
  effects: [],
};

const DUEL_RESULT = {
  attackerId: ATACANTE.unitId,
  defenderId: DEFENSOR.unitId,
  trocas: [{ actions: [{ actorId: ATACANTE.unitId, targetId: DEFENSOR.unitId, damage: 120, heal: 0, reaction: null }] }],
  finalHpAttacker: 900,
  finalHpDefender: 0,
};

// O estado DEPOIS: o defensor morreu. É o que `confirmEngage` commita, e é por isso que a cena
// não pode se montar a partir dele.
const DEPOIS = {
  units: [ATACANTE, { ...DEFENSOR, hp: 0 }],
  outcome: 'ongoing',
};



const ANTES = { units: [ATACANTE, DEFENSOR], outcome: 'ongoing' };

describe('abrir a cena a partir do estado de ANTES do duelo', () => {
  beforeEach(() => {
    useBattleStore.setState({ instantResultMode: false, duelSceneEnabled: true, duelScene: null } as never);
  });

  it('monta a cena com os DOIS de pé', () => {
    // O estado DEPOIS já matou o defensor, e uma peça que não existe mais não tem como lutar na
    // tela — mesmo motivo que fez a animação de tabuleiro de M16 3/N guardar `stateBefore`.
    expect(useBattleStore.getState().abrirCenaDeDuelo(ANTES as never, DUEL_RESULT as never)).toBe(true);

    const cena = useBattleStore.getState().duelScene!;
    expect(cena.atacante.unitId).toBe(ATACANTE.unitId);
    expect(cena.defensor.unitId).toBe(DEFENSOR.unitId);
    expect(cena.defensor.hp).toBeGreaterThan(0);
  });

  it('a MESMA porta serve o duelo do jogador e o da IA', () => {
    // O duelo que o jogador confirmou e o que a IA jogou chegam por caminhos diferentes
    // (`duelPreview` e `aiTurnReport`), mas os dois viram cena aqui. Ligar a cena no
    // `confirmEngage` teria deixado a FASE INIMIGA sem tela — meia funcionalidade, e a
    // referência que o usuário deu (Fire Emblem, Unicorn Overlord) mostra as duas.
    const daIa = { ...DUEL_RESULT, attackerId: DEFENSOR.unitId, defenderId: ATACANTE.unitId };
    expect(useBattleStore.getState().abrirCenaDeDuelo(ANTES as never, daIa as never)).toBe(true);
    expect(useBattleStore.getState().duelScene!.atacante.unitId).toBe(DEFENSOR.unitId);
  });

  it('recusa quando uma das peças não está no estado de antes', () => {
    // Recusar é o que permite o chamador voltar para a animação de tabuleiro. Abrir uma cena
    // com uma peça faltando seria um duelo contado pela metade.
    const orfao = { ...DUEL_RESULT, defenderId: 'nao-existe' };
    expect(useBattleStore.getState().abrirCenaDeDuelo(ANTES as never, orfao as never)).toBe(false);
    expect(useBattleStore.getState().duelScene).toBeNull();
  });

  it('fechar a cena a limpa — é o que libera o resto da sequência no tabuleiro', () => {
    useBattleStore.getState().abrirCenaDeDuelo(ANTES as never, DUEL_RESULT as never);
    expect(useBattleStore.getState().duelScene).not.toBeNull();

    useBattleStore.getState().fecharCenaDeDuelo();
    expect(useBattleStore.getState().duelScene).toBeNull();
  });
});

describe('o duelo do JOGADOR chega no relato, e a cena continua sendo de quem anima (M36 4/N)', () => {
  beforeEach(() => {
    useBattleStore.setState({ instantResultMode: false, duelSceneEnabled: true, duelScene: null } as never);
  });

  it('o relato do turno carrega `meuDuelo` com o estado de ANTES, e nenhuma cena é aberta aqui', () => {
    // A decisão de virar cena mora num lugar só (o `MapCanvas`), porque é lá que o duelo do
    // jogador e o da IA já viravam a mesma lista desde M16 4/N.
    //
    // O que mudou em M36 4/N: o duelo do jogador não é mais DEDUZIDO da transição do preview
    // (que não existe), e sim declarado pelo servidor na resposta do comando. O `estadoAntes` é
    // o tabuleiro que o cliente tinha antes de aplicar a resposta — os dois de pé, como a cena
    // precisa.
    useBattleStore.setState({
      aiTurnReport: {
        state: DEPOIS,
        steps: [],
        meuDuelo: { estadoAntes: ANTES, duelResult: DUEL_RESULT },
      },
    } as never);

    const relato = useBattleStore.getState().aiTurnReport!;
    expect(relato.meuDuelo!.estadoAntes).toBe(ANTES);
    expect(relato.meuDuelo!.duelResult).toBe(DUEL_RESULT);
    expect(useBattleStore.getState().duelScene).toBeNull();
  });

  it('e o `estadoAntes` do relato monta a cena com os DOIS de pé', () => {
    useBattleStore.setState({
      aiTurnReport: { state: DEPOIS, steps: [], meuDuelo: { estadoAntes: ANTES, duelResult: DUEL_RESULT } },
    } as never);

    const relato = useBattleStore.getState().aiTurnReport!;
    expect(useBattleStore.getState().abrirCenaDeDuelo(relato.meuDuelo!.estadoAntes, relato.meuDuelo!.duelResult)).toBe(
      true,
    );
    const cena = useBattleStore.getState().duelScene!;
    expect(cena.atacante.hp).toBeGreaterThan(0);
    expect(cena.defensor.hp).toBeGreaterThan(0);
  });
});

describe('o interruptor sobrevive a recarregar a página', () => {
  it('a projeção do save leva a preferência', () => {
    const save = saveProjection({
      instantResultMode: false,
      duelSceneEnabled: false,
      colorblindMode: false,
      uiScale: 1,
      pvp: { token: '' },
      introducoesVistas: [],
      volumeEfeitos: 0.7,
      volumeMusica: 0.5,
      idiomaEscolhido: null,
    } as never);
    expect(save.duelSceneEnabled).toBe(false);
  });

  it('e volta do save', () => {
    const save = saveProjection({
      instantResultMode: false,
      duelSceneEnabled: false,
      colorblindMode: false,
      uiScale: 1,
      pvp: { token: '' },
      introducoesVistas: [],
      volumeEfeitos: 0.7,
      volumeMusica: 0.5,
      idiomaEscolhido: null,
    } as never);
    expect(parseSave(JSON.stringify(save))!.duelSceneEnabled).toBe(false);
  });

  it('um save GRAVADO ANTES da cena existir continua válido, e cai no padrão', () => {
    // O campo entrou depois. Um save sem ele não pode ser recusado — recusar seria apagar o
    // progresso de quem já jogava, que é o pior desfecho possível de uma preferência nova.
    const save = saveProjection({
      instantResultMode: false,
      duelSceneEnabled: true,
      colorblindMode: false,
      uiScale: 1,
      pvp: { token: '' },
      introducoesVistas: [],
      volumeEfeitos: 0.7,
      volumeMusica: 0.5,
      idiomaEscolhido: null,
    } as never);
    const { duelSceneEnabled: _, ...antigo } = save as Record<string, unknown>;
    const lido = parseSave(JSON.stringify(antigo));
    expect(lido).not.toBeNull();
    expect(lido!.duelSceneEnabled).toBeUndefined();
  });

  it('um valor de tipo errado no save é recusado, e não vira `true` por acidente', () => {
    const save = saveProjection({
      instantResultMode: false,
      duelSceneEnabled: true,
      colorblindMode: false,
      uiScale: 1,
      pvp: { token: '' },
      introducoesVistas: [],
      volumeEfeitos: 0.7,
      volumeMusica: 0.5,
      idiomaEscolhido: null,
    } as never);
    expect(parseSave(JSON.stringify({ ...save, duelSceneEnabled: 'sim' }))).toBeNull();
  });
});
