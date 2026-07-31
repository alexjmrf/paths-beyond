<!-- NÚCLEO: duelo 1v1, AP/PP, scripts táticos, assistências, dano, spd -->
## 6. O duelo (Unicorn Overlord, 1v1)

Este é o coração do jogo e o sistema de maior risco. Implemente-o **primeiro**, headless, com testes, antes de qualquer pixel.

### 6.1 Estrutura

Quando A engaja B:

1. Monta-se um `Duel` com os dois heróis, seus stat sheets, seus **pools atuais** de AP/PP e os modificadores posicionais (5.5).
2. Resolve-se a **janela de assistências** (6.5).
3. O duelo dura no máximo **`MAX_TROCAS = 3`**. Em cada troca, cada participante age **uma vez**, na ordem definida em 6.7.
4. O duelo termina quando: alguém morre, ou as 3 trocas acabam.
5. Aplica-se o resultado ao mapa: HP, pools de AP/PP gastos, efeitos com duração `battle`, EXP, mortes.

**Alcance.** Cada arma tem `duelRange`:
- `melee` (1): ambos podem agir normalmente nas 3 trocas.
- `ranged` (2–3): se o alcance do atacante é maior que o do defensor e a distância excede o alcance do defensor, **o defensor não age no duelo** — não pode contra-atacar, só sofre. Isso torna arqueiros e magos fortes e cria a resposta tática óbvia: fechar distância. Se o defensor também é ranged com alcance suficiente, o duelo é normal.

### 6.2 AP e PP — a economia de recursos (regra central)

**AP e PP são pools de batalha inteira, não de duelo.** Este é o ponto de tradução do Unicorn Overlord: o recurso é escasso e precisa durar o mapa.

| | AP (Pontos de Ação) | PP (Pontos Passivos) |
|---|---|---|
| Base | 3–5 por classe (+ `focus`, cap +2) | 1–3 por classe (+ `vigor`, cap +2) |
| Gasto em | Skills ativas no duelo; skills de mapa | **Reações**: contra-atacar, esquivar, cobrir aliado, cura reativa, **assistir** um duelo aliado |
| Recuperação | `rest` (+1), `wait` em `fort`/`camp` (+1), Valor, itens | `rest` (+1), Valor, itens, alguns talentos |
| Regeneração passiva | **Nenhuma** | **Nenhuma** |

Regras duras:
- O **ataque básico custa 0 AP** e está sempre disponível. Um duelo sempre resolve, mesmo com pools zerados.
- **Contra-atacar custa 1 PP.** Não é grátis. Um defensor sem PP apanha de graça — e sofre "Emboscada" (5.5).
- Uma unidade **não pode gastar mais de 2 AP em um mesmo duelo**, mesmo tendo pool. Isso impede que um duelo consuma o mapa inteiro e mantém a leitura do preview simples.

Consequência de design pretendida: agressão constante drena recursos. Escolher **quando** duelar é a decisão do jogo.

### 6.3 Scripts táticos (a mecânica-assinatura)

Cada herói tem uma lista **ordenada** de até 6 linhas. Cada linha:

```ts
interface TacticsLine {
  enabled: boolean;
  skillId: Id;
  conditions: Condition[];   // AND entre elas; 2 no início, até 3 com talentos
}

type Condition =
  // sobre o oponente
  | { t: 'targetHpBelow'; pct: number }
  | { t: 'targetHpAbove'; pct: number }
  | { t: 'targetHasDebuff'; debuffId: Id }
  | { t: 'targetHasBuff'; buffId: Id }
  | { t: 'targetIsType'; type: UnitType }        // infantry, cavalry, flying, armored, caster
  | { t: 'targetWeaponIs'; weapon: WeaponType }  // permite counter-pick pelo triângulo
  | { t: 'targetPpBelow'; n: number }            // "ele não pode revidar: gaste tudo"
  // sobre si
  | { t: 'selfHpBelow'; pct: number }
  | { t: 'selfBuffAbsent'; buffId: Id }
  | { t: 'apAtLeast'; n: number }
  | { t: 'ppAtLeast'; n: number }
  // sobre o contexto
  | { t: 'isAttacker' }                          // eu iniciei o duelo
  | { t: 'isDefender' }
  | { t: 'hasPositionalBonus' }                  // flanco, cerco ou altura
  | { t: 'trocaAtLeast'; n: 1|2|3 }
  | { t: 'battleRoundAtLeast'; n: number }       // economia de recurso no início do mapa
  | { t: 'alliesAdjacentAtLeast'; n: number }
  | { t: 'not'; c: Condition };
```

**Algoritmo de decisão (DEVE ser implementado literalmente):**

```
para cada linha do script, de cima para baixo:
  se !enabled                                  → pula
  se skill em cooldown                         → pula
  se AP insuficiente no pool                   → pula
  se gasto excederia o limite de 2 AP no duelo → pula
  se a skill é reação e PP insuficiente        → pula
  avalia todas as conditions
  se todas passam → executa a skill e encerra a decisão desta troca
se nenhuma linha passar → ataque básico (0 AP)
se não puder atacar (sem alcance / não pode agir) → nada acontece nesta troca
```

**Nunca** adicione heurística, busca ou "IA inteligente" por cima disso. A previsibilidade é o produto: o jogador precisa conseguir simular o duelo de cabeça.

### 6.4 Scripts de reação

