<!-- Economia PvE e requisitos de UI -->
## 10. Progressão e economia (PvE)

- **Campanha** em capítulos: 6–10 mapas, diálogo, desbloqueio de heróis. **A partir do M18 o capítulo NÃO nomeia a party:** ele declara inimigos, objetivo e **vagas**, e o jogador leva quem possui — o mesmo padrão das masmorras. A campanha é afinada contra o **núcleo de história** (os personagens garantidos a todo jogador), e o que vier de aquisição é poder opcional por cima.
- **Masmorras de farm** com foco definido: Equipamento (drop por set), Experiência, Ouro, Chefe (materiais de promoção). Energia de conta limita o farm diário.
- **Awakening (0–6)**: multiplica a curva base e libera nós avançados de talento a partir de 5.
- **Imprint**: duplicatas viram bônus permanente de stat.
- **Aquisição de personagens (M18):** o elenco parte em **núcleo de história** — garantido a todo jogador, e é contra ele que a campanha é afinada — e **adquiríveis**, puxados por summon. Duplicata vira fragmento do próprio personagem, que é o que alimenta o `imprint`. **Posse é estado de conta**, e o servidor recusa qualquer batalha montada com personagem não possuído (§9.4).
- Moedas: `ouro`, `pedras`, `marcas de arena` e `pedras premium`. Na loja de PvP venda gear de set específico e cosméticos — **nunca poder bruto**.
- **A moeda premium (M18) não se ganha farmando e não paga evolução de personagem.** Fontes: avanço de história, primeira completude de fase ou missão, achievements, eventos e dinheiro real. Sumidouros: o **summon** e a **compra de energia extra**. Awakening, imprint e enhance continuam em ouro, pedras e material — pela mesma razão que a loja de arena nunca vende poder bruto.

---

---

## 11. UI/UX — requisitos funcionais mínimos

| Tela | Requisitos duros |
|---|---|
| Mapa | Overlay de movimento e de ameaça; **lista de iniciativa sempre visível** com a ordem completa do round; AP/PP de cada unidade legíveis no próprio tile (sem hover). |
| Preview de duelo | Antes de confirmar, rodar `simulateDuel` com a **seed real** e exibir troca a troca: quem age, qual linha do script disparou, dano previsto, HP final, assistências que vão entrar e recursos que serão gastos. **Este é o recurso mais importante do jogo.** |
| Editor de táticas | Drag & drop das linhas, condições em dropdown, e botão **"Testar"** contra um manequim configurável (HP, tipo, arma, PP). |
| Painel de recursos | Visão do exército inteiro: AP/PP de todos, quem pode `rest`, quem está sem PP (vulnerável a Emboscada). |
| Inventário | Filtro por set/slot/substat, comparação lado a lado, **ganho de dano real** (não só CP) ao equipar. |
| Talentos | Grafo, preview do efeito, string de build compartilhável. |
| Replay | Reprodução passo a passo com controle de velocidade a partir do `Replay`. |

Acessibilidade: fonte escalável, modo daltônico nos overlays, e **modo resultado instantâneo** (pula animações) — essencial para farm.

---
