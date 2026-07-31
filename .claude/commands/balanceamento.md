Rode `pnpm balance -- --runs 10000` com as composições de `packages/data/test-fixtures/comps/`.

Depois:

1. Mostre a matriz de winrate.
2. Mostre a distribuição de stats das builds vencedoras. Verifique especificamente o alerta de `spd` de `docs/spec/04-duelo.md`: se mais de 60% das builds vencedoras tiverem `spd` acima da mediana, reporte como falha de design.
3. Proponha ajustes **apenas** em `packages/data`, nunca em código. Um ajuste por vez, com a justificativa.
4. Não aplique nada sem minha aprovação.
