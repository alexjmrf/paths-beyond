<!-- Milestones, critérios de aceite, decisões em aberto -->
## 13. Roadmap por milestones

### M0 — Fundação
Monorepo, TS strict, Vitest, Zod, CI.
**Aceite:** `pnpm test` e `pnpm validate:data` verdes; CI falha se achar `Math.random` em `core`.

### M1 — Núcleo determinístico
Ponto fixo, PRNG, agregação de stats (§4.1), schemas de herói/classe/skill/item.
**Aceite:** stat sheet de um herói fixo bate com snapshot; 1000 execuções do PRNG com a mesma seed dão sequência idêntica.

### M2 — Duelo headless (o mais importante)
Interpretador de tactics, trocas, AP/PP, reações, assistências, ordem de duelo, fórmula de dano, efeitos.
**Aceite:** `sim-cli duel A.json B.json --seed 42` imprime troca a troca com a linha do script que disparou; mesma seed → hash idêntico; teste cobrindo **cada** variante de `Condition` e cada regra de recurso (limite de 2 AP, contra-ataque sem PP, teto de 2 assistências).

### M3 — Camada de grid
Mapa, terreno, Dijkstra, ZoC, **lista de iniciativa fixa**, ações de turno, `rest`, modificadores posicionais, valor, vitória/derrota.
**Aceite:** batalha completa jogada via `BattleCommand[]` em teste sem UI; replay reproduz estado final idêntico; teste provando que buff de `spd` **não** reordena a iniciativa.

### M4 — Equipamento
Geração, enhance, substats, sets, reforge, CP.
**Aceite:** 100.000 itens gerados respeitam a distribuição de pesos declarada (±2%); enhance com seed fixa é reproduzível.

### M5 — Classes e talentos
Árvores, promoção, choice nodes, patch de skills, builds compartilháveis.
**Aceite:** alocar/resetar altera stat sheet e skills de forma reprodutível; validação rejeita alocação inválida (gate de linha, exclusividade).

### M6 — Cliente jogável
Pixi + React: mapa, movimento, **preview de duelo**, animação, painel de recursos, inventário, árvore, editor de táticas.
**Aceite:** campanha de 3 mapas jogável ponta a ponta; resultado exibido idêntico ao simulado no core.

### M7 — PvP assíncrono
Fastify, Postgres, times de defesa com IA declarativa, matchmaking por CP/ELO, replays.
**Aceite:** resultado do servidor idêntico ao do cliente em 1000 partidas de fuzz; manipulação de stats no cliente é rejeitada.

### M8 — Conteúdo e balanceamento
`tools/balance`, matriz de winrate, relatório de distribuição de stats, temporadas, loja de arena.
**Aceite:** toda composição dentro da faixa de **40–60%** de winrate global em 10.000 partidas; **e** builds vencedoras não concentram `spd` acima da mediana em mais de 60% dos casos (§6.7).

> O critério original só tinha teto ("nenhuma composição acima de 65%"). O piso entrou na
> revisão de 2026-08-28: sem ele, uma composição em 31% passava no aceite e mesmo assim
> ninguém a levaria para a arena — o roster efetivo fica menor que o nominal, que é o mesmo
> problema que o teto existe para evitar, pelo outro lado. `tools/balance/src/report.ts` já
> media os dois desde a revisão do M8 (`WINRATE_ALERT_THRESHOLD_PCT`/`WINRATE_FLOOR_THRESHOLD_PCT`);
> esta linha é a spec alcançando a ferramenta.

---

> **M9 em diante foram definidos pela auditoria de 2026-08-07**, depois que M0–M8 (o roadmap
> original) foram concluídos. Motivação registrada em `DECISIONS.md`, seção "Auditoria
> 2026-08-07". Cada milestone tem um briefing de implementação detalhado em
> `docs/milestones/` escrito **no momento em que ele vira o próximo** — não antes, porque o
> escopo dos posteriores depende do resultado dos anteriores.

