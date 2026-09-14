# M28, sub-sessão 1/N — a imagem do servidor.
#
# **O que esta imagem precisa carregar, e o erro que ela existe para não cometer.** O
# servidor não é só código: `loadCatalogFromDisk` lê `packages/data` do DISCO, em tempo de
# execução. Uma imagem sem esse diretório sobe, responde, e não tem uma classe, um mapa nem
# uma missão dentro dela — é o mesmo modo de falha silenciosa que o M21 pegou na lista
# `files` do empacotamento, e `tests/ambiente.test.ts` deriva as linhas `COPY` abaixo das
# dependências de workspace declaradas no `package.json` do servidor.
#
# `tsx` executa TypeScript direto, como `pnpm start` já fazia: não há passo de build a
# reproduzir aqui, e um build que só existisse na imagem seria um caminho a mais para
# divergir do que a suíte executa.

FROM node:22-slim

# `engine-strict=true` no `.npmrc` — a imagem precisa satisfazer `node >= 22`.
RUN corepack enable

WORKDIR /app

# 1) O esqueleto do workspace: os manifestos de TODOS os projetos, e mais nada.
#
# `--frozen-lockfile` compara o lockfile com o workspace INTEIRO, então faltar um manifesto
# aqui faz a instalação recusar — em vez de instalar uma árvore diferente da que a suíte
# testou. São arquivos pequenos e que mudam pouco, o que faz desta a camada que o Docker mais
# reaproveita entre builds: mexer no código do jogo não reinstala nada.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/client/package.json apps/client/
COPY apps/desktop/package.json apps/desktop/
COPY apps/server/package.json apps/server/
COPY packages/content/package.json packages/content/
COPY packages/core/package.json packages/core/
COPY packages/data/package.json packages/data/
COPY packages/gacha/package.json packages/gacha/
COPY packages/sim-cli/package.json packages/sim-cli/
COPY tools/art/package.json tools/art/
COPY tools/balance/package.json tools/balance/

# 2) Só o fecho de dependências do servidor.
#
# O `...` no filtro é do pnpm e significa "e as dependências dele". Sem ele a imagem baixaria
# Electron e Playwright, que pertencem ao shell e à medição de determinismo entre engines —
# centenas de MB que nunca são executados aqui.
RUN pnpm install --frozen-lockfile --filter @paths-beyond/server...

# 3) O código, e o conteúdo do jogo junto.
COPY tsconfig.base.json tsconfig.json ./
COPY apps/server apps/server
COPY packages/core packages/core
COPY packages/data packages/data
COPY packages/content packages/content
COPY packages/gacha packages/gacha

# O `compose.yaml` escolhe o comando: `migrate` para o serviço de migration e
# `composeServer.ts` para o servidor. A imagem é a mesma nos dois — uma imagem por serviço
# faria a migration rodar contra um código que não é o que vai subir.
#
# O `CMD` padrão (M28 2/N) é o do CONTÊINER ÚNICO: migra e só então sobe. É o que um
# provedor que roda a imagem sem compose executa — e é o que o Railway executou, ignorando
# a seção `deploy` do `railway.json` (nem `preDeployCommand` nem `startCommand` rodaram; o
# servidor subiu calado, `/health` respondeu 200 e o banco ficou sem uma tabela). Pôr a
# migration aqui é pô-la onde nenhuma configuração de painel a esconde. É idempotente
# (`schema_migrations`), a saída vai ao log do contêiner, e migration que falha derruba o
# start — que é o comportamento certo. O `exec` faz do servidor o processo 1, não do shell.
EXPOSE 3000
CMD ["/bin/sh", "-c", "pnpm --filter @paths-beyond/server run migrate && exec pnpm --filter @paths-beyond/server exec tsx src/composeServer.ts"]
