<!-- Stats, ordem de agregação, entidades -->
## 4. Modelo de dados

### 4.1 Stats

| Stat | Código | Tipo | Notas |
|---|---|---|---|
| Vida | `hp` | flat | |
| Ataque | `atk` | flat | |
| Defesa | `def` | flat | |
| Velocidade | `spd` | flat | **Ordinal.** Ver seção 6.7 — benefícios enumerados e limitados. |
| Chance de crítico | `chc` | % (cap 1000) | |
| Dano crítico | `chd` | % | Base 1500. |
| Efetividade | `eff` | % | Chance de aplicar debuffs. |
| Resistência a efeito | `efr` | % | |
| Penetração de defesa | `pen` | % | Cap 700. |
| Cura dada/recebida | `heal` | % | |
| Vampirismo | `lifesteal` | % | |
| Concentração | `focus` | flat | **Substitui `cdr`.** Aumenta o pool máximo de AP a cada 100 pontos (cap +2). |
| Vigor | `vigor` | flat | Aumenta o pool máximo de PP a cada 150 pontos (cap +2). |

`focus` e `vigor` existem para dar um eixo de build alternativo a `spd` e `atk`: uma build de recurso alto pode gastar mais skills ao longo do mapa, mesmo perdendo cada duelo isolado por pouco.

**Ordem de agregação (DEVE ser exatamente esta):**

```
1. base do herói no nível N (curva no JSON da classe) × multiplicador de awakening
2. + flat de classe/promoção + imprint
3. + flat de equipamento (mainstats e substats flat)
4. × (1 + soma das % de equipamento)
5. + flat de talentos
6. × (1 + soma das % de talentos)
7. + bônus de set de equipamento (2/4 peças)
8. × (1 + buffs/debuffs ativos)      ← só dentro do duelo, não persiste no sheet
```

Passos 1–7 produzem o **stat sheet estático**; cacheie e invalide só quando equipamento/talento/nível/awakening mudarem. Passo 8 é o único recalculado dentro do duelo.

### 4.2 Entidades

```ts
interface Hero {
  id: Id;
  classId: Id;
  level: number;              // 1..60
  exp: number;
  awakening: 0|1|2|3|4|5|6;
  imprint: 0|1|2|3|4|5;
  talents: TalentAllocation;
  equipment: Record<GearSlot, ItemInstanceId | null>;
  duelSkills: Id[];           // até 5 conhecidas; o script escolhe entre elas
  mapSkills: Id[];            // até 2
  tacticsScript: TacticsScript;
}

interface UnitOnMap {          // instância viva na batalha — 1 herói = 1 tile
  unitId: Id;
  heroId: Id;
  pos: Coord;
  hp: number;
  ap: number;                  // pool de mapa; ver 6.2
  pp: number;                  // pool de mapa; ver 6.2
  initiative: number;          // fixo na batalha; ver 5.3
  hasActedThisRound: boolean;
  effects: ActiveEffect[];
  cooldowns: Record<Id, number>;  // em rounds de MAPA, não de duelo
}
```

Não existe `Squad`. Não existe formação interna. **Adjacência no grid é a formação.**

---