### M9 — Integração de conteúdo
Loader único `packages/data` → `ContentCatalog`, consumido por cliente, servidor, `sim-cli` e
`tools/balance`. Aposentadoria do conteúdo hardcoded de `apps/client/src/data/campaign/`
(regra 4 do `CLAUDE.md`). Servidor bootando com catálogo real em vez de `EMPTY_CATALOG`.
Nenhuma mecânica nova.
**Aceite:** existe exatamente um loader no repositório e `apps/client/src/data/campaign/` não
existe mais; `pnpm balance` produz matriz **idêntica** à de antes da migração; o mesmo `Hero`
produz o mesmo hash de `StatSheet` no cliente, no servidor e no `sim-cli`.

### M10 — Profundidade do duelo
Ligar o que M2 deixou desligado: `skill.effects` aplicados dentro do duelo (buff/debuff/DoT),
dano e cura de assistência aplicados a HP de verdade, gatilhos de reação além de `onAttacked`
(`onDamaged`, `onLethal`), efeitos `special` de set (§7.4), tick de DoT/regeneração (§6.9).
Exige campo normativo de dano/cura periódico em `EffectDef` e de duração em
`EffectApplication` — hoje nenhum dos dois existe. Exige também `tools/balance` suportando
comps **multi-unidade** com assistência real: sem isso as mudanças desta milestone não são
mensuráveis.
**Aceite:** um duelo com skill que aplica debuff produz stat sheet alterado na troca seguinte,
provado por teste; assistência muda o HP final do duelo; `pnpm balance` roda com comps de
múltiplas unidades e os dois critérios de M8 continuam batendo com o motor novo.

### M11 — Objetivos de mapa e Valor
Condições de vitória além de `rout` (`seize`, `surviveRounds`, `escort`, `defend` — já têm
schema desde M3, nenhuma tem resolução), `mapSkill` com alvo em área (§5.4: cura em área,
artilharia), catálogo real de `valor-skills` resolvido de verdade por `useValor` (hoje só
gasta saldo). Sem estes, todo mapa da campanha é obrigatoriamente "mate todo mundo".
**Aceite:** uma batalha por milestone-condição termina por cada uma das 4 condições novas em
teste; `useValor` produz efeito observável no estado; `mapSkill` em área atinge mais de uma
unidade; `pnpm balance` reexecutado sem regressão nos dois critérios de M8.

### M12 — Conteúdo e campanha real
Autoria de conteúdo em cima do motor completo: campanha em capítulos (6–10 mapas, §10) com
objetivos variados, mais classes e skills, e — o ponto principal — **skills que usam os
efeitos de M10 e os objetivos de M11**. Rebalanceamento completo.
**Aceite:** campanha de 6+ mapas jogável ponta a ponta com pelo menos 3 condições de vitória
distintas; nenhuma skill do catálogo é só um número de dano; os dois critérios de M8 batendo.

### M13 — Superfície jogável completa (§11)
Fechar os requisitos duros de §11 que nenhum milestone cobriu: tela de **replay** (reprodução
passo a passo com controle de velocidade), tela de **PvP** ligando cliente ao servidor de M7
(hoje o cliente nunca chama o servidor), **persistência/save** entre mapas, e a acessibilidade
faltante (modo daltônico nos overlays, fonte escalável).
**Aceite:** um `Replay` gravado é reproduzido passo a passo na UI e bate com o resultado do
core; uma partida de PvP é iniciada, resolvida e revista pelo cliente contra o servidor real;
progresso sobrevive a recarregar a página.

### M14 — Economia PvE (§10)
Masmorras de farm com foco definido (equipamento/experiência/ouro/chefe), energia de conta,
progressão de awakening (0–6) e imprint, e as três moedas (`ouro`, `pedras`,
`marcas de arena`). A loja de PvP (M8) já existe e continua valendo a regra: vende gear de set
e cosmético, **nunca poder bruto**.
**Aceite:** um ciclo completo de farm → drop → enhance → equipar → subir de poder é jogável;
energia limita o farm diário; nenhuma moeda compra poder bruto.

---

> **M15 e M16 foram definidos pela auditoria de 2026-08-14**, após a conclusão do M14.
> Fundamentação em `DECISIONS.md`, seção "Auditoria 2026-08-14".

