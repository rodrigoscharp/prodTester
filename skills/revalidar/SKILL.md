---
name: revalidar
description: Reexecuta com o prodtester o que falhou na última auditoria e gera o comparativo antes × depois.
argument-hint: "[caminho-da-auditoria]"
disable-model-invocation: true
allowed-tools: Skill(prodtester:prodtester)
---

Use a ferramenta Skill para carregar a skill `prodtester:prodtester` com os argumentos `revalidar $ARGUMENTS` e siga as instruções dela do início ao fim.
