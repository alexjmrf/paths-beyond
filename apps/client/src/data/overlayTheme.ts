// §11 (acessibilidade) — "modo daltônico nos overlays".
//
// Todo significado que o mapa carrega em cor mora aqui, nas duas paletas, em vez de ficar
// espalhado como número literal dentro do desenho. Isso é o que permite trocar a paleta
// inteira num interruptor — e o que permite um teste medir se ela é distinguível.
//
// Decisão do usuário nesta fatia: **paleta segura E padrão**. Cor sozinha não basta, por
// dois motivos concretos deste jogo: os overlays se EMPILHAM (um tile pode ser ameaça e
// alcance de movimento ao mesmo tempo, e o que o jogador vê é a mistura dos dois véus), e
// a distinção mais importante do mapa — quem é meu, quem é inimigo — era azul contra
// vermelho, exatamente o par que a deuteranopia comprime. Com padrão e forma, o mapa
// continua legível até em preto e branco.
//
// A paleta segura é a de Okabe–Ito (2008), desenhada para deuteranopia e protanopia.

export type TilePatternKind = 'none' | 'hatch' | 'dots' | 'grid' | 'frame';
export type UnitShape = 'circle' | 'square';

export interface TileOverlayStyle {
  readonly color: number;
  readonly alpha: number;
  readonly pattern: TilePatternKind;
}

export interface SideStyle {
  readonly color: number;
  readonly shape: UnitShape;
}

// M16, sub-sessão 2/N — os tokens da linguagem visual.
//
// A sub-sessão 1/N deixou esta peça de fora DE PROPÓSITO: sem glifo não havia consumidor, e
// inventar estrutura sem quem a use é o antipadrão que M10, M11 e M15 passaram o projeto
// corrigindo. Ela entra agora junto de quem a usa — o glifo de classe, a marca de terreno, os
// pips de efeito e a barra de HP.
//
// Tudo que é MEDIDA está em fração do tile, nunca em pixel: §11 oferece escalas de 100% a 175%
// e o tile cresce junto, então um número absoluto aqui seria um traço que some em 175% ou uma
// barra que engole o tile em 100%. A exceção é `unitInset`, que é o valor literal de M6 e vale
// em pixel porque é a folga entre o disco e a linha da grade.
export interface VisualTokens {
  readonly unitInset: number; // px entre o meio-tile e o raio do corpo (4, o valor de M6)
  readonly glyphBoxRatio: number;
  readonly glyphStrokeRatio: number;
  // O glifo desce um pouco: o rótulo de AP/PP mora no canto superior esquerdo desde M6 e §11
  // exige que ele fique legível sem hover, então quem cede espaço é o desenho, não o número.
  readonly glyphOffsetY: number;
  readonly glyphInk: number;
  // A plaqueta atrás do rótulo de AP/PP. Não é enfeite: sem ela o número branco cai direto em
  // cima do glifo e dos dois só sobra um borrão (verificado em navegador nesta fatia), e o
  // branco sobre o azul claro do jogador já tinha pouco contraste desde M6. Opaca, e com o
  // glifo deslocado para baixo dela, o número vira crachá em vez de virar parte da figura.
  readonly labelPlate: number;
  readonly labelPlateAlpha: number;
  readonly pipRatio: number;
  readonly buffInk: number;
  readonly debuffInk: number;
  readonly hpBarRatio: number;
  readonly hpTrack: number;
  readonly hpInk: number;
  readonly hpCriticalInk: number;
  readonly hpCriticalAt: number; // fração de HP abaixo da qual a barra ganha marca própria
  // Duas tintas, e não uma: os terrenos ocupam uma rampa de luminância (planície clara,
  // montanha média, floresta escura) e nenhuma tinta única contrasta com as três. A marca é
  // desenhada na que contrasta com o tile embaixo dela — ver `terrainMarkInkFor`.
  readonly terrainMarkInkLight: number;
  readonly terrainMarkInkDark: number;
  readonly terrainMarkAlpha: number;
}

export interface OverlayTheme {
  readonly id: 'default' | 'colorblind';
  readonly tokens: VisualTokens;
  readonly threat: TileOverlayStyle;
  readonly move: TileOverlayStyle;
  readonly targeting: TileOverlayStyle;
  readonly objective: TileOverlayStyle;
  readonly sides: Readonly<Record<'player' | 'enemy', SideStyle>>;
  readonly selectedRing: number;
  readonly engageableRing: number;
  readonly impassableStroke: number;
  // §5.1 (M15) — alvenaria: `Tile.object` `wall` e `gate`. Uma cor só para os dois, porque
  // o que os separa não é cor e sim FORMA (bloco maciço contra bloco com batentes e folha),
  // que é a garantia de M13 4/N e sobrevive a qualquer dicromacia. Estrutura não é terreno:
  // ela é construída, bloqueia quem voa, e um muro pintado como "montanha clara" seria uma
  // parede que se lê como relevo.
  readonly structure: number;
  // Chaves = `TerrainId` reais de `packages/data/terrains/*.json`.
  readonly terrain: Readonly<Record<string, number>>;
  readonly terrainFallback: number;
}