### M15 — Fechamento do loop de PvP e pendências
Tela de montar time de defesa de arena no cliente — `PUT /me/defense` existe desde M7
(`apps/server/src/battle/routes.ts:162`) e **nenhum código do cliente jamais o chamou**, o que
torna o PvP assíncrono inalcançável pelo jogador apesar de servidor, ELO, matchmaking,
replays e anti-cheat estarem prontos. Mais as pendências herdadas de M11/M14 que ainda têm
efeito observável: `lifesteal` inerte, `summonReinforcement` sem resolução, "+2 Valor ao
capturar objetivo" sem ponto de aplicação, e `Tile.object` declarado com 5 valores mas com
leitor só para 2 e sem nenhum uso no conteúdo.
**Aceite:** um jogador monta a defesa pelo cliente, ela persiste, e um segundo jogador a
enfrenta e vê o replay — o ciclo de PvP fecha ponta a ponta sem `curl`; `lifesteal` altera HP
em teste; nenhum `kind` de valor-skill rejeita por falta de implementação.

### M16 — Linguagem visual programática
Direção de arte **definitiva** do jogo, e a primeira milestone a tratar apresentação como
sistema. Zero assets raster: silhueta/glifo vetorial por classe (hoje toda unidade é um
retângulo com texto), legibilidade de estado (AP/PP, efeitos ativos, ameaça, objetivos) e
animação com peso. Constrói **sobre** `apps/client/src/data/overlayTheme.ts`, o sistema de
tema que M13 4/N já criou para o modo daltônico — generalizar aquilo em tokens, não começar
paleta do zero. O renderer ganha uma costura trocável de representação de unidade, para que
uma camada de sprite possa entrar por cima no futuro sem reescrever `MapCanvas.tsx`.
**Aceite:** nenhum arquivo de imagem entra no repositório; o grid, as unidades e o estado de
batalha são legíveis sem hover e sem legenda, validado pelo usuário no browser; **a garantia
de daltonismo de M13 4/N continua valendo** (marca própria por overlay, não só cor) e é
reverificada, não assumida; a costura de representação de unidade existe e tem uma segunda
implementação de teste provando que é trocável.

---

> **M17 foi definido pelo usuário em 2026-08-28**, ao reposicionar o design depois de fechar o M16.
> Briefing: `docs/milestones/M17-personagens-e-talentos.md`. Forma normativa da árvore em §8.2.

### M17 — Personagens e a árvore de duas colunas
O jogo passa a se basear em **personagens**, não em classes. A classe continua guiando status e
parte do que o personagem faz (curva de stat, `moveType`, armas, pools, skills de partida) mas
deixa de ser a unidade de progressão: a **árvore de talentos passa a ser do personagem**, com duas
colunas de 5 a 9 linhas, um nó por linha, a coluna amarrando a linha seguinte, e uma coluna do
meio ocasional cujo nó é a porta que libera trocar de lado. Orçamento de pontos = profundidade.
Junto entra a simplificação que a mudança revelou: **inimigo de fase deixa de ser um `Hero` com
classe, nível, equipamento e talentos** e passa a ser autorado direto, com status e skills
escolhidos para a dificuldade pretendida.
**Aceite:** um personagem aloca a árvore de duas colunas ponta a ponta pelo cliente, com a
amarração impedindo escolha ilegal e a convergência liberando a troca; nenhum inimigo de campanha
ou masmorra passa por `Hero`/classe; `pnpm balance` reexecutado com os dois critérios do M8 de pé;
`RULES_VERSION` sobe e o servidor rejeita replay de versão anterior com 409.

---

> **M18 foi definido pelo usuário em 2026-09-02**, sobre o rumo de aquisição que `DECISIONS.md`
> registrava desde 2026-08-28. Briefing: `docs/milestones/M18-aquisicao-de-personagens.md`.

