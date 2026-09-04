import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import characterSchema from '../schemas/characters.schema.js';
import characterTalentTreeSchema from '../schemas/character-talent-trees.schema.js';

// M17, sub-sessão 2/N — o ELENCO e as nove árvores de duas colunas (§8.1/§8.2).
//
// Mesmo papel de `authorContent.ts`: ferramenta de autoria, não parte do motor. Roda uma
// vez, o JSON emitido é o conteúdo canônico versionado, e o schema valida cada arquivo
// antes de ele tocar o disco.
//
// Por que um gerador e não nove arquivos escritos à mão: a árvore de §8.2 é uma GRADE —
// toda linha tem coluna A e coluna B, o meio é ocasional, e a linha é a unidade de
// decisão. Escrever isso como uma lista plana de nós com `row` repetido em cada um
// esconde justamente a estrutura que dá forma à build, e um `row` digitado errado vira
// uma linha com dois nós na mesma coluna que só `validateColumnTree` pegaria depois.
// Aqui a árvore é declarada linha a linha, e a linha é o que se lê.

// ---------------------------------------------------------------------------
// Vocabulário de efeitos
//
// `TalentEffect` não mudou no M17 (§8.2 é explícita: "a lista abaixo continua valendo
// integralmente"). Estes atalhos existem só para a declaração das árvores caber na tela.
// ---------------------------------------------------------------------------

type StatKey = 'hp' | 'atk' | 'def' | 'spd' | 'chc' | 'chd' | 'eff' | 'efr' | 'pen' | 'heal' | 'lifesteal' | 'focus' | 'vigor';

type TalentEffect =
  | { readonly t: 'stat'; readonly stat: StatKey; readonly flat?: number; readonly pct?: number }
  | { readonly t: 'grantSkill'; readonly skillId: string }
  | { readonly t: 'grantReaction'; readonly reactionId: string }
  | { readonly t: 'modifySkill'; readonly skillId: string; readonly patch: Record<string, unknown> }
  | { readonly t: 'extraTacticsSlot' }
  | { readonly t: 'extraTacticsCondition' }
  | { readonly t: 'maxAp'; readonly n: number }
  | { readonly t: 'maxPp'; readonly n: number }
  | { readonly t: 'apRefund'; readonly on: 'kill' | 'duelWon' | 'assist'; readonly n: number }
  | { readonly t: 'duelApCap'; readonly n: number }
  | { readonly t: 'assistRangeBonus'; readonly n: number }
  | { readonly t: 'passive'; readonly passiveId: string };

const pct = (stat: StatKey, n: number): TalentEffect => ({ t: 'stat', stat, pct: n });
const flat = (stat: StatKey, n: number): TalentEffect => ({ t: 'stat', stat, flat: n });
const maxAp = (n: number): TalentEffect => ({ t: 'maxAp', n });
const maxPp = (n: number): TalentEffect => ({ t: 'maxPp', n });
const refund = (on: 'kill' | 'duelWon' | 'assist', n = 1): TalentEffect => ({ t: 'apRefund', on, n });
const duelApCap = (n: number): TalentEffect => ({ t: 'duelApCap', n });
const assistRange = (n: number): TalentEffect => ({ t: 'assistRangeBonus', n });
const grantReaction = (reactionId: string): TalentEffect => ({ t: 'grantReaction', reactionId });
const grantSkill = (skillId: string): TalentEffect => ({ t: 'grantSkill', skillId });
const passive = (passiveId: string): TalentEffect => ({ t: 'passive', passiveId });
const tacticsSlot = (): TalentEffect => ({ t: 'extraTacticsSlot' });
const tacticsCondition = (): TalentEffect => ({ t: 'extraTacticsCondition' });

// Dois patches recorrentes, porque são as duas maneiras de mexer numa skill sem inventar
// número novo: subir o multiplicador dela, ou pendurar um efeito de §6.9 nela.
const harder = (skillId: string, multiplier: number): TalentEffect => ({ t: 'modifySkill', skillId, patch: { multiplier } });
const applies = (skillId: string, effectId: string, chance: number, target: 'self' | 'target' = 'target'): TalentEffect => ({
  t: 'modifySkill',
  skillId,
  // `duration: 'duel'` segue o precedente de M12: o efeito vale a troca seguinte do
  // mesmo duelo e não vaza para o mapa.
  patch: { effects: [{ effectId, target, chance, duration: 'duel' }] },
});

// §6.4 — "Contra-atacar custa 0 PP, mas o herói perde 1 AP máximo" é o exemplo que a
// própria §8.2 dá de nó que muda o papel do herói. Aparece em três árvores porque é uma
// troca de economia genérica, não um traço de classe.
const contraSimples = (): readonly TalentEffect[] => [{ t: 'modifySkill', skillId: 'skill-contra-atacar', patch: { ppCost: 0 } }, maxAp(-1)];

