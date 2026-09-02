# M18 — Aquisição de personagens (briefing de implementação)

> Escrito em 2026-09-02, no momento em que M18 virou o próximo milestone. Complementa a entrada de
> `docs/spec/09-roadmap.md` e a §10 de `docs/spec/08-progressao-e-ui.md`, que é normativa.
> **Leia este arquivo inteiro antes de escrever qualquer código.** As decisões abaixo foram
> tomadas com o usuário em 2026-09-02 — não as reabra sem um motivo técnico novo.

## 1. Por que este milestone existe

O roadmap terminava no M17. A aquisição de personagens estava registrada em `DECISIONS.md` desde
2026-08-28 como **rumo** e não como decisão implementável ("nada disto entra em código até virar
milestone com briefing"), e o usuário abriu o M18 sobre ela em 2026-09-02.

**Isto não é uma virada de direção: é nomear o que o projeto já é.** A economia de M14 foi
construída com a forma inteira de um gacha antes de alguém decidir que era um — `imprint` 0–5
alimentado por fragmento, `awakening` 0–6, três moedas, energia limitando o farm diário. A peça
que falta é só a **aquisição**.

E ela chega com um buraco de segurança medido, não suposto: **posse de personagem não existe em
lugar nenhum do projeto.** `HeroRepository.listHeroesByOwner` devolve os heróis semeados no banco,
e nenhuma rota pergunta "o jogador tem este personagem?". Um cliente adulterado joga a arena com
quem nunca puxou, e §9.4 ("o servidor recalcula a partir do banco; nunca aceita stats do cliente")
não tem como pegar isso, porque não há o que consultar.

## 2. As decisões, já tomadas

**D14 — O elenco parte em núcleo de história e adquiríveis.** Quatro garantidos a todo jogador —
**Aren** (`hero-jogador`, espadachim), **Miron** (`ally-clerigo`), **Sylla** (`ally-arqueiro`) e
**Vesper** (`ally-arcanista`) —, cinco adquiríveis — **Wren** (`ally-mensageira`), **Bardan**
(`ally-couracado`), **Kaia** (`ally-grifeiro`), **Rurik** (`ally-guerreiro`) e **Nyra**
(`ally-lanceiro`).

O corte não foi escolhido: foi **lido da campanha como ela já está autorada**. Aren aparece no
capítulo 1, Miron no 2, Sylla no 3, Vesper no 4 — exatamente o "começa com 2 ou 3 e chega a cerca
de 4 garantidos" que o usuário descreveu. Wren só aparece no capítulo 5 e Bardan só no 6: os dois
já tinham a forma de "encontrado, não dado", e `DECISIONS.md` os nomeou como candidatos naturais em
2026-08-28. Kaia, Rurik e Nyra **não aparecem em capítulo nenhum** — existem desde D7 só para as
comps da arena, e são adquiríveis puros.

**O núcleo é o que salva a afinação da campanha.** Sem ele um capítulo não teria como ser afinado,
porque a party seria desconhecida. Com quatro garantidos, a campanha é afinada contra **eles**, e
o que vier de summon é poder opcional por cima.

**D15 — A rolagem mora em `packages/gacha`, pacote próprio.** §15 é literal e continua valendo:
"se houver gacha, ele **NÃO** toca em `packages/core`". O pacote novo é puro, determinístico e em
ponto fixo — as mesmas regras do core, fora dele. Ele **importa** `@paths-beyond/core` para o RNG
e a matemática de ponto fixo; o core continua não importando nada, e a seta aponta para dentro.

A alternativa descartada foi pôr a rolagem em `apps/server/src/summon/`: leitura mais literal de
"a rolagem de banner é servidor", mas deixa a regra onde só um consumidor a alcança e faz o teste
de determinismo depender de subir uma rota.

**D16 — A campanha deixa de nomear a party e passa a declarar vagas.** É o que faz posse
significar alguma coisa: sem isso, ter ou não ter Wren não muda nada, porque o capítulo 5 a
entrega. O padrão já existe no projeto — as masmorras de M14 declaram vagas
(`dungeon-covil-do-tirano-vaga-1`) e o jogador leva quem tem. Os seis capítulos passam a declarar
N vagas, e a campanha tem de ser zerável só com o núcleo de quatro.

**D17 — Entra uma QUARTA moeda, premium, e as três de hoje ficam como estão.** `pedras` continua
sendo moeda de farm que dropa de masmorra e paga `enhance`; a premium **não se ganha farmando**.

- **Fontes:** avanço de história, primeira completude de fase/missão, achievements, eventos e
  dinheiro real.
- **Sumidouros:** o summon e a **compra de energia extra** — quem quiser farmar mais.
- **Ela não paga evolução de personagem.** Awakening e imprint continuam em ouro e material; o
  jogador não compra poder bruto com a moeda premium, que é a mesma linha que §10 já traça para a
  loja de arena ("nunca poder bruto").

Isto muda a spec: §10 lista três moedas fechadas. A quarta entra registrada, não em silêncio.

**D18 — Pity duro contado.** Depois de N rolagens sem personagem novo, a rolagem N+1 é garantida. O
contador mora na conta. A escolha é por **testabilidade**: pity duro é uma propriedade
("a rolagem N+1 nunca falha"), e taxa pura sem garantia só é afirmável como estatística sobre
muitas seeds — que é exatamente o tipo de teste que a regra 5 do projeto evita.

**D19 — Dinheiro real fica fora.** §15: "monetização fora do escopo". O M18 entrega a moeda e
todas as fontes de jogo; a compra com dinheiro real existe como um caminho de crédito que só o
servidor pode chamar, sem gateway, sem integração e sem tela.

**D20 — Achievements e eventos entram no M18**, por decisão do usuário, e não ficam para depois.
São dois sistemas que não têm hoje nem schema nem consumidor, e são duas das quatro fontes da
moeda premium — sem eles a moeda entra pela metade.

## 3. O que a mudança quebra, medido no código de hoje

Levantado antes de escrever este briefing, não estimado:

1. **Não há posse.** `Player` (`apps/server/src/repository/types.ts`) tem `elo`, `arenaMarks`,
   `gold`, `stones`, `energy` — e nenhum conceito de roster. Nem o save do cliente
   (`apps/client/src/logic/save.ts`) tem.
2. **Existe UM material de fragmento para NOVE personagens.** `packages/data/materials/` tem
   `material-fragmento-hero-jogador` e mais nada. O `imprint` dos outros oito não tem como ser
   pago hoje — a duplicata do gacha é justamente o que preenche isso.
3. **Os capítulos 5 e 6 EXIGEM Wren e Bardan nominalmente**, e os dois passam a ser adquiríveis.
   Sem D16 a campanha fica injogável para quem não os puxou.
4. **`/battles` e `/dungeons/:id/run` não checam posse** — ver §1.
5. **O progresso de campanha é save do CLIENTE.** "Avanço de história" e "primeira completude" são
   fontes de moeda, e moeda é estado de conta: o servidor precisa observar o primeiro clear. Para
   masmorra o mecanismo já existe (`EconomyRepository.listClears`/`markCleared`, M14); para
   capítulo, não.

## 4. Ordem sugerida das sub-sessões

1. **O motor da rolagem** — `packages/gacha` novo, puro, sem conteúdo. A única fatia que não
   depende de dado autorado.
2. **O dado** — `acquisition` no personagem, banners, um fragmento por personagem, o custo do
   summon e o N do pity em `economy-rules`.
3. **Posse e `POST /summon`** — repositório, migração, rotas, e o anti-cheat de §9.4 nas duas
   rotas que hoje não checam.
4. **As quatro fontes** — história, primeira completude, achievements, eventos; e o sumidouro de
   energia extra.
5. **A campanha por vagas** — os seis encontros reautorados, afinados contra o núcleo de quatro.
6. **O cliente e o fechamento** — tela de summon com pity visível, roster, escolha de vaga, e
   `pnpm balance`.

## 5. Critério de aceite (proposto — confirmar com o usuário ao abrir o milestone)

1. Um jogador novo começa com o núcleo de quatro, puxa um personagem no banner **pelo cliente**
   gastando a moeda premium, e ele aparece no roster e é jogável — sem `curl`. A duplicata vira
   fragmento do próprio personagem, e o pity garante o personagem na rolagem N+1.
2. O servidor **recusa** arena e masmorra montadas com personagem que o jogador não possui.
3. Nenhum capítulo de campanha nomeia a party: os seis declaram vagas, e a campanha é zerável
   ponta a ponta **só com os quatro do núcleo**.
4. A moeda premium tem as quatro fontes de jogo ligadas (avanço de capítulo, primeira completude,
   achievement, evento), cada uma concedendo **uma única vez**, e os dois sumidouros gastando
   (summon e energia extra).
5. `pnpm balance` reexecutado com os dois critérios do M8 de pé sobre o elenco com o pool
   adquirível.

## 6. O que NÃO fazer

- **Não tocar em `packages/core`** para a rolagem, o pity, o banner ou a posse (D15/§15). Se o
  core não mudar, `RULES_VERSION` **fica em `0.17.0`** — e isso é para ser dito na saída, não
  assumido.
- **Não usar ponto flutuante** nas taxas do banner (regra 2). Escala 1000, como todo o resto.
- **Não integrar pagamento** (D19).
- **Não reabrir o elenco fechado** (D6). Um pool de gacha é conteúdo autorado, fechado em qualquer
  instante — o pool de hoje são os cinco adquiríveis de D14.
- **Não fazer a moeda premium pagar awakening, imprint ou enhance** (D17).
- **Não inventar como o balanceamento mede um pool que cresce.** Com 9 personagens ainda é
  computável e a 6/N mede como hoje. A pergunta vira real quando o pool passar de ~12, e fica
  registrada como aberta.

### Ainda em aberto

- **Como o torneio mede um pool que cresce.** Herdado de D10: com 40 personagens depois de dez
  banners, "toda composição entre 40 e 60%" são 9.880 combinações de três. O núcleo garantido é a
  base estável; o resto fica em aberto.
- **Taxas por raridade.** Se os cinco adquiríveis entram todos com a mesma taxa ou se há
  raridade, e quais os números — a decidir na 2/N, com o usuário, ao autorar o banner.
- **O N do pity e o custo do summon** — mesma fatia, mesma conversa.