### M18 — Aquisição de personagens
A economia de M14 já tinha a forma inteira de um gacha — `imprint` alimentado por fragmento,
`awakening`, três moedas, energia limitando o farm — e o que faltava era a **aquisição**. O elenco
fechado de M17 parte em **núcleo de história** (quatro garantidos a todo jogador: Aren, Miron,
Sylla e Vesper) e **adquiríveis** (Wren, Bardan, Kaia, Rurik e Nyra), e a campanha deixa de nomear
a party para declarar **vagas**, no padrão que as masmorras de M14 já usam — sem isso, posse não
significa nada, porque o capítulo entrega o personagem que o banner venderia. Entra uma **quarta
moeda, premium**, que não se ganha farmando e não paga evolução de personagem: as fontes são
história, primeira completude, achievements, eventos e dinheiro real, e os sumidouros são o summon
e a compra de energia extra. A rolagem vive em `packages/gacha`, pacote novo — §15 continua
literal, o gacha **não** toca em `packages/core`. Junto vem o buraco de segurança que a mudança
expõe: **nenhuma rota pergunta hoje se o jogador possui o personagem que mandou**.
**Aceite:** um jogador novo começa com o núcleo, puxa um personagem pelo cliente gastando a moeda
premium e o usa, com a duplicata virando fragmento e o pity garantindo na rolagem N+1; o servidor
recusa arena e masmorra com personagem não possuído; nenhum capítulo nomeia a party e a campanha é
zerável só com os quatro do núcleo; as quatro fontes da moeda premium concedem uma única vez cada
e os dois sumidouros gastam; `pnpm balance` reexecutado com os dois critérios do M8 de pé.

---

> **M19–M24 foram PROPOSTAS pelo agente em 2026-09-03**, a pedido do usuário, depois de uma auditoria
> do repositório (não da documentação). **Elas precisam ser ratificadas pelo usuário antes de
> qualquer uma ser aberta** — M17 e M18 nasceram os dois de "definido pelo usuário", e esta seção não
> muda essa regra. As decisões que as sustentam estão em `DECISIONS.md`, seção "Em aberto (levantadas
> pelo usuário em 2026-09-03, ao definir plataforma alvo e sempre-online)", itens A–G.
>
> **O diagnóstico que ordena estas seis, em uma frase:** o jogo está **completo o bastante em
> mecânica para ser testado e incompleto o bastante em infraestrutura para ser impossível de
> publicar** — 1.831 testes, 8 pacotes, motor determinístico validado em três engines, e ao mesmo
> tempo nenhuma conta de verdade jamais existiu, nenhum dado sobrevive a um reinício do servidor e
> nenhuma build jamais foi instalada em máquina nenhuma. As milestones anteriores construíram o
> JOGO; estas seis constroem o PRODUTO, e a ordem não é gosto: cada uma torna a seguinte testável
> de verdade, e as duas primeiras são pré-requisito de qualquer teste com um jogador real.

### M19 — Persistência e operação do servidor
**A milestone que existe porque hoje o servidor de produção perde dados do jogador a cada
reinício.** `apps/server/src/index.ts` monta `createMemoryEconomyRepository()` — materiais,
inventário e limpezas de masmorra vivem em RAM desde M14 3/N, enquanto todos os outros sete
repositórios já são de Postgres. Não é achado novo (a 3/N o registrou e pôs comentário no arquivo);
o que mudou é que sempre-online promove isso de anomalia a **bloqueio duro**, porque o servidor
deixou de ser um validador de PvP e passou a ser a única fonte de verdade que existe. **A boa
notícia é que a parte cara já está feita:** a migration `0007_pve_economy.sql` já criou
`player_materials`, `player_items`, `dungeon_clears`, `dungeon_entries` e `dungeon_runs` — o schema
existe, falta a implementação do repositório. Junto entra o que faltava para o serviço ser
operável: o servidor inteiro tem **uma única linha de log**, o que significa que uma falha em
produção hoje é invisível. Entram logging estruturado por requisição, erro com contexto, e o
procedimento de backup/restore exercitado de verdade e não presumido.
**Aceite:** `apps/server/src/index.ts` não instancia **nenhum** repositório de memória; um teste de
integração prova que material, item de inventário e limpeza de masmorra sobrevivem a reiniciar o
processo; toda rota emite log estruturado com id de jogador e desfecho; um restore a partir de
backup é executado e documentado, com a suíte passando contra o banco restaurado; `pnpm test` segue
verde e o repositório de memória continua existindo **para os testes e o `devServer`**, que é o uso
para o qual ele foi escrito.

