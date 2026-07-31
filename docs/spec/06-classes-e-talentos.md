<!-- Classes, promoção, árvores, skills -->
## 8. Classes e talentos (World of Warcraft)

### 8.1 Estrutura

```
Classe Base (nv 1-20)  →  Especialização (nv 20-40)  →  Mestria (nv 40-60)
   Soldado             →   Cavaleiro | Berserker      →  Paladino | Senhor da Guerra ...
```

Promoção exige item + nível mínimo, e é irreversível sem item raro de reset. Cada classe define: curva de stat base, `moveType`, `moveRange`, armas permitidas, **pools base de AP/PP**, e a árvore de talentos.

### 8.2 Árvores

Duas árvores por herói: **Classe** (8 pontos, compartilhada entre specs) e **Especialização** (8 pontos). 1 ponto por nível a partir do 5, alternando. ~16 pontos no nível 60.

```ts
interface TalentNode {
  id: Id;
  tree: 'class'|'spec';
  row: number;              // 1..8; gate por pontos gastos na árvore
  requires?: Id[];
  exclusiveWith?: Id[];     // choice nodes
  maxRank: 1|2|3;
  effects: TalentEffect[];
}

type TalentEffect =
  | { t: 'stat'; stat: StatKey; flat?: number; pct?: number }
  | { t: 'grantSkill'; skillId: Id }
  | { t: 'grantReaction'; reactionId: Id }
  | { t: 'modifySkill'; skillId: Id; patch: Partial<SkillDef> }
  | { t: 'extraTacticsSlot' }
  | { t: 'extraTacticsCondition' }
  | { t: 'maxAp'; n: number }
  | { t: 'maxPp'; n: number }
  | { t: 'apRefund'; on: 'kill'|'duelWon'|'assist'; n: number }
  | { t: 'duelApCap'; n: number }         // eleva o teto de 2 AP por duelo
  | { t: 'assistRangeBonus'; n: number }
  | { t: 'passive'; passiveId: Id };
```

**Regras de design das árvores:**
- Cada árvore DEVE ter no mínimo **3 choice nodes** que mudem o papel do herói de verdade. Ex.: "contra-atacar custa 0 PP, mas você perde 1 AP máximo" vs "seu ataque básico aplica sangramento".
- No máximo **30%** dos nós podem ser preenchimento de `+2% stat`.
- Ao menos **2 nós por árvore** DEVEM tocar a economia de AP/PP ou o sistema de assistência. Talento que só dá número é talento fraco neste jogo.
- **Reset barato** (ouro). Experimentar build é conteúdo, não punição. Bloqueado durante batalha e durante partida de PvP em andamento.

### 8.3 Skills

```ts
interface SkillDef {
  id: Id; name: string;
  kind: 'duel' | 'map' | 'reaction';
  apCost: number;          // 0 = ataque básico
  ppCost?: number;         // reações
  cooldown: number;        // em rounds de MAPA
  multiplier: number;      // escala 1000
  flat: number;
  scalesWith: 'atk'|'def'|'hp';
  duelRange?: number;      // herda da arma se ausente
  effects: EffectApplication[];
  trigger?: ReactionTrigger;
  tags: string[];          // 'physical','magic','pierce','heal','buff','aoe'
}
```

Cooldown em rounds de **mapa**, não de duelo: uma skill forte usada em um duelo fica indisponível pelos próximos duelos daquele round e do seguinte. Mais uma trava contra spam.

---
