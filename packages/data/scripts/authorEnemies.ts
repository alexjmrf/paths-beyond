import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import enemySchema from '../schemas/enemies.schema.js';

// §8.1 (M17, sub-sessão 3/N) — os INIMIGOS DE FASE, autorados direto.
//
// "Inimigo de campanha, de masmorra e qualquer unidade que só exista para ser enfrentada é
// autorado direto: status e skills escolhidos para a dificuldade pretendida, sem classe a
// resolver, sem nível a interpolar, sem árvore e sem alocação de talento."
//
// DE ONDE VIERAM ESTES NÚMEROS, e por que a resposta é história e não fórmula.
//
// Até esta fatia cada um destes 41 inimigos era um `Hero` completo — "arqueiro nível 9 com
// esta arma" — e a força dele era a CONSEQUÊNCIA de cinco tabelas: a curva da classe no
// nível, o multiplicador de despertar, o flat de imprint, o equipamento e o talento. A
// migração resolveu cada um deles UMA VEZ, pelo core de verdade (`resolveHeroStatSheet`),
// e escreveu o resultado aqui. Decisão do usuário, tomada ao abrir a fatia: congelar a
// força de hoje em vez de reescolhê-la.
//
// O ganho não é o número: é que a derivação SAIU DO PROJETO. Deixar de ter as cinco tabelas
// entre o que o autor quer dizer e o que o jogo usa significa que endurecer o capítulo 4
// agora é editar `atk` aqui, e não descobrir qual das tabelas produz o `atk`.
//
// O preço, dito por inteiro: a dificuldade dos 14 encontros ficou EXATAMENTE onde estava, e
// isso é verificável — `packages/content/tests/inimigoAutorado.test.ts` guarda o hash do
// perfil de combate de cada uma das 43 unidades inimigas medido ANTES da migração, e
// compara com o que sai depois. Em compensação, os números não foram REESCOLHIDOS: eles
// ainda são o que uma curva de classe produzia, com a legibilidade que uma curva tem. Quem
// for afinar dificuldade daqui para frente edita números, e é a primeira vez que isso é
// possível sem mexer em classe.
//
// Note o que NÃO está aqui: `level`, `classId`, `awakening`, `imprint`, `talents`,
// `equipment`. Os seis campos que faziam de um inimigo uma ficha de progressão que ninguém
// joga. O schema é `.strict()` e recusa todos eles, para que uma migração incompleta seja
// erro de validação em vez de força silenciosamente errada.

interface EnemySpec {
  readonly id: string;
  readonly name: string;
  readonly stats: Readonly<Record<string, number>>;
  readonly unitType: string;
  readonly weaponType: string;
  readonly moveType: string;
  readonly moveRange: number;
  readonly pools: { readonly ap: number; readonly pp: number };
  readonly duelSkills: readonly string[];
  readonly mapSkills: readonly string[];
  readonly tacticsScript: readonly { readonly enabled: boolean; readonly skillId: string; readonly conditions: readonly unknown[] }[];
}