---

### M20 — Identidade de plataforma
**Hoje o jogador digita o próprio identificador numa caixa de texto.** `x-player-token` é um token
opaco declarado como stub em M7, e era a decisão certa enquanto o servidor só arbitrava arena. Com
sempre-online, economia real e uma moeda que se compra com dinheiro, ele é ao mesmo tempo o
mecanismo de autenticação e o mecanismo de personificação: quem souber o token de alguém É essa
pessoa. Entra identidade de plataforma — ticket de sessão da Steam validado no servidor contra a
Steam Web API, o equivalente da Epic via EOS — que tem a propriedade de não guardar credencial
nenhuma do nosso lado. **E entra o ciclo de vida de conta, que não existe:** o projeto nunca teve
rota de criação; a 6/N resolveu isso derivando o núcleo preguiçosamente em `GET /me/heroes`, o que
foi a decisão certa para aquela fatia e não é uma resposta para "o que acontece quando alguém
compra o jogo". Entram também exclusão e exportação de conta, que deixam de ser opcionais quando
existe conta de verdade.
**Aceite:** um jogador novo chega do zero pela identidade da plataforma, sem digitar nada, e recebe
o núcleo de quatro; nenhuma rota aceita mais o token digitado; existe criação de conta explícita e
o comportamento preguiçoso da 6/N ou é substituído ou é declarado como o caminho oficial, com o
motivo escrito; exclusão de conta remove o jogador de todas as tabelas e é testada; a suíte de
servidor roda sem depender da Steam (o validador é injetado, no mesmo padrão de `now` e `newNonce`).

---

### M21 — O shell desktop e o pipeline de release
**A primeira vez que o jogo vira uma coisa que se instala.** O §2 de
`01-fundacoes-tecnicas.md` diz "não usar engine pesada" e nunca nomeou empacotamento, porque quando
foi escrito o alvo era implicitamente o browser; com desktop declarado, a escolha de shell passa a
ser normativa. **A recomendação registrada é Electron, e o argumento é do próprio projeto:** o
servidor roda Node (V8) e re-simula todo replay; Electron embute Chromium (V8) numa versão que nós
congelamos, então cliente e servidor comparam hash na mesma engine. Tauri usaria a webview do
sistema — JavaScriptCore no macOS e no Linux/Steam Deck — e reintroduziria em produção exatamente a
divergência de runtime que o ponto fixo e o job `determinismo-navegadores` existem para eliminar.
Junto entram Steamworks e o pipeline: os **10 achievements já autorados** em
`packages/data/achievements/` ganham espelho na plataforma, e o CI passa a produzir um instalável.
**Nota de escopo:** `HANDOFF.md` já teve um item "shell desktop (Electron + steamworks.js)",
removido em 2026-08-28 por não ser o escopo do M9 real — o motivo da remoção venceu.
**Aceite:** existe build instalável para as plataformas alvo, produzida pelo CI e não à mão; o teste
de determinismo roda **dentro do runtime empacotado** e o hash bate com o do servidor, o que é a
única prova que importa (o job atual prova navegadores, não o shell); auto-update funciona de uma
versão para a seguinte; os 10 achievements do catálogo concedem na plataforma e continuam
retroativos como a 4/N os desenhou; a decisão Electron vs Tauri está escrita em §2 com o argumento,
não só com o resultado.

---

