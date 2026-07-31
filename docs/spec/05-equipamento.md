<!-- Slots, substats, enhance, sets, CP -->
## 7. Equipamento e itens (Epic Seven)

### 7.1 Slots e mainstats

6 slots: `weapon`, `helmet`, `armor`, `necklace`, `ring`, `boots`.

| Slot | Mainstat |
|---|---|
| Weapon | sempre `atk` flat |
| Helmet | sempre `hp` flat |
| Armor | sempre `def` flat |
| Necklace | aleatório: `atk%`, `hp%`, `def%`, `chc`, `chd` |
| Ring | aleatório: `atk%`, `hp%`, `def%`, `eff`, `efr` |
| Boots | aleatório: `atk%`, `hp%`, `def%`, `spd`, **`focus`**, **`vigor`** |

Botas deixam de ser "o slot de `spd`" e passam a ser o slot de **eixo de build**: velocidade, ação ou reação. Distribua os pesos de forma equilibrada — não repita o erro do E7, onde botas sem `spd` são lixo.

### 7.2 Instância de item

```ts
interface ItemInstance {
  id: Id; setId: Id; slot: GearSlot;
  rarity: 'common'|'rare'|'heroic'|'epic';   // substats iniciais: 1/2/3/4
  ilvl: number;                               // 58..100
  mainstat: { stat: StatKey; value: number };
  substats: Array<{ stat: StatKey; value: number; rolls: number }>;  // máx 4
  enhance: number;                            // 0..15
  lockedBy?: HeroId;
  reforged: boolean;
}
```

### 7.3 Upgrade (o loop de endgame)

- **Enhance +0 → +15.** Em `+3, +6, +9, +12, +15`: adiciona um substat novo se houver menos de 4; senão **rola um substat existente** para cima, valor sorteado em `[min, max]` da tabela do stat naquele `ilvl`.
- Chance de sucesso decrescente (`+0→+3` 100%, `+9→+12` 65%, `+12→+15` 40%). Falha **não destrói** o item, só consome recurso.
- **Reforge** em `enhance=15` e `ilvl=100`: bônus fixo garantido em todos os substats, uma vez por item.
- Substats vêm de `data/items/substat-weights.json`. Nunca hardcoded.
- Toda rolagem usa `rngFor(seed, 'gear', itemId, enhanceStep)` — reprodutível e verificável server-side.

### 7.4 Sets

Mínimo para o M4 — 2 peças dão stat, 4 peças mudam comportamento:

| Set | Peças | Efeito |
|---|---|---|
| Ataque | 4 | `+35% atk` |
| Vida / Defesa | 2 | `+20% hp` / `+20% def` |
| Velocidade | 4 | `+25% spd` |
| Crítico | 2 | `+12% chc` |
| Perfuração | 2 | `+20% pen` |
| Vampiro | 4 | `+20% lifesteal` |
| **Duelista** | 4 | Contra-atacar custa 0 PP na primeira troca. |
| **Reserva** | 4 | `+1 AP` máximo e `rest` recupera `+2 AP`. |
| **Sentinela** | 4 | Assistir custa 0 PP uma vez por round de mapa. |
| Imunidade | 4 | Imune a debuffs na troca 1 do duelo. |

Os três sets em negrito atacam diretamente a economia de recursos — são o que dá identidade ao sistema e o principal contrapeso a builds de `spd`.

### 7.5 Poder de Combate (CP)

Métrica única e transparente, exibida na UI e usada para matchmaking. **Nunca** usada dentro da simulação.

```
CP = (atk × 1.6 + def × 2.2 + hp × 0.3)
   × (1 + chc/1000 × chd/1000)
   × (1 + spd/4000)                      // peso reduzido: spd é ordinal
   × (1 + focus/1200 + vigor/1500)
   × (1 + eff/2000 + efr/2000)
```

---