export const ENEMIES: readonly EnemySpec[] = [
  {
    id: 'enemy-bandido',
    name: 'Bandido',
    stats: { hp: 560, atk: 102, def: 48, spd: 83, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'axe',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 1 },
    duelSkills: ['skill-ataque-guerreiro', 'skill-especial-guerreiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-guerreiro', conditions: [] }],
  },
  {
    id: 'enemy-patrulheiro-lanceiro',
    name: 'Patrulheiro de Lança',
    stats: { hp: 560, atk: 102, def: 53, spd: 87, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'spear',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-lanceiro', 'skill-especial-lanceiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-lanceiro', conditions: [] }],
  },
  {
    id: 'enemy-patrulheiro-guerreiro',
    name: 'Patrulheiro de Machado',
    stats: { hp: 560, atk: 102, def: 48, spd: 83, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'axe',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 1 },
    duelSkills: ['skill-ataque-guerreiro', 'skill-especial-guerreiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-guerreiro', conditions: [] }],
  },
  {
    id: 'enemy-patrulheiro-arqueiro',
    name: 'Patrulheiro Arqueiro',
    stats: { hp: 560, atk: 72, def: 43, spd: 87, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'bow',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 4, pp: 1 },
    duelSkills: ['skill-ataque-arqueiro', 'skill-especial-arqueiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-arqueiro', conditions: [] }],
  },
  {
    id: 'enemy-invasor-guerreiro',
    name: 'Invasor de Machado',
    stats: { hp: 580, atk: 105, def: 49, spd: 83, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'axe',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 1 },
    duelSkills: ['skill-ataque-guerreiro', 'skill-especial-guerreiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-guerreiro', conditions: [] }],
  },
  {
    id: 'enemy-invasor-lanceiro',
    name: 'Invasor de Lança',
    stats: { hp: 580, atk: 105, def: 54, spd: 87, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'spear',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-lanceiro', 'skill-especial-lanceiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-lanceiro', conditions: [] }],
  },
  {
    id: 'enemy-invasor-arqueiro',
    name: 'Invasor Arqueiro',
    stats: { hp: 580, atk: 75, def: 44, spd: 87, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'bow',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 4, pp: 1 },
    duelSkills: ['skill-ataque-arqueiro', 'skill-especial-arqueiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-arqueiro', conditions: [] }],
  },
  {
    id: 'enemy-cerco-guerreiro',
    name: 'Sitiante de Machado',
    stats: { hp: 580, atk: 105, def: 49, spd: 83, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'axe',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 1 },
    duelSkills: ['skill-ataque-guerreiro', 'skill-especial-guerreiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-guerreiro', conditions: [] }],
  },
  {
    id: 'enemy-cerco-lanceiro',
    name: 'Sitiante de Lança',
    stats: { hp: 580, atk: 105, def: 54, spd: 87, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'spear',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-lanceiro', 'skill-especial-lanceiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-lanceiro', conditions: [] }],
  },
  {
    id: 'enemy-cerco-arqueiro',
    name: 'Sitiante Arqueiro',
    stats: { hp: 580, atk: 75, def: 44, spd: 87, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'bow',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 4, pp: 1 },
    duelSkills: ['skill-ataque-arqueiro', 'skill-especial-arqueiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-arqueiro', conditions: [] }],
  },
  {
    id: 'enemy-cerco-grifeiro',
    name: 'Sitiante Alado',
    stats: { hp: 580, atk: 105, def: 88, spd: 91, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'flying',
    weaponType: 'spear',
    moveType: 'flying',
    moveRange: 5,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-grifeiro', 'skill-especial-grifeiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-grifeiro', conditions: [] }],
  },
  {
    id: 'enemy-emboscada-lanceiro',
    name: 'Emboscador de Lança',
    stats: { hp: 580, atk: 105, def: 54, spd: 87, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'spear',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-lanceiro', 'skill-especial-lanceiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-lanceiro', conditions: [] }],
  },
  {
    id: 'enemy-emboscada-guerreiro',
    name: 'Emboscador de Machado',
    stats: { hp: 580, atk: 105, def: 49, spd: 83, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'axe',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 1 },
    duelSkills: ['skill-ataque-guerreiro', 'skill-especial-guerreiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-guerreiro', conditions: [] }],
  },
  {
    id: 'enemy-emboscada-arqueiro',
    name: 'Emboscador Arqueiro',
    stats: { hp: 580, atk: 75, def: 44, spd: 87, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'bow',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 4, pp: 1 },
    duelSkills: ['skill-ataque-arqueiro', 'skill-especial-arqueiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-arqueiro', conditions: [] }],
  },
  {
    id: 'enemy-emboscada-couracado',
    name: 'Emboscador Couraçado',
    stats: { hp: 580, atk: 79, def: 46, spd: 81, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'armored',
    weaponType: 'axe',
    moveType: 'heavy',
    moveRange: 3,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-couracado', 'skill-especial-couracado'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-couracado', conditions: [] }],
  },
  {
    id: 'enemy-guarda-portao',
    name: 'Guarda do Portão',
    stats: { hp: 600, atk: 81, def: 47, spd: 82, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'armored',
    weaponType: 'axe',
    moveType: 'heavy',
    moveRange: 3,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-couracado', 'skill-especial-couracado', 'skill-ultimo-suspiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-couracado', conditions: [] }],
  },
  {
    id: 'enemy-sentinela-alada',
    name: 'Sentinela Alada',
    stats: { hp: 600, atk: 108, def: 91, spd: 92, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'flying',
    weaponType: 'spear',
    moveType: 'flying',
    moveRange: 5,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-grifeiro', 'skill-especial-grifeiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-grifeiro', conditions: [] }],
  },
  {
    id: 'enemy-capelao',
    name: 'Capelão',
    stats: { hp: 600, atk: 78, def: 50, spd: 86, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'caster',
    weaponType: 'holy',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-clerigo', 'skill-especial-clerigo', 'skill-cura-clerigo'],
    mapSkills: [],
    tacticsScript: [
      { enabled: true, skillId: 'skill-cura-clerigo', conditions: [{'t': 'selfHpBelow', 'pct': 250}] },
      { enabled: true, skillId: 'skill-especial-clerigo', conditions: [] },
    ],
  },
  {
    id: 'enemy-chefe',
    name: 'Comandante da Fortaleza',
    // O único inimigo do jogo que usava DUAS peças do mesmo set (`set-forca`, +10% atk com
    // 2 peças). A primeira passada da migração resolveu os equipamentos sem o catálogo de
    // sets e o deixou com `atk: 142`; quem pegou foi a tabela de hashes congelados de
    // `inimigoAutorado.test.ts`, que é exatamente o defeito para o qual ela existe — 10% de
    // ataque a menos no chefe do capítulo final não vira o desfecho de nenhum teste.
    stats: { hp: 1015, atk: 156, def: 81, spd: 96, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'sword',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 4, pp: 3 },
    duelSkills: ['skill-ataque-mestre-espadachim', 'skill-especial-mestre-espadachim'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-mestre-espadachim', conditions: [] }],
  },
  {
    id: 'enemy-treino-elite-espadachim',
    name: 'Veterano de Treino de Espada',
    stats: { hp: 760, atk: 132, def: 84, spd: 89, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'sword',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-espadachim', 'skill-especial-espadachim'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-espadachim', conditions: [] }],
  },
  {
    id: 'enemy-treino-elite-arqueiro',
    name: 'Veterano de Treino Arqueiro',
    stats: { hp: 760, atk: 102, def: 53, spd: 89, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'bow',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 4, pp: 1 },
    duelSkills: ['skill-ataque-arqueiro', 'skill-especial-arqueiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-arqueiro', conditions: [] }],
  },
  {
    id: 'enemy-treino-elite-clerigo',
    name: 'Veterano de Treino Clérigo',
    stats: { hp: 740, atk: 99, def: 57, spd: 87, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'caster',
    weaponType: 'holy',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-clerigo', 'skill-especial-clerigo'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-clerigo', conditions: [] }],
  },
  {
    id: 'enemy-treino-alvo-espadachim',
    name: 'Alvo de Treino de Espada',
    stats: { hp: 560, atk: 102, def: 64, spd: 87, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'sword',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-espadachim', 'skill-especial-espadachim'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-espadachim', conditions: [] }],
  },
  {
    id: 'enemy-treino-alvo-guerreiro',
    name: 'Alvo de Treino de Machado',
    stats: { hp: 560, atk: 102, def: 48, spd: 83, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'axe',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 1 },
    duelSkills: ['skill-ataque-guerreiro', 'skill-especial-guerreiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-guerreiro', conditions: [] }],
  },
  {
    id: 'enemy-tirano-elite-guarda',
    name: 'Guarda Pretoriano',
    stats: { hp: 840, atk: 105, def: 59, spd: 84, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'armored',
    weaponType: 'axe',
    moveType: 'heavy',
    moveRange: 3,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-couracado', 'skill-especial-couracado'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-couracado', conditions: [] }],
  },
  {
    id: 'enemy-tirano-elite-clerigo',
    name: 'Cantor de Ossos',
    stats: { hp: 800, atk: 108, def: 60, spd: 88, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'caster',
    weaponType: 'holy',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-clerigo', 'skill-especial-clerigo'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-clerigo', conditions: [] }],
  },
  {
    id: 'enemy-tirano-elite',
    name: 'O Tirano Desperto',
    stats: { hp: 1325, atk: 193, def: 109, spd: 95, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'sword',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 4, pp: 3 },
    duelSkills: ['skill-ataque-mestre-espadachim', 'skill-especial-mestre-espadachim'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-mestre-espadachim', conditions: [] }],
  },
  {
    id: 'enemy-tirano-guarda',
    name: 'Guarda do Covil',
    stats: { hp: 660, atk: 87, def: 50, spd: 82, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'armored',
    weaponType: 'axe',
    moveType: 'heavy',
    moveRange: 3,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-couracado', 'skill-especial-couracado'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-couracado', conditions: [] }],
  },
  {
    id: 'enemy-tirano',
    name: 'O Tirano',
    stats: { hp: 1075, atk: 153, def: 89, spd: 93, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'sword',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 4, pp: 3 },
    duelSkills: ['skill-ataque-mestre-espadachim', 'skill-especial-mestre-espadachim'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-mestre-espadachim', conditions: [] }],
  },
  {
    id: 'enemy-forja-elite-guarda-couracado',
    name: 'Guardião da Forja Couraçado',
    stats: { hp: 720, atk: 93, def: 53, spd: 83, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'armored',
    weaponType: 'axe',
    moveType: 'heavy',
    moveRange: 3,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-couracado', 'skill-especial-couracado'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-couracado', conditions: [] }],
  },
  {
    id: 'enemy-forja-elite-guarda-espadachim',
    name: 'Guardião da Forja de Espada',
    stats: { hp: 720, atk: 126, def: 80, spd: 89, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'sword',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-espadachim', 'skill-especial-espadachim'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-espadachim', conditions: [] }],
  },
  {
    id: 'enemy-forja-elite-arqueiro',
    name: 'Besteiro da Forja',
    stats: { hp: 700, atk: 93, def: 50, spd: 89, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'bow',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 4, pp: 1 },
    duelSkills: ['skill-ataque-arqueiro', 'skill-especial-arqueiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-arqueiro', conditions: [] }],
  },
  {
    id: 'enemy-forja-elite-arcanista',
    name: 'Fundidor Arcano',
    stats: { hp: 700, atk: 93, def: 52, spd: 91, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'caster',
    weaponType: 'arcane',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 4, pp: 1 },
    duelSkills: ['skill-ataque-arcanista', 'skill-especial-arcanista'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-arcanista', conditions: [] }],
  },
  {
    id: 'enemy-forja-guarda-couracado',
    name: 'Guarda da Forja Couraçado',
    stats: { hp: 600, atk: 81, def: 47, spd: 82, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'armored',
    weaponType: 'axe',
    moveType: 'heavy',
    moveRange: 3,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-couracado', 'skill-especial-couracado'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-couracado', conditions: [] }],
  },
  {
    id: 'enemy-forja-guarda-espadachim',
    name: 'Guarda da Forja de Espada',
    stats: { hp: 600, atk: 108, def: 68, spd: 88, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'sword',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-espadachim', 'skill-especial-espadachim'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-espadachim', conditions: [] }],
  },
  {
    id: 'enemy-forja-arqueiro',
    name: 'Vigia da Forja',
    stats: { hp: 580, atk: 75, def: 44, spd: 87, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'bow',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 4, pp: 1 },
    duelSkills: ['skill-ataque-arqueiro', 'skill-especial-arqueiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-arqueiro', conditions: [] }],
  },
  {
    id: 'enemy-veio-elite-espadachim',
    name: 'Capataz do Veio de Espada',
    stats: { hp: 780, atk: 135, def: 86, spd: 89, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'sword',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-espadachim', 'skill-especial-espadachim'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-espadachim', conditions: [] }],
  },
  {
    id: 'enemy-veio-elite-couracado',
    name: 'Capataz do Veio Couraçado',
    stats: { hp: 780, atk: 99, def: 56, spd: 83, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'armored',
    weaponType: 'axe',
    moveType: 'heavy',
    moveRange: 3,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-couracado', 'skill-especial-couracado'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-couracado', conditions: [] }],
  },
  {
    id: 'enemy-veio-elite-grifeiro',
    name: 'Capataz do Veio Alado',
    stats: { hp: 760, atk: 132, def: 115, spd: 93, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'flying',
    weaponType: 'spear',
    moveType: 'flying',
    moveRange: 5,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-grifeiro', 'skill-especial-grifeiro'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-grifeiro', conditions: [] }],
  },
  {
    id: 'enemy-veio-saqueador-espadachim',
    name: 'Saqueador do Veio de Espada',
    stats: { hp: 620, atk: 111, def: 70, spd: 88, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'sword',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-espadachim', 'skill-especial-espadachim'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-espadachim', conditions: [] }],
  },
  {
    id: 'enemy-veio-saqueador-couracado',
    name: 'Saqueador do Veio Couraçado',
    stats: { hp: 620, atk: 83, def: 48, spd: 82, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'armored',
    weaponType: 'axe',
    moveType: 'heavy',
    moveRange: 3,
    pools: { ap: 3, pp: 2 },
    duelSkills: ['skill-ataque-couracado', 'skill-especial-couracado'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-especial-couracado', conditions: [] }],
  },
];

// Os ids, para quem POSICIONA o inimigo (`authorCampaign.ts`, `authorDungeons.ts`) poder
// checar contra o catálogo em vez de escrever a string na mão e descobrir o erro na
// validação — ou, pior, não descobrir: `enemyId` desconhecido é erro de conteúdo, e quem
// o pega é `packages/content`, um pacote adiante.
export const ENEMY_IDS: ReadonlySet<string> = new Set(ENEMIES.map((e) => e.id));

export function enemyIdOrThrow(id: string): string {
  if (!ENEMY_IDS.has(id)) throw new Error(`inimigo desconhecido: ${id}`);
  return id;
}

function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

function main(): void {
  const dir = join(packageRoot(), 'enemies');
  mkdirSync(dir, { recursive: true });

  for (const spec of ENEMIES) {
    // Falha cedo se a autoria produzir algo que o schema recusa — mesmo padrão de
    // `authorCharacters.ts`, e a razão é a mesma: um arquivo inválido escrito em disco só
    // apareceria na validação, longe de quem o escreveu.
    enemySchema.parse(spec);
    writeFileSync(join(dir, `${spec.id}.json`), `${JSON.stringify(spec, null, 2)}
`, 'utf8');
  }

  console.log(`Gerado: ${ENEMIES.length} inimigos autorados em packages/data/enemies/.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