### M22 — Sempre-online: versão, reconexão e cobertura
**A milestone que faz sempre-online não parecer quebrado.** Três buracos, todos conhecidos e todos
registrados. **(1) Versão:** `battle/routes.ts:312` devolve um **409 seco** em mismatch de
`rulesVersion`; na web isso nunca aparecia porque todo mundo recarregava, no desktop jogadores rodam
versões diferentes por dias, e com sempre-online o mismatch não mata só a arena — mata o jogo
inteiro, porque toda batalha faz round-trip. Precisa de tela de atualização acionável e de uma
decisão sobre aceitar `N-1` na janela de rollout. Junto fecha o vizinho já registrado no M17 5/N:
`POST /dungeons/:id/run` reexecuta `commands` do cliente e **não tem campo `rulesVersion`**, então
não há o que validar. **(2) Reconexão:** a primitiva certa já existe e é genérica — o nonce de
`economy_actions`, `dungeon_runs` e `replays` —, mas o cliente não guarda o nonce em voo, então uma
queda de conexão no meio de uma run pode comer energia já debitada. **(3) Cobertura de rate limit:**
`tryConsume` é chamado por seis rotas e **todas são de batalha**; `POST /summon`,
`POST /shop/purchase`, `POST /energy/purchase`, `POST /rewards/:id/claim` e as quatro de progressão
não consomem do limitador. O nonce protege contra reenviar a **mesma** requisição, não contra mil
**diferentes** — ou seja, as rotas que tocam a moeda comprável com dinheiro real são justamente as
abertas. O limitador é em memória, portanto por processo: o `RateLimiter` já é interface, e trocar
por uma implementação compartilhada (o §2 já prevê Redis e ele nunca entrou) não mexe em rota
nenhuma.
**Aceite:** mismatch de versão produz tela acionável no cliente e nunca um erro cru, com a política
`N-1` decidida e escrita; `POST /dungeons/:id/run` valida `rulesVersion` como `/battles` já faz;
derrubar a conexão no meio de uma run e reconectar não cobra duas vezes nem perde a run, provado por
teste; **toda** rota que debita recurso consome do limitador, com um teste que falha se uma rota
nova esquecer; existe implementação compartilhada do `RateLimiter` e a troca não exigiu tocar em
nenhuma rota.

---

### M23 — A primeira sessão de um jogador de verdade
**Ninguém nunca jogou este jogo sem saber como ele funciona.** Todo teste de ponta a ponta até aqui
partiu de conta semeada, fixture ou `devServer`; com M20, contas novas passam a existir de verdade,
e esta é a milestone que descobre o que um estranho não entende. O jogo tem duelo automático com
scripts táticos programados antes do combate, economia de AP/PP que dura a batalha inteira,
assistência por adjacência, árvore por personagem e gacha — **é muita regra para descobrir sozinho**,
e o pilar "legibilidade tática" de §1.1 exige que o jogador consiga prever o resultado antes de
confirmar. Esta milestone é o teste desse pilar com alguém que não escreveu a spec. Segue o
precedente do critério 2 do M16: **estética e compreensão são julgadas pelo usuário, não
autocertificadas pelo agente.**
**Aceite:** uma conta criada do zero joga o capítulo 1, faz o primeiro summon, equipa, aloca talento
e entra na arena **sem ninguém tocar no banco** e sem instrução fora do jogo; a introdução explica
duelo, AP/PP e script tático no ponto em que cada um aparece pela primeira vez, e não num paredão de
texto inicial; **validado pelo usuário observando alguém que nunca viu o jogo**, com o veredito
sendo dele; nenhuma tela exige conhecimento que o jogo não deu.

---

### M24 — Áudio
**O projeto tem zero som — nenhum arquivo, nenhuma biblioteca, nenhuma chamada.** Não é omissão de
autoria, é ausência de camada: `grep` por `Audio`, `howler` ou `WebAudio` em `apps/client/src`
devolve nada. Para um jogo tático em que o duelo é automático e o jogador assiste ao resultado da
decisão que tomou antes, o som não é enfeite — é metade da leitura de impacto que M16 construiu no
visual com peso e timing (`motion.ts`). Entram camada de áudio, mixagem por categoria e os
controles, que caem exatamente no lugar certo: depois da 7/N, o save local é **só preferências de
apresentação**, que é precisamente o que volume é.
**Aceite:** golpe, contra-ataque, morte, cura e as transições de turno têm som, sincronizados com as
batidas que `motion.ts` já define; existem controles separados de música e efeitos, persistidos no
`SaveGame` v2 ao lado de `uiScale` e `colorblindMode`; o áudio respeita as pausas entre cenas
(`SCENE_GAP_MS`) em vez de virar borrão quando várias unidades agem em sequência; nenhum asset de
áudio quebra o teste `semAssetsRaster.test.ts`, que é sobre imagem — se ele precisar de ajuste, o
ajuste é declarado e não silencioso.

