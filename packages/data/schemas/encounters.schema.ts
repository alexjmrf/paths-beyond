import { z } from 'zod';
import heroSchema from './heroes.schema.js';
import { coordSchema, idSchema, mapAiArchetypeSchema } from './shared.js';
import { winConditionSchema } from './maps.schema.js';

// §10 (M12, sub-sessão 1/N) — "Campanha em capítulos: 6-10 mapas". Um `encounter` é o
// ELENCO de um mapa jogado: quem entra, onde, de que lado. O LAYOUT (tiles, terreno)
// continua em `maps/*.json` e é referenciado por `mapId` — separar os dois deixa um mesmo
// layout servir a capítulos diferentes sem duplicar a matriz de tiles (os mapas atuais têm
// ~940 linhas só de `tiles`).
//
// Até M11 este conteúdo vivia em `apps/client/src/data/campaign.ts` como TypeScript: o
// último canto de conteúdo hardcoded do projeto, e o que impedia servidor e `sim-cli` de
// rodarem um mapa de campanha. Mesma correção que M9 fez para o resto do conteúdo.

// `hero` embutido inteiro em vez de referência por id, e `aiArchetype` por unidade —
// precedente direto de `comps.schema.ts` (M8), que resolveu o mesmo problema para o
// torneio. O `aiArchetype` é opcional aqui e obrigatório lá: numa campanha a unidade do
// jogador é controlada por humano (ausente = humano, mesma leitura de `BattleUnit`).
// §8.1 (M17, sub-sessão 3/N) — a unidade de um encontro passou a ter DUAS formas, e a
// escolha entre elas é o lado do tabuleiro.
//
// Até aqui as duas eram `Hero`: o inimigo do capítulo 1 era "um guerreiro nível 8 com este
// equipamento e estes talentos", uma ficha de progressão completa que ninguém joga. §8.1
// separou o que o jogador USA do que ele ENFRENTA, e a separação aparece aqui como união
// discriminada por `side` — a forma mais forte de garantir o critério de aceite 2 do
// milestone, porque ela não deixa o arquivo errado ser ESCRITO. Uma varredura procurando
// `hero` do lado inimigo só pegaria o erro depois de ele existir.
const commonUnitFields = {
  unitId: idSchema,
  pos: coordSchema,
  height: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(0),
  // §9.1 — IA de mapa declarativa POR UNIDADE. Ausente = controlada por humano, e é isso
  // que separa a party do jogador dos inimigos; por isso é opcional dos dois lados, e não
  // obrigatório do lado inimigo: uma unidade inimiga escoltada por script de missão é
  // conteúdo legítimo.
  aiArchetype: mapAiArchetypeSchema.optional(),
};

// §8.1/§8.2 (M17, 4/N) — na campanha, `characterId` é OBRIGATÓRIO, e `heroSchema` sozinho
// não o exige.
//
// A opcionalidade mora lá porque nem todo `Hero` é personagem: o blueprint do reforço
// invocável (D13) e a VAGA de referência da masmorra são fichas de cenário, substituídas
// em jogo pelos heróis que o jogador manda. Aqui não existe esse caso — quem entra do lado
// do jogador num capítulo é alguém do elenco, e é dele a árvore de talentos (D6).
//
// A trava é a forma pelo mesmo motivo do critério 2 do milestone: um herói de campanha sem
// personagem não perde o talento com um erro, ele o perde EM SILÊNCIO — `resolveTalentEffects`
// ignora nó desconhecido sem reclamar (§8.2), então a party jogaria o capítulo mais fraca do
// que o autor escreveu e nada apontaria para isso.
const campaignHeroSchema = heroSchema.extend({ characterId: idSchema });

const playerUnitSchema = z
  .object({ ...commonUnitFields, side: z.literal('player'), hero: campaignHeroSchema })
  .strict();

// O inimigo entra por REFERÊNCIA a `enemies/`, e não embutido. A alternativa (a ficha
// inteira dentro do encontro) foi recusada com o usuário: os oito encontros de masmorra
// vêm em pares base/elite que repetiriam a ficha, e um inimigo nomeado — "Bandido",
// "Guarda do Covil" — é a unidade em que a dificuldade é de fato editada. Que o `enemyId`
// exista no catálogo é validação cruzada e vive em `packages/content`, como todas as
// outras: este schema valida um arquivo isolado.
const enemyUnitSchema = z.object({ ...commonUnitFields, side: z.literal('enemy'), enemyId: idSchema }).strict();

