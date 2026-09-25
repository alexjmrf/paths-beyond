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
| **Legibilidade tática** | O jogador DEVE conseguir ler o seu próprio compromisso antes de confirmar: suas skills, seus recursos, quem age em que ordem, e o estado visível do inimigo (posição, HP, AP, PP). O que o inimigo carrega — stats, skills, equipamento, scripts, alcance — é desconhecido até se manifestar. **Engajar é uma aposta informada, não um cálculo.** |
| **Nenhum stat pode ser obrigatório** | Se um stat vira pré-requisito de toda build, ele é um bug de design. Vale especialmente para `spd` (seção 6.7). |
| **O inimigo é desconhecido** | Em todo combate, PvE e PvP, o jogador vê do inimigo apenas posição, HP, AP, PP, o tipo de unidade e o lugar na iniciativa. Stats, skills, equipamento, artefatos, scripts, `moveType` e alcance ficam no servidor — e uma skill só se revela no instante em que dispara. |

> **O pilar "Legibilidade tática" foi REESCRITO em 2026-09-18 (D47/D48, M36), e a versão
> anterior desempatava para o lado errado.** Ela exigia que o desfecho do engajamento fosse
> conhecido antes de confirmá-lo, e nomeava as duas telas que o entregavam: o preview de duelo
> e a zona de ameaça. As duas saíram do jogo, porque as duas eram cálculo sobre o que o inimigo
> carrega. O que NÃO mudou é a exigência de o jogador entender o que ele mesmo está fazendo; o
> que mudou é que a incerteza sobre o outro lado passou a ser o produto, e não um defeito a
> corrigir com mais informação.

---
