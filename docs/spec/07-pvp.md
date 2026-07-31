<!-- Modos, segurança, balanceamento -->
## 9. PvP (planejar agora, entregar no M7)

Nada pode precisar ser reescrito para ligar o PvP: núcleo determinístico, comandos serializáveis, zero regra no cliente.

### 9.1 Modo 1 — Arena Tática (assíncrona, o modo principal)

- O defensor monta um time de até 5 heróis, posiciona-os em um mapa simétrico pequeno (**9×11**), define o `tacticsScript` de cada um e uma **IA de mapa declarativa** por herói: `aggressive | hold-position | guard-tile | flank | support-nearest`.
- O atacante joga a camada de grid manualmente contra essa defesa. Todos os duelos resolvem automaticamente pelos scripts dos dois lados.
- Servidor executa `simulate()` com o **mesmo pacote `core`**; o cliente simula só para animar. Divergência = bug crítico.
- ELO, temporadas de 14 dias.

### 9.2 Modo 2 — Coliseu (totalmente automático)

Ataque e defesa rodam por IA declarativa. Serve para ranking passivo, recompensa diária e — principalmente — como **motor de balanceamento** (`tools/balance` reusa este modo).

### 9.3 Modo 3 — Tempo real (futuro, não implementar)

Se um dia existir: mesma simulação, lockstep com input delay. A arquitetura de comandos já suporta. **Não desenhe nada dependente de tempo real agora.**

### 9.4 Segurança (aplicar desde o M1)

| Requisito | Implicação |
|---|---|
| Servidor autoritativo | Cliente envia `BattleCommand[]`; servidor simula e devolve o resultado. |
| Zero RNG no cliente | Seed vem do servidor. |
| Estado de conta recalculado | Servidor recalcula stat sheets a partir do inventário no banco; nunca aceita stats do cliente. |
| Versionamento | `rulesVersion` no replay; recusar replays de versão diferente. |
| Anti-replay | Nonce por partida + rate limiting. |

### 9.5 Balanceamento de PvP

- **Cap de CP por tier** de arena.
- Vantagem do atacante existe (ele escolhe os engajamentos), então a defesa recebe: **+1 AP inicial por herói** e o bônus de terreno do mapa. Ajustar via `tools/balance` até o winrate do atacante ficar em **52–58%**.
- `tools/balance` roda ≥10.000 partidas entre composições e emite matriz de winrate **e** um relatório de distribuição de stats das builds vencedoras (para checar o alerta de `spd` da seção 6.7). Nenhum ajuste de número entra sem esse relatório.

---