As reações têm um script separado, também ordenado, avaliado quando a unidade **sofre** uma ação:

```ts
type ReactionTrigger = 'onAttacked' | 'onDamaged' | 'onDebuffed' | 'onAllyEngagedNearby' | 'onLethal';
```

Reações padrão que toda unidade tem: `Contra-atacar` (1 PP), `Defender` (1 PP, `-40%` de dano na troca). Classes e talentos adicionam outras: `Cobrir aliado`, `Esquiva`, `Escudo reativo`, `Cura de emergência`.

Uma unidade gasta **no máximo 1 PP por troca**.

### 6.5 Assistências — a substituição do esquadrão

Depois que o duelo é declarado e antes da primeira troca:

1. Percorre-se a lista de iniciativa (ordem determinística).
2. Cada aliado do atacante e do defensor que esteja **dentro do `assistRange` da sua arma** em relação ao duelo, tenha **PP ≥ 1** e tenha uma linha de reação com trigger `onAllyEngagedNearby` cujas condições passem, **assiste**.
3. Assistir gasta **1 PP** do assistente e executa uma ação reduzida: `50%` do dano da skill, ou cura/buff em efeito integral.
4. **Máximo de 2 assistências por lado, por duelo.** Prioridade pela ordem de iniciativa.
5. Assistir **não** consome o turno do assistente no mapa. Consome o recurso dele.

Isso é o que faz posicionamento virar composição: um arqueiro atrás da linha de frente e um clérigo no alcance certo transformam um duelo perdido em vitória — mas cada intervenção custa PP que não volta.

### 6.6 Fórmula de dano (normativa)

Todos os valores em ponto fixo, escala 1000.

```
1.  base        = fpMul(ATK_atacante, skill.multiplier) + skill.flat
                  (ou DEF/HP se skill.scalesWith != 'atk')
2.  defEfetiva  = fpPct(DEF_defensor, 1000 - min(pen, 700))
3.  mitigacao   = fpDiv(300000, 300000 + defEfetiva * 300)   // ~50% aos 1000 DEF
4.  posMitig    = fpMul(base, mitigacao)
5.  triangulo   = × 1100 / 1000 / 900 conforme 6.8
6.  posicional  = × (flanco, cerco, altura, terreno)         // constantes vindas de 5.5
7.  crit        = rolagem chc → se crítico × chd, senão × 1000
8.  buffs       = × (1 + Σ %dano) × (1 - Σ %redução)
9.  variancia   = × rand(970, 1030)     // ±3%, stream 'damage-variance'
10. final       = max(1, trunc(resultado))
```

**Acurácia:** `hit = clamp(acc_atacante - eva_defensor + terrenoEva + alturaMod, 50, 1000)`. Rolagem única — não use o "2RN" de Fire Emblem, ele quebra a legibilidade do preview em combate automático.

### 6.7 O papel de `spd` — benefícios enumerados e fechados

`spd` é **ordinal e limitado**. Esta lista é **exaustiva**; adicionar qualquer benefício novo a `spd` exige atualizar esta seção da spec.

1. **Posição na lista de iniciativa** (5.3), calculada uma vez no início da batalha.
2. **Ordem dentro do duelo:** o atacante age primeiro por padrão. O defensor **preempta** (age primeiro na troca 1) se `spd_defensor ≥ spd_atacante × 1,15`. Só isso — não concede troca extra.
3. **Evasão:** `eva += (spd - 100) × 0,5`, com **cap rígido de +150** (15%).

`spd` **NÃO** concede, em nenhuma hipótese: turno extra, troca extra, AP ou PP extra, redução de cooldown, ou reordenação da lista de iniciativa por buff.

Por que isso funciona: benefício ordinal tem retorno decrescente natural — passar o rival na lista vale muito, ficar 300 pontos acima dele não vale nada a mais. E quem age tarde ganha +1 PP (5.3), o que dá vantagem reativa. O objetivo de balanceamento é que `spd` fique como um stat **bom em builds específicas** (assassinos que precisam matar antes de apanhar), não como pré-requisito universal.

**Sinal de alerta para o balanceamento:** se, no relatório de `tools/balance`, mais de 60% das builds vencedoras tiverem `spd` acima da mediana, o sistema falhou — reduza o cap de evasão ou aumente o limiar de preempção antes de mexer em qualquer outra coisa.

### 6.8 Triângulo de armas e tipos

- `Espada > Machado > Lança > Espada`; `Arcano > Natureza > Sagrado > Arcano`.
- Arqueiros: `+25%` contra `flying`.
- `armored`: `-20%` de dano físico, `+20%` de dano mágico.
- Afeta dano **e** acurácia (`±100` de acurácia).

### 6.9 Efeitos

```ts
interface ActiveEffect {
  id: Id;
  duration: number | 'duel' | 'battle';   // número = rounds de MAPA
  stacks: number; maxStacks: number;
  dispellable: boolean;
}
```

- Aplicação: `chanceFinal = clamp(base × (1 + eff_atacante) × (1 - efr_defensor), 0, 1000)`.
- Ordem no início do turno de mapa da unidade: DoT → tick de duração → regeneração → ação.
- Efeitos `battle` persistem entre duelos no mesmo mapa (veneno, marca, quebra de armadura). São a forma de "acumular vantagem" ao longo da batalha sem depender de `spd`.

---
