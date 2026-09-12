# Operação do servidor

> Escrito no M19. A partir do momento em que o servidor virou a única fonte de verdade sobre
> economia e moeda, publicar o jogo deixou de ser publicar um binário e passou a ser **operar
> um serviço**. Este documento é a parte disso que é procedimento, não código.

## O que o servidor guarda

Todos os oito repositórios são de Postgres (`apps/server/src/index.ts`). Até o M19 um deles —
o de economia — era de memória, e material, inventário e limpezas de masmorra se perdiam a
cada reinício. O ponto de entrada de produção **não instancia nenhum repositório de memória**;
os de memória continuam existindo, e devem continuar, para os testes e para o `devServer`.

Estado que só existe no banco, e cuja perda é irrecuperável:

| Tabela | O que se perde se ela sumir |
| --- | --- |
| `players` | conta, ELO, marcas, ouro, pedras, **moeda premium**, energia |
| `heroes` | as instâncias de herói do jogador, com equipamento, talentos e script tático |
| `player_characters`, `banner_pity` | **quem o jogador puxou** e quanto falta para o pity |
| `player_materials`, `player_items` | fragmentos e inventário |
| `dungeon_clears`, `dungeon_entries` | o que libera varredura e a trava de entrada |
| `player_claims`, `campaign_clears` | o que já foi pago uma vez — sem isso, prêmio pago duas |
| `economy_actions`, `dungeon_runs`, `replays` | idempotência: sem elas, reenvio cobra de novo |

A coluna `premium` e as duas últimas linhas são a razão de backup não ser opcional: a moeda se
compra com dinheiro real, e as tabelas de idempotência são o que impede pagar duas vezes.

## Migrações

`pnpm --filter @paths-beyond/server run migrate` aplica o que falta, em ordem alfabética de
arquivo, registrando cada uma em `schema_migrations`. É idempotente: rodar de novo não
reaplica nada.

**Migração nunca é escrita à mão em produção.** O que garante que o SQL e o TypeScript não
derivem é `apps/server/tests/migrations.test.ts` — foi assim que o M19 descobriu que a
constraint de `economy_actions.kind` recusaria todo summon e toda compra de energia.

## Backup

`pg_dump` no formato `custom` (`-Fc`), que é o que permite restaurar seletivamente e é
comprimido por padrão:

```bash
pg_dump --format=custom --no-owner --no-acl \
  --file=backup-$(date +%Y%m%d-%H%M%S).dump \
  "$DATABASE_URL"
```

`--no-owner` e `--no-acl` de propósito: o dump passa a poder ser restaurado num banco cujo
usuário tem outro nome, que é o caso normal entre produção e a máquina de quem investiga.

Com o Postgres em container, o mesmo comando por dentro dele:

```bash
docker exec <container> pg_dump -U <usuario> --format=custom --no-owner --no-acl <banco> > backup.dump
```

## Restore

O procedimento **exercitado no M19**, e não presumido — o que segue foi executado de ponta a
ponta, com a suíte passando contra o banco restaurado:

```bash
# 1. Banco de destino limpo. `--clean --if-exists` no restore não basta: um dump parcial
#    deixaria tabela velha de pé, e o objetivo é saber que o dump BASTA sozinho.
dropdb --if-exists paths_beyond_restored
createdb paths_beyond_restored

# 2. Restaurar.
pg_restore --no-owner --no-acl --dbname=paths_beyond_restored backup.dump

# 3. A prova. Não é "o restore não deu erro": é a suíte inteira rodando contra o banco
#    restaurado, incluindo a bateria de paridade e as rotas de produção.
DATABASE_URL="postgres://.../paths_beyond_restored" pnpm test
```

O passo 3 é o que separa este documento de uma promessa. Um restore que "termina sem erro" e
deixa uma constraint ou um índice para trás só é descoberto no dia em que ele é a única cópia
que existe.

### O que o restore NÃO cobre

- **Segredos.** `BATTLE_TICKET_SECRET` não está no banco. Perdê-lo invalida todo ticket de
  batalha em voo; ele precisa do próprio cofre e da própria rotação.
- **Conteúdo.** `packages/data` é versionado em git, não no Postgres. Um banco restaurado com
  uma build de conteúdo diferente pode referenciar personagem ou item que não existe mais — a
  ordem correta é restaurar o banco e subir a build **daquele** momento.
- **Janela de perda.** Um dump é um instante. Quanto se aceita perder entre dois dumps é
  decisão de operação e ainda está em aberto (item G de `DECISIONS.md`), junto com
  monitoramento e plantão.

## Log

Toda requisição emite uma linha JSON com `reqId`, método, rota, `statusCode`, `playerId` e
duração (`apps/server/src/observability.ts`). O nível separa falha nossa de recusa esperada:
`error` para 5xx, `warn` para 4xx — saldo insuficiente e nonce repetido são recusas de regra e
não devem acordar ninguém.

**O log não carrega corpo de requisição nem token**, e isso tem teste. O token É a
autenticação (§9.4): log que o vaza é pior que log nenhum.

## O ambiente local (M28, 1/N)

> Acrescentado no M28. Até aqui, executar o jogo exigia montar Postgres à mão — e essa
> ausência travava duas coisas ao mesmo tempo: o playtest e o próprio autor, que não
> conseguia julgar na tela o que M23 e M27 deixaram pendente.

