Verifique o milestone atual sem escrever código novo.

1. Leia `PROGRESS.md` e os critérios de aceite do milestone em `docs/spec/09-roadmap.md`.
2. Para cada critério, encontre o teste que o prova. Rode-o e cole a saída.
3. Se algum critério não tiver teste correspondente, diga isso explicitamente em vez de assumir que passou.
4. Rode `pnpm lint` e confirme que não há `Math.random` nem float em `packages/core`.
5. Termine com um veredito: APROVADO ou REPROVADO, com a lista do que falta.