// ---------------------------------------------------------------------------
// A grade
// ---------------------------------------------------------------------------

interface NodeSpec {
  readonly slug: string;
  readonly maxRank?: 1 | 2 | 3;
  readonly minAwakening?: number;
  readonly effects: readonly TalentEffect[];
}

interface RowSpec {
  readonly a: NodeSpec;
  readonly b: NodeSpec;
  // §8.2 — "Uma coluna do meio ocasional: existe só em algumas linhas."
  readonly m?: NodeSpec;
}

interface CharacterSpec {
  readonly id: string; // o id que o conteúdo de campanha já usa — não muda
  readonly name: string;
  readonly slug: string; // usado nos ids de talento
  readonly classId: string;
  // D14 (M18) — como o personagem entra no jogo. O corte foi LIDO da campanha como ela já
  // estava autorada: Aren no capítulo 1, Miron no 2, Sylla no 3 e Vesper no 4 são o núcleo
  // garantido; Wren (só no 5), Bardan (só no 6) e os três que não aparecem em capítulo
  // nenhum são adquiríveis.
  readonly acquisition: 'story' | 'summon';
  // §10/D14 (M18, 6/N) — os três campos que a FICHA INICIAL não consegue derivar do slug.
  // O resto dela (arma, skills de duelo, tática) segue a convenção de id da classe, e
  // derivar aqui é legítimo pelo mesmo motivo que `fragmentMaterialId`: o gerador é quem
  // autora. O que NÃO se deriva é a arma empunhada (a classe permite uma lista), o colar
  // com que a party existe no conteúdo autorado, e a skill fora do par ataque/especial.
  readonly weaponType: 'sword' | 'axe' | 'spear' | 'bow' | 'arcane' | 'nature' | 'holy';
  readonly necklace: string;
  readonly extraDuelSkills?: readonly string[];
  readonly rows: readonly RowSpec[];
}

// §10 — "Awakening (0–6): ... libera nós avançados de talento a partir de 5."
//
// O gate mora SEMPRE na convergência mais funda, e nunca numa coluna principal. A razão
// é estrutural e não temática: um nó gated numa coluna principal seria um buraco no chão
// — quem descesse por ali com awakening baixo travaria o caminho e ficaria com pontos
// sem onde gastar, contrariando §8.2 ("a árvore precisa ter onde absorver os 9 pontos").
// No meio, o despertar tira uma PORTA de quem ainda não o tem, nunca o chão; e a
// convergência mais rasa fica sempre aberta, para que trocar de lado exista desde o
// nível 1.
const AWAKENING_AVANCADO = 5;

// §8.2 — "Orçamento de pontos: FIXO em 9, igual para todo personagem."
//
// Duplicado do core (`TALENT_POINT_BUDGET`, packages/core/src/talents/columnTree.ts) e
// não importado: `packages/data` não depende de `@paths-beyond/core`, e é o mesmo
// precedente do enum de stats em `schemas/shared.ts`. O valor é normativo na spec, não um
// detalhe de implementação do motor, e `packages/content` valida os dois lados juntos.
const TALENT_POINT_BUDGET = 9;

// §10/D16 (M18, 6/N) — o nível com que o jogador RECEBE um personagem, seja o núcleo numa
// conta nova ou um invocado no banner.
//
// Não é um número novo e não foi escolhido: é LIDO do conteúdo como ele já está autorado.
// Os seis capítulos declaram as vagas do jogador em nível 10 e foi contra isso que a
// campanha foi afinada (M12) e reafinada (M18 5/N, com o piloto vencendo os seis só com o
// núcleo). Entregar o personagem em qualquer outro nível faria a prova da 5/N valer para
// um time que só existe no arquivo de conteúdo — `packages/content` trava as duas pontas.
const STARTING_LEVEL = 10;

// ---------------------------------------------------------------------------
// O elenco (D6/D7/D8 — fechado, nove, e `ally-mensageira`/`ally-couracado` incluídos)
//
// Os ids são os que o conteúdo de campanha já usa (`hero-jogador`, `ally-clerigo`, ...):
// renomeá-los seria reautorar seis encounters para ganhar nada. O que é novo é o `name`
// — com o elenco virando o que o jogador possui (D6), "Clérigo" deixa de ser nome de
// alguém e passa a ser só a classe dele.
//
// A PROFUNDIDADE varia de propósito, de 5 a 9, e é a decisão de desenho mais visível de
// cada árvore (D9): o orçamento é 9 para todos, então nove linhas gastam tudo descendo e
// cinco linhas sobram quatro pontos para aprofundar ranks no caminho. Mesmo poder total,
// formas opostas.
// ---------------------------------------------------------------------------

