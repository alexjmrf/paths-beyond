<!-- Classes, promoção, árvores, skills -->
## 8. Classes e talentos (World of Warcraft)

### 8.1 Personagens, classes e inimigos

> Revisado em 2026-08-28. A versão anterior tratava toda unidade como um `Hero` com classe,
> nível, equipamento e duas árvores de talento. Esta seção separa o que o jogador **usa** do que
> ele **enfrenta**, porque as duas coisas nunca precisaram do mesmo modelo.

**Personagem jogável.** É a unidade que o jogador possui e leva para o time — a mesma em PvE e em
PvP (arena assíncrona hoje; PvP em tempo real, se existir, usa os mesmos personagens controlados
ao vivo). Tem **classe**, **equipamento**, **nível** e **árvore de talentos própria**. É o objeto
de progressão do jogo.

**Classe.** Continua existindo e continua sendo normativa, mas o papel dela mudou: ela **guia os
status e parte do que o personagem faz** — curva de stat base, `moveType`, `moveRange`, armas
permitidas, pools base de AP/PP e o conjunto de skills de partida. Ela **não é mais a unidade de
progressão**: a árvore não pertence mais à classe.

```
Classe Base (nv 1-20)  →  Especialização (nv 20-40)  →  Mestria (nv 40-60)
   Soldado             →   Cavaleiro | Berserker      →  Paladino | Senhor da Guerra ...
```

Promoção segue exigindo item + nível mínimo e segue irreversível sem item raro de reset.

**Inimigo de fase NÃO é personagem.** Inimigo de campanha, de masmorra e qualquer unidade que só
exista para ser enfrentada é autorado **direto**: status e skills escolhidos para a dificuldade
pretendida, sem classe a resolver, sem nível a interpolar, sem árvore e sem alocação de talento.
É o caminho mais direto e é o que o conteúdo quer dizer — "este inimigo tem esta força" — em vez
de derivá-lo de uma ficha de personagem que ninguém joga.

### 8.2 A árvore de talentos

**Uma árvore por personagem.** Duas árvores por classe deixaram de existir; o que existe é a
árvore daquele personagem, e ela é parte de quem ele é.

**Forma: duas colunas, e uma terceira ocasional.**

```
        A          (meio)          B
row 1   ●                          ●
row 2   ●                          ●
row 3   ●            ◆             ●        <- linha de convergência
row 4   ●                          ●
row 5   ●                          ●
row 6   ●            ◆             ●        <- linha de convergência
row 7   ●                          ●
```

- **Duas colunas principais**, A e B, presentes em **todas** as linhas.
- **Profundidade de 5 a 9 linhas**, declarada por personagem.
- **Uma coluna do meio ocasional**: existe só em algumas linhas. Nas linhas em que existe, o
  jogador escolhe entre **três** nós — A, meio ou B; as duas colunas principais continuam
  oferecendo o nó delas.
- **Um nó por linha.** A escolha não é *quantos*, é *qual*.

**A regra que dá forma à build — a coluna amarra:**

- escolher um nó da coluna A na linha N **obriga** a linha N+1 a vir da coluna A;
- escolher o nó do **meio** na linha N **libera** a linha N+1 a vir de qualquer coluna — e a
  coluna escolhida ali volta a amarrar dali em diante.

A convergência é, portanto, **uma porta que custa um ponto para abrir**. Trocar de lado não é
livre e não é impossível: é uma decisão que se paga com a linha em que ela acontece.

**Orçamento de pontos: FIXO em 9, igual para todo personagem.** A profundidade varia (5 a 9); o
orçamento não. Se profundidade fosse orçamento, um personagem de 9 linhas teria quase o dobro dos
pontos de um de 5, e o balanceamento não teria como separar "tem mais pontos" de "está mais bem
desenhado".

Com o orçamento fixo, **a profundidade vira uma troca de forma e não de poder**:

- uma árvore de **9 linhas** gasta os 9 pontos descendo, um por linha, e não sobra nada para rank;
- uma árvore de **5 linhas** gasta 5 descendo e tem **4 pontos** para aprofundar nós de
  `maxRank > 1` no próprio caminho.

Mais alcance contra mais profundidade, com o mesmo total nos dois extremos. Os pontos que sobram
**só podem aprofundar nós já alocados** — nunca comprar uma linha a mais.

Consequência normativa para quem autora: **a árvore precisa ter onde absorver os 9 pontos.** Uma
árvore rasa sem nenhum `maxRank > 1` deixaria o jogador com saldo e nada para comprar, e é
recusada pelo validador.

```ts
interface TalentNode {
  id: Id;
  column: 'a' | 'b' | 'middle';
  row: number;              // 1..profundidade
  maxRank: 1|2|3;
  effects: TalentEffect[];
}

interface TalentTree {
  characterId: Id;
  depth: number;            // 5..9 — FORMA, não poder
  nodes: TalentNode[];
}

// O orçamento não é campo da árvore: é constante do jogo.
const TALENT_POINT_BUDGET = 9;
```

`TalentEffect` **não muda** — a lista abaixo continua valendo integralmente:

```ts
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
  | { t: 'duelApCap'; n: number }
  | { t: 'assistRangeBonus'; n: number }
  | { t: 'passive'; passiveId: Id };
```

**Regras de design das árvores** (mantidas da versão anterior, adaptadas à forma nova):
- As duas colunas DEVEM ser papéis diferentes de verdade, não a mesma build com números
  distintos. Se A e B levam ao mesmo jeito de jogar, a árvore tem uma coluna só.
- No máximo **30%** dos nós podem ser preenchimento de `+2% stat`.
- Ao menos **2 nós por árvore** DEVEM tocar a economia de AP/PP ou o sistema de assistência.
  Talento que só dá número é talento fraco neste jogo.
- O nó de convergência DEVE valer a pena pelo efeito dele, e não só pela porta que abre —
  senão trocar de coluna custa um ponto morto.
- **Reset barato** (ouro). Experimentar build é conteúdo, não punição. Bloqueado durante batalha e
  durante partida de PvP em andamento.

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
