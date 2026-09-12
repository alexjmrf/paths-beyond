#!/bin/sh
# M28, sub-sessão 2/N — o ENSAIO DE RESTORE, executável e repetível.
#
# **Por que isto existe.** O M19 exercitou backup e restore à mão, uma vez, e documentou o
# procedimento. Procedimento que ninguém executa apodrece em silêncio: a flag muda de nome, a
# versão do cliente diverge da do servidor, uma tabela nova entra e ninguém confere se ela
# saiu no dump. Só se descobre no dia em que é preciso — que é o único dia em que não dá para
# descobrir.
#
# **O que ele afirma, e por que não é um canário.** O M19 inseriu uma linha canário e a
# procurou depois do restore. Isso responde "o restore rodou?", que é a pergunta fácil. Este
# compara **tabela por tabela, a contagem de linhas da origem com a do restaurado**, e compara
# antes a própria LISTA de tabelas, lida do catálogo do banco. Uma tabela que o dump deixasse
# de fora reprova aqui mesmo que tudo o mais funcione — é o mesmo idioma da varredura de
# exclusão do M20, que lê `pg_constraint` em vez de uma lista escrita à mão, para que uma
# tabela nova entre na conferência sozinha.
#
# **Não escreve nada na origem.** Um ensaio que muda o banco que está ensaiando é um ensaio
# que ninguém vai querer rodar em produção — e produção é exatamente onde ele precisa rodar.
#
# Uso:  DATABASE_URL=postgres://user:senha@host:porta/banco  sh scripts/restore-drill.sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "erro: DATABASE_URL é obrigatória" >&2
  exit 2
fi

ORIGEM="$DATABASE_URL"
BANCO=$(printf '%s' "$ORIGEM" | sed 's|.*/||; s|?.*||')
BASE_URL=$(printf '%s' "$ORIGEM" | sed 's|/[^/]*$||')
# O banco de manutenção: criar e apagar um banco exige estar conectado a OUTRO.
MANUT="$BASE_URL/postgres"
ENSAIO="${BANCO}_drill_$$"
ENSAIO_URL="$BASE_URL/$ENSAIO"
DUMP=$(mktemp)

limpar() {
  rm -f "$DUMP"
  psql "$MANUT" -q -c "DROP DATABASE IF EXISTS $ENSAIO" >/dev/null 2>&1 || true
}
trap limpar EXIT

echo "ensaio de restore — origem: $BANCO"

# 1) O dump, no mesmo formato do procedimento do M19.
pg_dump -Fc "$ORIGEM" > "$DUMP"
echo "  dump: $(wc -c < "$DUMP" | tr -d ' ') bytes"

# 2) Um banco vazio, e o restore dentro dele.
psql "$MANUT" -q -c "DROP DATABASE IF EXISTS $ENSAIO" >/dev/null
psql "$MANUT" -q -c "CREATE DATABASE $ENSAIO" >/dev/null
pg_restore -d "$ENSAIO_URL" --no-owner --no-privileges "$DUMP" >/dev/null
echo "  restaurado em: $ENSAIO"

# 3) A lista de tabelas, lida do CATÁLOGO dos dois lados.
#
# O SELECT vai inteiro em cada linha, e não numa variável, de propósito: "este ensaio nunca
# escreve na origem" é a propriedade que decide se ele pode rodar em produção, e ela precisa
# ser legível na linha, sem seguir variável. `tests/restauracao.test.ts` a confere assim.
TAB_ORIGEM=$(psql "$ORIGEM" -At -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
TAB_ENSAIO=$(psql "$ENSAIO_URL" -At -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")

if [ "$TAB_ORIGEM" != "$TAB_ENSAIO" ]; then
  echo "FALHOU: a lista de tabelas não bate" >&2
  echo "origem:" >&2;     printf '%s\n' "$TAB_ORIGEM" >&2
  echo "restaurado:" >&2; printf '%s\n' "$TAB_ENSAIO" >&2
  exit 1
fi

N_TABELAS=$(printf '%s\n' "$TAB_ORIGEM" | grep -c . || true)
echo "  tabelas conferidas: $N_TABELAS"

# 4) Linha por linha, tabela por tabela.
DIVERGIU=0
TOTAL=0
for t in $TAB_ORIGEM; do
  A=$(psql "$ORIGEM"     -At -c "SELECT count(*) FROM \"$t\"")
  B=$(psql "$ENSAIO_URL" -At -c "SELECT count(*) FROM \"$t\"")
  TOTAL=$((TOTAL + A))
  if [ "$A" != "$B" ]; then
    echo "  DIVERGIU  $t: origem=$A restaurado=$B" >&2
    DIVERGIU=1
  else
    [ "$A" != "0" ] && echo "  ok  $t: $A"
  fi
done

if [ "$DIVERGIU" != "0" ]; then
  echo "FALHOU: o restaurado não bate com a origem" >&2
  exit 1
fi

echo "ok — $N_TABELAS tabelas, $TOTAL linhas, origem e restaurado idênticos"
