<!-- Mapa, movimento, iniciativa, ações de turno -->
## 5. Camada tática: o grid

### 5.1 Mapa

- Grid **quadrado** ortogonal, 15×15 a 30×30. Distância = **Manhattan**.

```ts
interface Tile {
  terrain: TerrainId;
  height: 0|1|2|3;
  object?: 'wall'|'fort'|'gate'|'chest'|'camp';
}

interface Terrain {
  id: TerrainId;
  moveCost: Record<MoveType, number | 'impassable'>;
  defBonus: number;   // % de mitigação, escala 1000
  evaBonus: number;
  blocksSight: boolean;
}
```

`MoveType` DEVE incluir `foot`, `cavalry`, `flying`, `heavy`, `aquatic`. Voadores custam 1 em tudo exceto `impassable`, mas sofrem `+25%` de dano de arqueiros.

### 5.2 Movimento

- Alcance = **Dijkstra** com custo de terreno, limitado por `moveRange` da classe.
- **Zone of Control**: tiles ortogonalmente adjacentes a inimigo. Entrar encerra o movimento. Flag por mapa (`zocEnabled`).
- Atravessar aliados é permitido; terminar sobre aliado não.
- O caminho vem inteiro no comando `move` e é **revalidado** pelo simulador. Nunca confie no cliente.

### 5.3 Ordem de turno — lista única de iniciativa (modelo Dofus)

**Não há fase do jogador e fase do inimigo.** Todas as unidades, dos dois lados, ficam em uma única lista ordenada e agem uma vez por round, alternando conforme a lista.

```
iniciativa = spd + rand(0, 99)     // stream 'initiative', rolado UMA vez no início da batalha
```

- A lista é calculada **no início da batalha e NÃO é recalculada** entre rounds. Buffs de `spd` durante a batalha **não** reordenam a lista (só afetam o duelo, seção 6.7). Isso é deliberado: impede que buff de velocidade vire bola de neve.
- Unidades que entram depois (reforços, invocações) são inseridas na posição correspondente ao seu valor de iniciativa.
- Empate resolvido de forma determinística por `(unitId)`, nunca por RNG adicional.
- O round termina quando todas as unidades vivas agiram. Então `hasActedThisRound` reseta, cooldowns de mapa decrementam, e efeitos com duração em rounds tickam.
- A lista de iniciativa completa DEVE ser visível ao jogador o tempo todo, com destaque de quem age em seguida (requisito de UI, não opcional).

**Compensação para quem age tarde:** unidades no terço final da lista começam a batalha com **+1 PP**. Agir cedo dá tempo de iniciativa; agir tarde dá informação e recurso reativo. Isso é o principal freio contra builds de `spd`.

### 5.4 Ação da unidade

No seu turno, uma unidade faz: `mover?` **+ uma** das opções:

| Ação | Efeito |
|---|---|
| `engage` | Abre um duelo com inimigo adjacente (ou à distância, se a arma for ranged — ver 6.1). |
| `mapSkill` | Usa skill de mapa (cura em área, artilharia, buff de zona). Custa AP. |
| `rest` | Não pode ter movido mais que metade do alcance. Recupera **+1 AP e +1 PP**. |
| `wait` | Encerra o turno. Se terminar sobre `fort` ou `camp`: **+1 AP**. |

Uma unidade **pode ser engajada quantas vezes for por outros**; o limite de participação em duelos é o próprio recurso (PP para reagir) e o HP.

### 5.5 Modificadores posicionais do duelo

Calculados no momento do `engage` e passados para o duelo como constantes:

| Situação | Efeito |
|---|---|
| **Flanco**: um aliado do atacante também está adjacente ao defensor | Atacante `+10%` de dano; defensor **não pode gastar PP na primeira troca**. |
| **Cerco**: dois ou mais aliados adjacentes ao defensor | Como flanco, e defensor `-15%` de evasão. |
| **Altura**: diferença de `height` | `+10%` de acurácia e `+5%` de dano por nível de diferença. |
| **Terreno do defensor** | Aplica `defBonus` e `evaBonus` do tile. |
| **Emboscada**: defensor com 0 PP | Atacante `+15%` de dano crítico no duelo. |

Isso faz o grid importar de verdade sem precisar de esquadrões.

### 5.6 Pontos de Valor

Recurso de exército, tipo Unicorn Overlord. Começa em 5, +1 por round, +2 ao capturar objetivo. Gasto em: restaurar AP/PP de uma unidade, invocar reforço, artilharia de mapa, buff global de 1 round. Definidos em `data/valor-skills/*.json`.

### 5.7 Condições de vitória/derrota

Data-driven por mapa: `rout`, `seize`, `survive N rounds`, `escort`, `defend`. Permadeath é flag do `BattleSetup` (`casual | classic | ironman`), nunca hardcoded.

---
