---
paths:
  - "packages/core/src/duel/**"
  - "packages/core/src/tactics/**"
  - "packages/core/src/battle/**"
---

# Regras do duelo e da iniciativa

Leia `docs/spec/04-duelo.md` inteiro antes de tocar nestes diretórios.

## Não negocie estes pontos

- O algoritmo de decisão do script tático é **literal**: percorre as linhas de cima para baixo, pula as inválidas, executa a primeira que passa. Sem heurística, sem busca, sem "escolher a melhor skill". Previsibilidade é o produto.
- **AP e PP são pools da batalha inteira**, não do duelo, e não regeneram passivamente.
- Teto de **2 AP por duelo** por unidade, mesmo com pool sobrando.
- Contra-atacar custa **1 PP**. Máximo **1 PP por troca**. Máximo **2 assistências por lado** por duelo.
- `MAX_TROCAS = 3`.
- A lista de iniciativa é calculada **uma vez no início da batalha** e nunca recalculada. Buff de `spd` não reordena.
- `spd` concede exatamente: posição na iniciativa, preempção no duelo com limiar de 1,15×, e evasão com cap de +150. **Nada mais.** Se você acha que precisa de um quarto benefício, pare e pergunte.

## Testes obrigatórios ao mexer aqui

- Um por variante de `Condition`.
- Um por regra de recurso: teto de 2 AP, contra-ataque sem PP, teto de assistências, 1 PP por troca.
- Um que buffa `spd` em +500 no meio da batalha e verifica que a lista de iniciativa **não** mudou.
