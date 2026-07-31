<!-- Visão e pilares -->
## 1. Visão do produto

O jogador comanda um exército de **heróis individuais** em batalhas táticas em grid. Cada peça no tabuleiro é um herói — posicionamento, alcance de movimento e zona de ameaça funcionam como em Fire Emblem.

Quando dois heróis se enfrentam, abre-se um **duelo**: um confronto automático de até 3 trocas, resolvido por **scripts táticos** que o jogador programa antes da batalha, limitado por uma **economia de recursos (AP/PP) que dura a batalha inteira**. O jogador não dá input durante o duelo. Ele decide *quem ataca quem, de onde, com quais recursos disponíveis e sob quais regras*.

A profundidade que em Unicorn Overlord vem da composição de esquadrão, aqui vem de duas fontes:
- **Assistências**: aliados próximos com PP disponível intervêm no duelo automaticamente, conforme seus próprios scripts. Posicionamento no grid vira composição de encontro.
- **Economia de recursos escassos**: AP e PP não regeneram sozinhos. Cada skill gasta de um pool que precisa durar o mapa inteiro.

Fora da batalha, o jogador constrói heróis com **equipamento com substats aleatórios** (Epic Seven) e **árvores de talento com escolhas exclusivas** (World of Warcraft). O **PvP** é a validação final da build.

### 1.1 Pilares de design (usar para resolver ambiguidades)

| Pilar | Significado prático |
|---|---|
| **A decisão acontece antes do combate** | Erro de build, posicionamento, script ou gasto de recurso é punido. Não há input reativo durante o duelo. |
| **Recurso escasso > stat alto** | Vencer é saber quando *não* gastar. Nenhum sistema pode permitir spam da melhor skill. |
| **Determinismo total** | Mesmo estado inicial + mesma seed + mesmos comandos = mesmo resultado em qualquer máquina. É o que viabiliza PvP assíncrono e replays. |
| **Tudo é data-driven** | Nenhuma classe, skill, item, mapa ou inimigo é hardcoded. |
| **Legibilidade tática** | O jogador DEVE conseguir prever o resultado antes de confirmar: preview do duelo, zona de ameaça, lista de iniciativa e pools de recurso sempre visíveis. |
| **Nenhum stat pode ser obrigatório** | Se um stat vira pré-requisito de toda build, ele é um bug de design. Vale especialmente para `spd` (seção 6.7). |

---