const ELENCO: readonly CharacterSpec[] = [
  // -------------------------------------------------------------------------
  // Aren — Espadachim — 9 linhas. A árvore mais funda do elenco: gasta os 9 pontos
  // descendo, um por linha, e não sobra nada para rank. É o extremo "alcance" de D9.
  // A = o duelista que resolve sozinho; B = a âncora que segura a linha e cobre aliado.
  // -------------------------------------------------------------------------
  {
    id: 'hero-jogador',
    name: 'Aren',
    slug: 'aren',
    classId: 'class-espadachim',
    acquisition: 'story',
    weaponType: 'sword',
    necklace: 'item-colar-forca',
    rows: [
      {
        a: { slug: 'fio-agressivo', effects: [pct('atk', 50), pct('def', -30)] },
        b: { slug: 'postura-firme', effects: [pct('def', 50), pct('atk', -30)] },
      },
      {
        a: { slug: 'corte-profundo', effects: [harder('skill-especial-espadachim', 1300)] },
        b: { slug: 'folego-do-escudo', effects: [maxPp(1)] },
      },
      {
        a: { slug: 'sede-de-vitoria', effects: [refund('duelWon')] },
        b: { slug: 'mao-estendida', effects: [grantReaction('skill-assistir')] },
        m: { slug: 'passo-lateral', effects: [flat('spd', 4), tacticsCondition()] },
      },
      {
        a: { slug: 'punho-de-ferro', maxRank: 2, effects: [pct('atk', 20)] },
        b: { slug: 'couro-batido', maxRank: 2, effects: [pct('hp', 12)] },
      },
      {
        a: { slug: 'golpe-fragilizante', effects: [applies('skill-especial-espadachim', 'effect-fragilidade', 500)] },
        b: { slug: 'contra-simples', effects: contraSimples() },
      },
      {
        a: { slug: 'duelo-prolongado', effects: [duelApCap(1)] },
        b: { slug: 'alcance-de-apoio', effects: [assistRange(1)] },
        m: { slug: 'leitura-do-campo', minAwakening: AWAKENING_AVANCADO, effects: [tacticsSlot()] },
      },
      {
        a: { slug: 'abertura', effects: [harder('skill-ataque-espadachim', 1150)] },
        b: { slug: 'vigilia', effects: [maxPp(1)] },
      },
      {
        a: { slug: 'cacada', effects: [refund('kill')] },
        b: { slug: 'troca-limpa', effects: [refund('assist')] },
      },
      {
        a: { slug: 'maestria-da-lamina', effects: [passive('passive-espadachim-maestria')] },
        b: { slug: 'comando-de-flanco', effects: [tacticsSlot(), maxAp(1)] },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Miron — Clérigo — 7 linhas. A = a luz que sustenta a party; B = o cruzado que troca
  // cura por dano. `skill-cura-clerigo` (M12) ganha um talento que a melhora, que é o
  // consumidor que ela não tinha.
  // -------------------------------------------------------------------------
  {
    id: 'ally-clerigo',
    name: 'Miron',
    slug: 'miron',
    classId: 'class-clerigo',
    acquisition: 'story',
    weaponType: 'holy',
    necklace: 'item-colar-guardiao',
    extraDuelSkills: ['skill-cura-clerigo'],
    rows: [
      {
        a: { slug: 'imposicao-de-maos', effects: [harder('skill-cura-clerigo', 1200), pct('atk', 45)] },
        b: { slug: 'luz-punitiva', maxRank: 2, effects: [pct('atk', 40), pct('heal', -20)] },
      },
      {
        a: { slug: 'oracao-constante', maxRank: 2, effects: [maxPp(1), flat('atk', 3)] },
        b: { slug: 'zelo', effects: [refund('duelWon')] },
      },
      {
        a: { slug: 'mao-que-alcanca', effects: [grantReaction('skill-assistir')] },
        b: { slug: 'golpe-consagrado', effects: [harder('skill-especial-clerigo', 1250)] },
        m: { slug: 'passo-de-fe', effects: [flat('spd', 3), tacticsCondition()] },
      },
      {
        a: { slug: 'calor-do-santuario', maxRank: 2, effects: [pct('heal', 30), refund('assist'), pct('atk', 30)] },
        b: { slug: 'fervor', maxRank: 2, effects: [pct('atk', 20)] },
      },
      {
        a: { slug: 'refugio', effects: [assistRange(1)] },
        b: { slug: 'punho-da-fe', effects: [duelApCap(1)] },
        m: { slug: 'chamado', minAwakening: AWAKENING_AVANCADO, effects: [maxAp(1)] },
      },
      {
        a: { slug: 'vigilia-branca', maxRank: 2, effects: [pct('def', 20), flat('efr', 30), harder('skill-ataque-clerigo', 1200)] },
        b: { slug: 'martelo-leve', effects: [harder('skill-ataque-clerigo', 1150)] },
      },
      {
        a: { slug: 'maestria-da-luz', effects: [passive('passive-clerigo-maestria')] },
        b: { slug: 'cruzada', effects: [tacticsSlot(), refund('kill')] },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sylla — Arqueiro — 8 linhas. A = a caçadora que fecha o duelo à distância; B = a
  // batedora que cobre a party. `skill-folego-de-combate` (a reação própria do Arqueiro,
  // M12) continua vindo de talento, como vinha na árvore antiga.
  // -------------------------------------------------------------------------
  {
    id: 'ally-arqueiro',
    name: 'Sylla',
    slug: 'sylla',
    classId: 'class-arqueiro',
    acquisition: 'story',
    weaponType: 'bow',
    necklace: 'item-colar-forca',
    rows: [
      {
        a: { slug: 'olho-de-agulha', effects: [pct('atk', 45), pct('def', -25)] },
        b: { slug: 'pes-leves', effects: [flat('spd', 6)] },
      },
      {
        a: { slug: 'marca-persistente', effects: [harder('skill-especial-arqueiro', 1250)] },
        b: { slug: 'folego-de-combate', effects: [grantReaction('skill-folego-de-combate')] },
      },
      {
        a: { slug: 'tiro-certeiro', maxRank: 2, effects: [flat('chc', 60)] },
        b: { slug: 'alcance-de-apoio', effects: [assistRange(1)] },
        m: { slug: 'posicao-elevada', effects: [flat('spd', 3), tacticsCondition()] },
      },
      {
        a: { slug: 'sangue-frio', effects: [duelApCap(1)] },
        b: { slug: 'mao-estendida', effects: [grantReaction('skill-assistir')] },
      },
      {
        a: { slug: 'flecha-pesada', effects: [harder('skill-ataque-arqueiro', 1150)] },
        b: { slug: 'respiro', maxRank: 2, effects: [maxPp(1)] },
      },
      {
        a: { slug: 'cacada-continua', effects: [refund('kill')] },
        b: { slug: 'retirada-calculada', effects: [pct('def', 25), flat('spd', 3), flat('atk', 6)] },
        m: { slug: 'troca-de-guarda', minAwakening: AWAKENING_AVANCADO, effects: [maxAp(1)] },
      },
      {
        a: { slug: 'precisao-letal', maxRank: 2, effects: [flat('chd', 120)] },
        b: { slug: 'apoio-constante', effects: [refund('assist')] },
      },
      {
        a: { slug: 'maestria-do-arco', effects: [passive('passive-arqueiro-maestria')] },
        b: { slug: 'comando-de-batedores', effects: [tacticsSlot(), maxPp(1)] },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Vesper — Arcanista — 6 linhas. A = a piromante que empilha dano e queimadura; B = a
  // tecelã que compra economia e alcance de assistência.
  // -------------------------------------------------------------------------
  {
    id: 'ally-arcanista',
    name: 'Vesper',
    slug: 'vesper',
    classId: 'class-arcanista',
    acquisition: 'story',
    weaponType: 'arcane',
    necklace: 'item-colar-forca',
    rows: [
      {
        a: { slug: 'chama-crescente', maxRank: 2, effects: [pct('atk', 50), pct('def', -30)] },
        b: { slug: 'manto-arcano', maxRank: 2, effects: [pct('def', 40), flat('efr', 40), flat('atk', 5)] },
      },
      {
        a: { slug: 'combustao', effects: [harder('skill-especial-arcanista', 1250), refund('kill')] },
        b: { slug: 'reserva-de-mana', maxRank: 2, effects: [maxPp(1), pct('atk', 25)] },
      },
      {
        a: { slug: 'foco-abrasador', maxRank: 2, effects: [flat('eff', 60)] },
        b: { slug: 'mao-estendida', effects: [grantReaction('skill-assistir')] },
        m: { slug: 'passo-etereo', effects: [flat('spd', 4), tacticsCondition()] },
      },
      {
        a: { slug: 'queima-persistente', effects: [applies('skill-especial-arcanista', 'effect-queimadura', 850), duelApCap(1)] },
        b: { slug: 'circulo-de-apoio', maxRank: 2, effects: [assistRange(1), harder('skill-ataque-arcanista', 1350)] },
      },
      {
        a: { slug: 'poder-bruto', maxRank: 2, effects: [flat('atk', 45)] },
        b: { slug: 'condutor', effects: [refund('assist')] },
        m: { slug: 'convergencia-arcana', minAwakening: AWAKENING_AVANCADO, effects: [maxAp(1)] },
      },
      {
        a: { slug: 'maestria-arcana', effects: [passive('passive-arcanista-maestria')] },
        b: { slug: 'tecer-o-campo', effects: [tacticsSlot(), duelApCap(1)] },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Wren — Druida — 5 linhas. O outro extremo de D9: a árvore mais rasa do elenco, que
  // gasta 5 pontos descendo e tem 4 para aprofundar rank no caminho. Por isso ela é a
  // única com nós de `maxRank: 3` — sem eles não haveria onde absorver os 9.
  // A = a guardiã que regenera e cobre; B = a fúria que fecha o duelo em uma troca.
  // -------------------------------------------------------------------------
  {
    id: 'ally-mensageira',
    name: 'Wren',
    slug: 'wren',
    classId: 'class-druida',
    acquisition: 'summon',
    weaponType: 'nature',
    necklace: 'item-colar-guardiao',
    rows: [
      {
        a: { slug: 'raizes-profundas', maxRank: 3, effects: [pct('hp', 40), flat('atk', 3), flat('spd', -1)] },
        b: { slug: 'presas', maxRank: 3, effects: [pct('atk', 45), pct('def', -25)] },
      },
      {
        a: { slug: 'seiva', maxRank: 2, effects: [harder('skill-especial-druida', 1400), maxPp(1)] },
        b: { slug: 'instinto', maxRank: 2, effects: [refund('kill')] },
        m: { slug: 'vento-do-bosque', effects: [flat('spd', 4), tacticsCondition()] },
      },
      {
        a: { slug: 'mao-estendida', effects: [grantReaction('skill-assistir')] },
        b: { slug: 'investida', effects: [duelApCap(1)] },
      },
      {
        a: { slug: 'abrigo', maxRank: 2, effects: [assistRange(1), refund('assist'), pct('atk', 20)] },
        b: { slug: 'fereza', maxRank: 2, effects: [harder('skill-ataque-druida', 1200)] },
        m: { slug: 'metamorfose', minAwakening: AWAKENING_AVANCADO, effects: [maxAp(1)] },
      },
      {
        a: { slug: 'maestria-do-bosque', effects: [passive('passive-druida-maestria')] },
        b: { slug: 'alcateia', effects: [tacticsSlot(), refund('assist')] },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Bardan — Couraçado — 9 linhas, o segundo extremo "alcance". A = a muralha que segura
  // o portão e cobre aliado; B = o aríete que quebra armadura. `skill-ultimo-suspiro`
  // (o gatilho de morte de M10) vira nó de talento em vez de vir de graça.
  // -------------------------------------------------------------------------
  {
    id: 'ally-couracado',
    name: 'Bardan',
    slug: 'bardan',
    classId: 'class-couracado',
    acquisition: 'summon',
    weaponType: 'axe',
    necklace: 'item-colar-forca',
    extraDuelSkills: ['skill-ultimo-suspiro'],
    rows: [
      {
        a: { slug: 'aco-pesado', effects: [pct('def', 50), flat('spd', -5)] },
        b: { slug: 'machado-largo', effects: [pct('atk', 45), pct('def', -25)] },
      },
      {
        a: { slug: 'respiro-sob-o-elmo', effects: [maxPp(1)] },
        b: { slug: 'impacto', effects: [harder('skill-ataque-couracado', 1200)] },
      },
      {
        a: { slug: 'mao-estendida', effects: [grantReaction('skill-assistir')] },
        b: { slug: 'sede-de-ruina', effects: [refund('kill')] },
      },
      {
        a: { slug: 'guarda-firmada', effects: [harder('skill-especial-couracado', 1150)] },
        b: { slug: 'golpe-arrasador', effects: [applies('skill-especial-couracado', 'effect-quebra-armadura', 600)] },
        m: { slug: 'giro-de-machado', effects: [flat('spd', 3), tacticsCondition()] },
      },
      {
        a: { slug: 'couraca-viva', maxRank: 2, effects: [pct('hp', 15), flat('atk', 3), refund('duelWon')] },
        b: { slug: 'forca-bruta', maxRank: 2, effects: [pct('atk', 20)] },
      },
      {
        a: { slug: 'alcance-de-apoio', effects: [assistRange(1)] },
        b: { slug: 'investida-pesada', effects: [duelApCap(1)] },
      },
      {
        a: { slug: 'contra-simples', effects: contraSimples() },
        b: { slug: 'ultimo-suspiro', effects: [grantSkill('skill-ultimo-suspiro')] },
        m: { slug: 'postura-trocada', minAwakening: AWAKENING_AVANCADO, effects: [maxAp(1)] },
      },
      {
        a: { slug: 'resistencia', effects: [flat('efr', 50), maxPp(1)] },
        b: { slug: 'penetracao', effects: [flat('pen', 60)] },
      },
      {
        a: { slug: 'maestria-da-muralha', effects: [passive('passive-couracado-maestria')] },
        b: { slug: 'comando-de-cerco', effects: [tacticsSlot(), refund('duelWon')] },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Kaia — Grifeira — 6 linhas. PERSONAGEM NOVO (D7): a classe `grifeiro` tinha skills,
  // item e árvore autorados e ninguém para jogá-la.
  // A = a lança que mergulha e mata; B = a vigia que usa o alcance do voo para cobrir.
  // -------------------------------------------------------------------------
  {
    id: 'ally-grifeiro',
    name: 'Kaia',
    slug: 'kaia',
    classId: 'class-grifeiro',
    acquisition: 'summon',
    weaponType: 'spear',
    necklace: 'item-colar-forca',
    rows: [
      {
        a: { slug: 'mergulho', maxRank: 2, effects: [pct('atk', 45), pct('def', -25)] },
        b: { slug: 'voo-baixo', maxRank: 2, effects: [flat('spd', 6), pct('atk', -5)] },
      },
      {
        a: { slug: 'impeto-prolongado', effects: [harder('skill-especial-grifeiro', 1250)] },
        b: { slug: 'folego-das-asas', maxRank: 2, effects: [maxPp(1)] },
      },
      {
        a: { slug: 'garras', effects: [harder('skill-ataque-grifeiro', 1150), refund('kill')] },
        b: { slug: 'mao-estendida', effects: [grantReaction('skill-assistir')] },
        m: { slug: 'corrente-ascendente', effects: [flat('spd', 4), tacticsCondition()] },
      },
      {
        a: { slug: 'precisao-do-alto', maxRank: 2, effects: [flat('chc', 50), flat('chd', 80)] },
        b: { slug: 'sombra-protetora', maxRank: 2, effects: [assistRange(1)] },
      },
      {
        a: { slug: 'picada-continua', maxRank: 2, effects: [duelApCap(1)] },
        b: { slug: 'rota-de-fuga', maxRank: 2, effects: [pct('def', 25), flat('spd', 3), pct('atk', 20)] },
        m: { slug: 'rasante', minAwakening: AWAKENING_AVANCADO, effects: [maxAp(1)] },
      },
      {
        a: { slug: 'maestria-do-grifo', effects: [passive('passive-grifeiro-maestria')] },
        b: { slug: 'comando-aereo', effects: [tacticsSlot(), refund('assist')] },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Rurik — Guerreiro — 7 linhas. PERSONAGEM NOVO (D7).
  // A = o berserker que troca defesa por dano; B = o capitão, e é o único lugar do
  // elenco onde `effect-brado-de-guerra` tem consumidor.
  // -------------------------------------------------------------------------
  {
    id: 'ally-guerreiro',
    name: 'Rurik',
    slug: 'rurik',
    classId: 'class-guerreiro',
    acquisition: 'summon',
    weaponType: 'axe',
    necklace: 'item-colar-forca',
    rows: [
      {
        a: { slug: 'furia', maxRank: 2, effects: [pct('atk', 50), pct('def', -30)] },
        b: { slug: 'estandarte', maxRank: 2, effects: [pct('def', 10), flat('atk', -2)] },
      },
      {
        a: { slug: 'machado-cruel', effects: [harder('skill-especial-guerreiro', 1250)] },
        b: { slug: 'brado', effects: [applies('skill-especial-guerreiro', 'effect-brado-de-guerra', 1000, 'self')] },
        m: { slug: 'pisada-firme', effects: [flat('spd', 3), tacticsCondition()] },
      },
      {
        a: { slug: 'sangue-por-sangue', effects: [refund('kill')] },
        b: { slug: 'mao-estendida', effects: [grantReaction('skill-assistir')] },
      },
      {
        a: { slug: 'golpe-partido', maxRank: 2, effects: [harder('skill-ataque-guerreiro', 1200)] },
        b: { slug: 'folego-de-comando', maxRank: 2, effects: [maxPp(1)] },
      },
      {
        a: { slug: 'sem-recuo', effects: [duelApCap(1)] },
        b: { slug: 'alcance-de-apoio', effects: [assistRange(1)] },
      },
      {
        a: { slug: 'pele-de-couro', effects: [pct('hp', 20), flat('pen', 40)] },
        b: { slug: 'ordem-clara', effects: [pct('hp', 20)] },
        m: { slug: 'troca-de-linha', minAwakening: AWAKENING_AVANCADO, effects: [maxAp(1)] },
      },
      {
        a: { slug: 'maestria-do-machado', effects: [passive('passive-guerreiro-maestria')] },
        b: { slug: 'comando-de-vanguarda', effects: [tacticsSlot(), refund('duelWon')] },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Nyra — Lanceira — 8 linhas. PERSONAGEM NOVO (D7).
  // A = a ponta que desarma e pressiona; B = o muro de lanças, que troca iniciativa por
  // cobertura de aliado.
  // -------------------------------------------------------------------------
  {
    id: 'ally-lanceiro',
    name: 'Nyra',
    slug: 'nyra',
    classId: 'class-lanceiro',
    acquisition: 'summon',
    weaponType: 'spear',
    necklace: 'item-colar-forca',
    rows: [
      {
        a: { slug: 'estocada', effects: [pct('atk', 45), pct('def', -25)] },
        b: { slug: 'pe-firme', effects: [pct('def', 10), flat('atk', -10)] },
      },
      {
        a: { slug: 'desarme-preciso', effects: [harder('skill-especial-lanceiro', 1200)] },
        b: { slug: 'folego-da-formacao', effects: [maxPp(1)] },
      },
      {
        a: { slug: 'alcance-longo', effects: [harder('skill-ataque-lanceiro', 1150), refund('kill')] },
        b: { slug: 'mao-estendida', effects: [grantReaction('skill-assistir')] },
        m: { slug: 'giro-da-haste', effects: [flat('spd', 3), tacticsCondition()] },
      },
      {
        a: { slug: 'pressao', effects: [duelApCap(1)] },
        b: { slug: 'alcance-de-apoio', effects: [assistRange(1)] },
      },
      {
        a: { slug: 'braco-treinado', maxRank: 2, effects: [pct('atk', 20), flat('pen', 40)] },
        b: { slug: 'escudo-companheiro', maxRank: 2, effects: [pct('hp', 5)] },
      },
      {
        a: { slug: 'desarme-cruel', effects: [applies('skill-especial-lanceiro', 'effect-desarme', 650)] },
        b: { slug: 'contra-simples', effects: contraSimples() },
        m: { slug: 'troca-de-haste', minAwakening: AWAKENING_AVANCADO, effects: [maxAp(1)] },
      },
      {
        a: { slug: 'sangue-frio', effects: [refund('duelWon')] },
        b: { slug: 'ordem-de-linha', effects: [pct('def', 10)] },
      },
      {
        a: { slug: 'maestria-da-lanca', effects: [passive('passive-lanceiro-maestria')] },
        b: { slug: 'comando-de-formacao', effects: [tacticsSlot(), maxPp(1)] },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Da grade para o dado
// ---------------------------------------------------------------------------

export function generateCharacter(spec: CharacterSpec) {
  return {
    id: spec.id,
    name: spec.name,
    classId: spec.classId,
    acquisition: spec.acquisition,
    // Derivado aqui, no GERADOR, e não no motor: o gerador é quem autora, e é o lugar onde
    // uma convenção de nome é legítima. `packages/gacha` não pode derivar o mesmo id
    // (regra 4), e por isso o banner o declara.
    fragmentMaterialId: `material-fragmento-${spec.id}`,
    startingHero: startingHero(spec),
  };
}

// A ficha inicial. Tudo que segue convenção de id sai do slug da CLASSE — que é onde a
// arma e as duas skills do projeto sempre moraram (`item-arma-espadachim`,
// `skill-ataque-espadachim`) — e o que não segue vem declarado no spec.
function startingHero(spec: CharacterSpec) {
  const classe = spec.classId.replace(/^class-/, '');
  const especial = `skill-especial-${classe}`;

  return {
    level: STARTING_LEVEL,
    weaponType: spec.weaponType,
    equipment: {
      weapon: `item-arma-${classe}`,
      helmet: null,
      armor: null,
      necklace: spec.necklace,
      ring: null,
      boots: null,
    },
    duelSkills: [`skill-ataque-${classe}`, especial, ...(spec.extraDuelSkills ?? [])],
    mapSkills: [],
    // A mesma linha única que as vagas da campanha declaram: usar a especial quando der.
    // Editar o script é do jogador (§6.3), e a ficha só entrega o ponto de partida.
    tacticsScript: [{ enabled: true, skillId: especial, conditions: [] }],
  };
}

export function generateTalentTree(spec: CharacterSpec) {
  const nodes = spec.rows.flatMap((linha, index) => {
    const row = index + 1;
    // Ordem A, meio, B — a mesma da esquerda para a direita em que §8.2 desenha a grade.
    const naLinha: { readonly coluna: 'a' | 'middle' | 'b'; readonly node: NodeSpec }[] = [
      { coluna: 'a', node: linha.a },
      ...(linha.m ? [{ coluna: 'middle' as const, node: linha.m }] : []),
      { coluna: 'b', node: linha.b },
    ];

    return naLinha.map(({ coluna, node }) => ({
      id: `talent-${spec.slug}-${node.slug}`,
      column: coluna,
      row,
      maxRank: node.maxRank ?? 1,
      ...(node.minAwakening !== undefined ? { minAwakening: node.minAwakening } : {}),
      effects: node.effects,
    }));
  });

  return { characterId: spec.id, depth: spec.rows.length, nodes };
}

// ---------------------------------------------------------------------------
// Consultas que outros autores de conteúdo fazem ao elenco
//
// `authorContent.ts` precisa delas para montar as comps do torneio: com o elenco
// fechado (D6), uma composição deixa de ser um herói sintético de uma classe e passa a
// ser um personagem de verdade, com a árvore dele e uma alocação legal nela.
// ---------------------------------------------------------------------------

export function characterForClass(classId: string): CharacterSpec {
  const found = ELENCO.find((c) => c.classId === classId);
  // Falha alto: com o elenco fechado, classe sem personagem é conteúdo sem consumidor —
  // exatamente o antipadrão que D7 corrigiu ao levar o elenco de 6 para 9.
  if (!found) throw new Error(`nenhum personagem do elenco joga ${classId}`);
  return found;
}

// A linha (1-based) e a coluna do nó que concede `skill-assistir`. Quem monta uma comp
// precisa saber por qual lado descer: §6.4 não torna assistir universal, então uma
// composição que não aloque este nó volta a medir duelos isolados — o buraco que a
// auditoria de 2026-08-07 apontou na matriz de M8.
export function columnGrantingAssist(spec: CharacterSpec): 'a' | 'b' {
  for (const linha of spec.rows) {
    for (const coluna of ['a', 'b'] as const) {
      if (linha[coluna].effects.some((e) => e.t === 'grantReaction' && e.reactionId === 'skill-assistir')) return coluna;
    }
  }
  throw new Error(`${spec.id} não tem nó que conceda skill-assistir`);
}

// §8.2 — o caminho que desce inteiro por uma coluna principal gastando os 9 pontos: um
// por linha e, com o que sobrar, ranks a mais nos nós já alocados. É a mesma construção
// que o teste do elenco verifica de forma independente em `packages/content`.
export function columnPathAllocation(spec: CharacterSpec, column: 'a' | 'b'): Record<string, number> {
  const nos = spec.rows.map((linha) => ({ id: `talent-${spec.slug}-${linha[column].slug}`, maxRank: linha[column].maxRank ?? 1 }));
  const alocacao: Record<string, number> = {};
  let restante = TALENT_POINT_BUDGET;

  for (const no of nos) {
    if (restante <= 0) break;
    alocacao[no.id] = 1;
    restante -= 1;
  }
  for (const no of nos) {
    if (restante <= 0) break;
    const atual = alocacao[no.id];
    // Sai no primeiro nó não alocado, e não `continue`: a árvore é um CAMINHO (1/N), e
    // aprofundar rank num nó abaixo do último alcançado seria alocação inválida.
    if (atual === undefined) break;
    const extra = Math.min(no.maxRank - 1, restante);
    alocacao[no.id] = atual + extra;
    restante -= extra;
  }

  return alocacao;
}

function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

function writeJson(dir: string, id: string, content: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

function main(): void {
  const root = packageRoot();
  const charactersDir = join(root, 'characters');
  const treesDir = join(root, 'character-talent-trees');

  for (const spec of ELENCO) {
    const personagem = generateCharacter(spec);
    characterSchema.parse(personagem); // falha cedo se o gerador produzir algo inválido
    writeJson(charactersDir, personagem.id, personagem);

    const arvore = generateTalentTree(spec);
    characterTalentTreeSchema.parse(arvore);
    writeJson(treesDir, `tree-${arvore.characterId}`, arvore);
  }

  const profundidades = ELENCO.map((c) => c.rows.length).join(', ');
  console.log(`Gerado: ${ELENCO.length} personagens e ${ELENCO.length} árvores (profundidades: ${profundidades}).`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}

export { ELENCO };
export type { CharacterSpec, NodeSpec, RowSpec };