// §10/D16 (M18, 5/N) — a TERCEIRA forma: o ALIADO DE CENÁRIO.
//
// Ela nasceu de um conflito medido, não de uma vontade de generalizar: o capítulo 5 escolta
// `ally-mensageira`, e D14 fez dela uma personagem ADQUIRÍVEL. Quem não a puxou não tinha a
// unidade nomeada pela condição de vitória, e o capítulo não ficava difícil — ficava
// **injogável**, porque `escort` referencia um `unitId` que não existiria.
//
// Decisão do usuário: ela vira NPC do capítulo. É também o que a narrativa sempre disse —
// "A Mensageira" é quem o jogador ENCONTRA e escolta, e é escoltando-a que ela se junta a
// ele. O adquirível ganhou o motivo de ser adquirível.
//
// **Um lado próprio da união, e não um `player` sem `characterId`.** A diferença importa: a
// trava de M17 4/N (todo herói do jogador declara o seu personagem) continua inteira, e o
// aliado é uma coisa declaradamente diferente em vez da ausência de um campo. Pelo mesmo
// motivo ele NÃO pode declarar `characterId` — se pudesse, o capítulo voltaria a nomear
// alguém que o jogador talvez não possua, que é o defeito que esta forma foi consertar.
const allyUnitSchema = z
  .object({ ...commonUnitFields, side: z.literal('ally'), hero: heroSchema.strict() })
  .strict()
  .refine((unit) => !('characterId' in unit.hero) || unit.hero.characterId === undefined, {
    message: 'um aliado de cenário não é do elenco e não pode declarar characterId.',
  });

const encounterUnitSchema = z.union([playerUnitSchema, allyUnitSchema, enemyUnitSchema]);

const encounterSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    mapId: idSchema,
    // M27 (D23) — a MISSÃO aponta para o capítulo, e não o contrário.
    //
    // Até aqui isto era `chapter: number`, e capítulo *era* missão: seis encontros, seis
    // capítulos, e o número servindo só para ordenar a lista. D23 pede três capítulos de dez
    // missões, e o modelo antigo não tinha onde pendurar "a missão 4 do capítulo 2".
    //
    // O capítulo não lista as missões dele (ver `chapters.schema.ts`): um índice mantido à
    // mão é a forma clássica de o repositório passar a mentir — o diretório tem dez missões,
    // o índice lista nove, e nada reclama.
    //
    // **O `id` desta missão NÃO mudou na migração, e não é detalhe:** é ele que o servidor
    // guarda como "limpo" (`listClearedChapters`). Renomear um dos seis encontros antigos
    // apagaria o progresso de quem já jogou, em silêncio, e o sintoma apareceria longe da
    // causa — uma conquista deixando de ser reivindicável.
    chapterId: idSchema,
    // A posição DENTRO do capítulo, contígua a partir de 1. Dentro e não global: a missão 1
    // do capítulo 2 tem de poder ser a "1", senão acrescentar uma missão no capítulo 1
    // renumeraria a campanha inteira.
    order: z.number().int().positive(),
    // §5.7 — "Permadeath é flag do BattleSetup (casual | classic | ironman), nunca
    // hardcoded". Estava hardcoded em `campaign.ts` como 'casual' desde M6; é conteúdo do
    // cenário, então mora aqui.
    permadeath: z.enum(['casual', 'classic', 'ironman']),
    // Opcional, sobrepondo o do layout quando presente. É o que permite um mapa de
    // `escort`: a condição referencia `unitId`, que só existe no elenco — declarar isso no
    // layout amarraria o layout a um roster específico (ver DECISIONS.md).
    winCondition: winConditionSchema.optional(),
    units: z.array(encounterUnitSchema).min(1),
  })
  .refine((encounter) => encounter.units.some((unit) => unit.side === 'player'), {
    message: 'um encounter precisa de pelo menos uma unidade do jogador.',
  })
  .refine(
    (encounter) => new Set(encounter.units.map((unit) => unit.unitId)).size === encounter.units.length,
    { message: 'unitId precisa ser único dentro do encounter.' },
  )
  .refine(
    (encounter) =>
      new Set(encounter.units.map((unit) => `${unit.pos.x},${unit.pos.y}`)).size === encounter.units.length,
    { message: '1 herói = 1 tile: duas unidades não podem começar na mesma coordenada.' },
  )
  .refine(
    (encounter) => {
      // A condição `escort` nomeia uma unidade; ela precisa existir no elenco, senão a
      // partida nasce sem desfecho possível (o motor resolve isso como derrota imediata).
      const condition = encounter.winCondition;
      if (condition?.t !== 'escort') return true;
      // M18 5/N — o aliado de cenário conta: escoltar alguém que ainda não é seu é o
      // sentido inteiro do capítulo 5. O que continua recusado é nomear um INIMIGO.
      return encounter.units.some(
        (unit) => unit.unitId === condition.unitId && (unit.side === 'player' || unit.side === 'ally'),
      );
    },
    { message: 'a condição `escort` precisa nomear uma unidade do jogador ou um aliado de cenário presente no encounter.' },
  );

export default encounterSchema;