```bash
docker compose up          # Postgres + migrations + servidor em http://127.0.0.1:3000
pnpm --filter @paths-beyond/client dev   # o cliente, já apontado para lá
```

Não há passo entre os dois. O proxy do Vite cai em `http://127.0.0.1:3000` quando
`PATHS_BEYOND_SERVER` não está definida, que é exatamente a porta que o compose publica —
`apps/server/tests/ambiente.test.ts` amarra as duas pontas para que uma não mude sem a outra.

**A ordem de subida é imposta pelo compose, não por sorte:** o Postgres precisa passar no
health check, o serviço `migrate` precisa **terminar** (`service_completed_successfully`), e só
então o servidor sobe. Com `service_started` no lugar, o servidor correria em paralelo com a
migration e o primeiro request bateria numa tabela inexistente — falha de corrida, que é a
que só aparece na máquina dos outros.

### Como entrar

O ambiente local monta o validador de identidade de **desenvolvimento**: o ticket é
`dev:<id>`, no cabeçalho `x-platform-ticket`. Numa máquina limpa não existe chave da Steam, e
é por isso que o compose sobe `src/composeServer.ts` e **não** o `index.ts` de produção — o
validador de desenvolvimento não está no caminho de produção, e não há configuração capaz de
colocá-lo lá (decisão do M20, preservada; ver o cabeçalho de `composeServer.ts`).

### O que ele NÃO faz

**Não semeia nada.** O `devServer` em memória semeia jogadores, ouro e moeda premium porque
existe para exercitar telas isoladas; este sobe um servidor vazio, que é o estado real de quem
instala o jogo. `POST /accounts/session` cria a conta e concede o núcleo de história; a demo
paga o resto conforme se joga (D31).

A consequência prática, para quem for julgar a tela: **a campanha começa do zero.** Ver o
capítulo recolhível fazer o que ele faz exige limpar missões antes.

### O volume

`pgdata` é o que dá memória ao ambiente: sem ele, cada `docker compose down` apagaria conta,
progresso e inventário. `docker compose down -v` apaga o volume junto — é o jeito de recomeçar
de um servidor genuinamente vazio.

### Os 36 testes que só rodavam no CI

A suíte tem 36 testes que se pulam sozinhos sem `DATABASE_URL` — paridade memória×Postgres, o
app real contra o banco real, o limitador compartilhado. Até o M28 o único lugar onde eles
rodavam era o CI: a mesma ausência de ambiente que travava o playtest travava a suíte
completa. Com o compose de pé:

```bash
DATABASE_URL=postgres://paths:paths@127.0.0.1:5432/paths_beyond_test pnpm test
```

**É `paths_beyond_test`, e não `paths_beyond`.** Os testes limpam tabelas entre casos;
apontá-los para o banco do ambiente apagaria a conta e o progresso de campanha em silêncio, no
meio de um `pnpm test` que ninguém associa a perder progresso. O banco de teste é criado
sozinho quando o volume nasce (`apps/server/initdb/`); num volume que já existe,
`docker compose exec postgres createdb -U paths paths_beyond_test`.

## O ensaio de restore (M28, 2/N)

> O M19 exercitou backup e restore **à mão, uma vez**, e escreveu o procedimento abaixo. Este
> ensaio é o que impede esse procedimento de apodrecer entre um incidente e outro.

```bash
DATABASE_URL=postgres://user:senha@host:porta/banco sh scripts/restore-drill.sh
```

Ele faz o dump da origem, restaura num banco descartável, e **compara tabela por tabela**: a
lista de tabelas, lida do catálogo dos dois lados, e depois a contagem de linhas de cada uma.
Sai com 1 em qualquer divergência. O banco descartável é derrubado por `trap`, mesmo quando o
ensaio reprova.

**Ele não escreve na origem, e essa é a propriedade que o torna rodável em produção.** O M19
inseriu uma linha canário no banco de origem — o que responde "o restore rodou?", a pergunta
fácil, e cobra um preço que ninguém quer pagar no banco que guarda a moeda comprada com
dinheiro real. Aqui a origem só é lida. `apps/server/tests/restauracao.test.ts` confere isso
derivando do fonte do script, e é por isso que o `SELECT` vai inteiro em cada linha em vez de
morar numa variável.

**Provado por mutação:** um dump que exclui `players` reprova no restore (as chaves
estrangeiras não fecham) e um dump `--schema-only` reprova na contagem — 18 tabelas presentes,
todas com zero linhas contra uma origem que tinha 34.

### Onde ele roda

O job `ensaio-de-restore` do CI, a cada commit, contra `postgres:16`: migra, roda a suíte para
o banco ter linhas, e então ensaia. **A cobertura de dados é magra e é honesto dizer:** a suíte
deixa linhas em 3 das 18 tabelas (`players`, `dungeon_clears`, `schema_migrations`). Isso basta
para pegar um dump que perde dados; não basta para afirmar que toda tabela sobrevive com
conteúdo. Rodar o ensaio contra o ambiente hospedado — onde as 18 têm dados de verdade — é
parte do critério 4 e depende da 2/N.

### O que fica para a 2/N

O ambiente **hospedado** (alcançável pela internet, com as migrations no deploy e backup
automático) é a sub-sessão 2/N, e depende de uma conta de provedor. Os critérios 2, 3 e 4 do
M28 continuam abertos.