// A paleta de M6–M12, preservada tal como estava: quem não precisa do modo não vê
// diferença nenhuma.
export const DEFAULT_THEME: OverlayTheme = {
  id: 'default',
  tokens: {
    unitInset: 4,
    glyphBoxRatio: 0.4,
    glyphStrokeRatio: 0.055,
    glyphOffsetY: 0.085,
    glyphInk: 0xffffff,
    labelPlate: 0x111827,
    labelPlateAlpha: 0.82,
    pipRatio: 0.14,
    buffInk: 0x86efac,
    debuffInk: 0xfca5a5,
    hpBarRatio: 0.09,
    hpTrack: 0x111827,
    hpInk: 0x4ade80,
    hpCriticalInk: 0xf87171,
    hpCriticalAt: 0.3,
    terrainMarkInkLight: 0xffffff,
    terrainMarkInkDark: 0x0b120c,
    terrainMarkAlpha: 0.5,
  },
  threat: { color: 0xef4444, alpha: 0.22, pattern: 'none' },
  move: { color: 0x60a5fa, alpha: 0.4, pattern: 'none' },
  targeting: { color: 0xa855f7, alpha: 0.3, pattern: 'none' },
  objective: { color: 0xfacc15, alpha: 1, pattern: 'none' },
  sides: {
    player: { color: 0x3b82f6, shape: 'circle' },
    enemy: { color: 0xdc2626, shape: 'circle' },
  },
  selectedRing: 0xfbbf24,
  engageableRing: 0xf97316,
  impassableStroke: 0x4b5563,
  // M16 5/N — a alvenaria era 0x6b4f3a, um marrom de luminância praticamente igual à da
  // floresta: **1,03 de contraste**, os dois tiles lendo-se como o mesmo. Foi o defeito que
  // reprovou o critério de aceite 2 ("dá pra perceber diferença mas não distinguir os elementos
  // do mapa"). Agora ela é o extremo escuro da rampa, e a distância para todo terreno é travada
  // por teste.
  structure: 0x040406,
  // Os três terrenos numa RAMPA DE LUMINÂNCIA, e não em três matizes. É a mesma inversão que
  // M13 4/N aplicou à paleta segura, trazida para a padrão pelo mesmo motivo que valia lá:
  // luminância é o canal que sobrevive à dicromacia, ao monitor ruim e — o que decidiu aqui —
  // ao véu semitransparente que cobre o tile durante quase todo o turno. As matizes de antes
  // foram preservadas (planície verde, floresta verde-escura, montanha pedra); o que mudou foi
  // o espaçamento entre elas. Medido: pior par 1,01 antes, 1,54 depois; pior par cru 1,03 antes,
  // 2,05 depois.
  terrain: {
    'terrain-planicie': 0xaed07a,
    'terrain-floresta': 0x27502c,
    'terrain-montanha': 0x8b8781,
  },
  terrainFallback: 0x888888,
};

// Okabe–Ito: vermilhão D55E00, azul-céu 56B4E9, azul 0072B2, roxo-avermelhado CC79A7,
// amarelo F0E442. Os terrenos saem da faixa de verdes (que a deuteranopia empurra pra
// perto do vermelho da ameaça) para uma rampa de LUMINÂNCIA — claro, médio, escuro —, que
// é o canal que nenhuma das três condições afeta.
export const COLORBLIND_THEME: OverlayTheme = {
  id: 'colorblind',
  tokens: {
    unitInset: 4,
    glyphBoxRatio: 0.4,
    glyphStrokeRatio: 0.055,
    glyphOffsetY: 0.085,
    // Branco não é cor: sobrevive a qualquer dicromacia, e é o que mantém o glifo legível
    // tanto sobre o azul do jogador quanto sobre o vermilhão do inimigo.
    glyphInk: 0xffffff,
    labelPlate: 0x000000,
    labelPlateAlpha: 0.85,
    pipRatio: 0.14,
    // O que separa buff de debuff aqui é FORMA (triângulo para cima contra para baixo) e
    // POSIÇÃO (canto superior direito contra inferior esquerdo). A tinta só reforça.
    buffInk: 0xffffff,
    debuffInk: 0x000000,
    hpBarRatio: 0.09,
    hpTrack: 0x000000,
    hpInk: 0xffffff,
    // Amarelo de Okabe–Ito. E a faixa crítica não depende dele: ela ganha um entalhe próprio.
    hpCriticalInk: 0xf0e442,
    hpCriticalAt: 0.3,
    terrainMarkInkLight: 0xffffff,
    terrainMarkInkDark: 0x000000,
    terrainMarkAlpha: 0.55,
  },
  threat: { color: 0xd55e00, alpha: 0.3, pattern: 'hatch' },
  move: { color: 0x56b4e9, alpha: 0.34, pattern: 'dots' },
  targeting: { color: 0xcc79a7, alpha: 0.34, pattern: 'grid' },
  objective: { color: 0xf0e442, alpha: 1, pattern: 'frame' },
  sides: {
    // A forma é o que separa os dois lados sem depender de cor nenhuma.
    player: { color: 0x0072b2, shape: 'circle' },
    enemy: { color: 0xd55e00, shape: 'square' },
  },
  // Anel de seleção e anel de "dá pra engajar" eram âmbar e laranja — indistinguíveis
  // entre si em deuteranopia, e os dois aparecem em cima de unidades ao mesmo tempo.
  // Branco e preto não são cor: sobrevivem a qualquer condição.
  selectedRing: 0xffffff,
  engageableRing: 0x000000,
  // Contorno claro: a montanha ficou escura na rampa abaixo, e o contorno da rocha
  // intransponível é o que separa parede de terreno difícil.
  impassableStroke: 0xf2f2f2,
  // Alvenaria escura: separada da montanha (0x6e7378) e da floresta (0x3f4a3a) por
  // luminância, o canal que nenhuma dicromacia afeta. M16 5/N escureceu de 0x1f242b para cá:
  // contra a floresta ela estava a 1,67 de contraste, e "muro não se lê como chão" passou a ser
  // travado em 2,0. O limite superior de escuridão não é estético — é o contorno do número de
  // dano (`labelPlate`, preto aqui), de quem a alvenaria precisa ficar a mais de 60 de distância
  // redmean, senão o número some ao voar por cima de um muro.
  structure: 0x10101e,
  terrain: {
    'terrain-planicie': 0xdad2b4,
    // A montanha era um cinza médio (`0x9aa0a6`) e o teste de simulação pegou: em
    // deuteranopia ela ficava a 15 de distância do roxo da mira — o tile de alcance de
    // skill sumia em cima de montanha. Escurecer separa as duas por luminância, que é o
    // canal que nenhuma dicromacia afeta.
    'terrain-montanha': 0x6e7378,
    'terrain-floresta': 0x3f4a3a,
  },
  terrainFallback: 0x6b7280,
};

