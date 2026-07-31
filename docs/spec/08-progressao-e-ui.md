<!-- Economia PvE e requisitos de UI -->
## 10. Progressão e economia (PvE)

- **Campanha** em capítulos: 6–10 mapas, diálogo, desbloqueio de heróis.
- **Masmorras de farm** com foco definido: Equipamento (drop por set), Experiência, Ouro, Chefe (materiais de promoção). Energia de conta limita o farm diário.
- **Awakening (0–6)**: multiplica a curva base e libera nós avançados de talento a partir de 5.
- **Imprint**: duplicatas viram bônus permanente de stat.
- Moedas: `ouro`, `pedras`, `marcas de arena`. Na loja de PvP venda gear de set específico e cosméticos — **nunca poder bruto**.

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