---

### Horizonte — o que NÃO virou milestone, e por quê

Quatro frentes reais que **não foram escritas como milestone de propósito**, porque cada uma depende
de uma decisão do usuário que ainda está aberta. Escrever critério de aceite para elas agora seria
inventar a decisão junto.

- **Arte 2.5D / 3D.** Aberta desde 2026-08-28, em `DECISIONS.md`: o usuário declarou querer sprite
  2.5D ou 3D, e o critério 1 do M16 ("nenhum arquivo de imagem entra no repositório") ainda está
  escrito como definitivo. **A costura já existe** (`UnitRenderer`, M16 1/N, com teste de contrato
  provando que é trocável), então isto é uma camada por cima e não uma reescrita — mas o tamanho da
  milestone depende inteiramente de qual das duas direções é escolhida.
- **Volume de conteúdo.** Seis capítulos, sete mapas, nove personagens e 41 inimigos são um
  **piloto jogável, não um jogo publicável**. Quanto conteúdo entra depende do modelo de negócio,
  que é o item F.
- **Localização.** A UI é português cru no código (`Esperar`, `Descansar (+1 AP +1 PP)` direto no
  JSX). Não há camada de i18n. Para uma loja global isso é trabalho próprio, e o custo cresce a cada
  tela nova — vale decidir cedo **se** haverá outro idioma, mesmo que a implementação venha tarde.
- **Monetização real.** §15 declara integração de pagamento fora de escopo e D15/D19 fecharam *que*
  o jogo é um gacha — mas **não** se ele é pago ou F2P (item F). Sempre-online + gacha + moeda
  premium + jogo pago na Steam é a combinação que aquela comunidade pune com mais força; F2P é o que
  o gênero espera. A decisão muda o desenho da moeda, o volume de conteúdo exigido e a página da
  loja, e sai mais barata agora do que depois de mais banner autorado.

**Uma pendência de processo, que não é milestone e é do usuário:** a árvore tem **47 arquivos não
commitados** cobrindo as sub-sessões 6/N e 7/N, e o último commit é o da 5/N. Duas sub-sessões
inteiras de trabalho existem só na máquina local. Nenhum roadmap conserta isso.

---

## 15. Decisões em aberto (registrar em `DECISIONS.md` ao resolver)

- **`MAX_TROCAS = 3`** é um chute inicial. Com 2, o duelo vira "quem bate primeiro"; com 4+, o preview fica ilegível e `spd` volta a dominar. Teste 3 antes de mexer.
- **Limite de 2 AP por duelo:** se na prática ninguém chegar perto do limite, ele é decoração — reduza os pools base em vez de aumentar o limite.
- **Alcance de assistência:** começar em 2 tiles para melee e `duelRange` para ranged. Se assistências dispararem em mais de 70% dos duelos, elas viraram obrigatórias e não decisão — encareça o custo em PP.
- **Duelo ranged unilateral (§6.1):** é forte de propósito. Se arqueiros dominarem, a correção é reduzir o dano deles, não permitir contra-ataque — a assimetria é o que dá identidade tática ao alcance.
- **Permadeath:** sugestão de `classic` como padrão, com `casual` disponível desde o início.
- **Monetização:** ~~fora do escopo~~ — **resolvido no M18** (2026-09-02): o jogo é um gacha com núcleo de história, e a restrição virou D15/D19 em `DECISIONS.md`. A parte que continua valendo ao pé da letra: o gacha **NÃO** toca em `packages/core` — a rolagem vive em `packages/gacha`. Integração de pagamento segue fora do escopo.