export function themeFor(colorblindMode: boolean): OverlayTheme {
  return colorblindMode ? COLORBLIND_THEME : DEFAULT_THEME;
}

// Luminância relativa (WCAG), em RGB linear.
function relativeLuminance(color: number): number {
  const canal = (n: number) => {
    const c = n / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = canal((color >> 16) & 0xff);
  const g = canal((color >> 8) & 0xff);
  const b = canal(color & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// A tinta da marca de terreno depende do terreno embaixo dela. Os três terrenos ocupam uma
// rampa de luminância de propósito (foi assim que M13 4/N os separou sob dicromacia), e a
// consequência é que nenhuma tinta única contrasta com os três: uma marca escura some na
// floresta, uma clara some na planície. Escolher por luminância é o que faz a marca ser legível
// em todos eles sem inventar uma cor por terreno — cor por terreno voltaria a pôr significado
// na matiz, que é exatamente o que a paleta segura evita.
export function terrainMarkInkFor(theme: OverlayTheme, backgroundColor: number): number {
  return relativeLuminance(backgroundColor) > 0.18 ? theme.tokens.terrainMarkInkDark : theme.tokens.terrainMarkInkLight;
}

// As cores que CARREGAM SIGNIFICADO no mapa, rotuladas. É sobre esta lista que o teste de
// `overlayTheme.test.ts` mede distinguibilidade sob simulação de daltonismo — se um
// overlay novo entrar no mapa sem entrar aqui, ele escapa da verificação.
export function meaningfulColors(theme: OverlayTheme): Readonly<Record<string, number>> {
  return {
    ameaça: theme.threat.color,
    movimento: theme.move.color,
    mira: theme.targeting.color,
    objetivo: theme.objective.color,
    'unidade do jogador': theme.sides.player.color,
    'unidade inimiga': theme.sides.enemy.color,
    'anel de seleção': theme.selectedRing,
    'anel de engajável': theme.engageableRing,
    'terreno: planície': theme.terrain['terrain-planicie']!,
    'terreno: floresta': theme.terrain['terrain-floresta']!,
    'terreno: montanha': theme.terrain['terrain-montanha']!,
    estrutura: theme.structure,
  };
}

// Pares que PODEM colidir de propósito, declarados aqui em vez de escondidos no teste.
// Ameaça é, por definição, o alcance dos inimigos: pintar as duas coisas com a mesma cor é
// a leitura certa, e o que as separa é o objeto (véu de tile contra disco de unidade).
export const INTENTIONAL_COLOR_PAIRS: readonly (readonly [string, string])[] = [['ameaça', 'unidade inimiga']];

// Escalas de UI oferecidas (§11 — "fonte escalável"). A escala vale para o HTML inteiro e
// para o mapa: o tile e o rótulo de AP/PP crescem juntos, senão o menor texto do jogo —
// justamente o que §11 exige legível no próprio tile — continuaria em 10px.
export const UI_SCALES: readonly number[] = [1, 1.25, 1.5, 1.75];
export const DEFAULT_UI_SCALE = 1;

export function isSupportedUiScale(value: number): boolean {
  return UI_SCALES.includes(value);
}
