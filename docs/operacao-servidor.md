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
