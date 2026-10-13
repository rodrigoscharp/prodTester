# Etapa 5 — Relatório

O relatório é um laudo: identifica o sistema examinado, mostra o resultado de cada exame com a medição que o sustenta e termina com a conduta (o plano de correção). Ele sai **só** dos arquivos da execução. Se um número não está nesses arquivos, ele não aparece.

## 1. Antes de gerar

1. Rode `node <skill>/scripts/validar.mjs <execucao>` e corrija todo `ERRO`.
2. Se o diagnóstico rodou, confirme que `plano-correcao.json` existe (`plano-correcao.mjs`).
3. Releia os achados: título claro em português, sem jargão desnecessário, e a diferença entre fato e hipótese marcada em `causa_raiz.status`.

## 2. Gerar

```bash
node <skill>/scripts/gerar-relatorio.mjs <execucao>
```

O script grava dois arquivos na pasta da execução:

- `relatorio.html`: página única e autocontida (estilos, scripts, gráficos e screenshots dentro do arquivo), que abre offline, com tema claro (papel de laudo) e escuro (monitor), e funciona no celular;
- `relatorio.md`: as mesmas informações em Markdown, para colar num PR ou numa issue.

Mostre ao usuário o caminho dos dois e o placar. Sugira abrir o HTML no navegador.

## 3. Placar de saúde (0 a 100)

O placar resume o estado do sistema. A fórmula é fixa e aparece no próprio relatório, na seção de método.

**Penalidade de cada achado, pela severidade:**

| Severidade | Penalidade |
|---|---|
| crítica | 20 |
| alta | 10 |
| média | 4 |
| baixa | 1 |

**Nota de cada modo:** `max(0, 100 − soma das penalidades dos achados daquele modo)`. Os achados de `volume` contam no modo carga; os de `preparacao`, no modo api.

**Placar geral:** média ponderada das notas dos modos que **rodaram**, com estes pesos:

| Modo | Peso |
|---|---|
| personas | 30 |
| api | 35 |
| carga | 35 |

Os pesos são renormalizados quando um modo não roda (por exemplo, só api e carga: 50% cada). Um modo que não rodou aparece como "não avaliado", nunca como 100.

**Teto por crítico:** com pelo menos um achado crítico, o placar geral fica em no máximo 59.

**Faixas:**

| Placar | Leitura |
|---|---|
| 90 a 100 | Pronto para crescer |
| 75 a 89 | Saudável, com ajustes |
| 60 a 74 | Precisa de atenção |
| 40 a 59 | Arriscado |
| 0 a 39 | Crítico |

## 4. Capacidade

- **Capacidade medida:** vem de `carga/consolidado.json`. O texto é "aguenta ~N usuários simultâneos com p95 < X ms" ou, quando nenhum degrau quebrou, "aguenta pelo menos N usuários simultâneos (maior degrau testado)".
- **Capacidade depois das correções:** só aparece com número se houver revalidação com carga (`revalidacao.json`). Sem ela, o relatório mostra "a medir com /prodtester:revalidar".
- Se o gerador saturou em alguma etapa, os degraus dela não entram na capacidade e o relatório mostra o alerta.
- No perfil local-first, no lugar da capacidade em usuários, o relatório mostra o tempo das telas pesadas em cada volume de dados.

## 5. Conteúdo do relatório

1. **Identificação:** sistema, alvo, ambiente, perfil detectado, data e modos executados ou pulados (com motivo).
2. **Resultado:** placar, faixa, nota por modo e capacidade, com a curva usuários × p95 desenhada como um traçado de monitor.
3. **Principais achados:** os 5 mais graves, cada um com evidência.
4. **Personas:** matriz fluxo × persona (✅ ⚠️ ❌ e número de passos) e a linha do tempo de cada persona, com falas e screenshots.
5. **API:** tabela endpoint × check e as falhas.
6. **Carga:** curva por degrau, ponto de quebra, passos mais lentos, disputas, volumes e alertas de validade.
7. **Conduta:** o plano de correção priorizado, com causa (confirmada ou provável), correção, passos de infraestrutura e diff com destaque.
8. **Antes × depois:** quando houver revalidação.
9. **Limites e método:** a fórmula do placar e os limites desta auditoria (staging não é produção quando a infra difere; agentes de IA não são determinísticos; personas não substituem pessoas reais; correções exigem revisão humana; o que ficou fora e por quê).

## 6. Regras

- **Só o observado.** Nada de número estimado no lugar de medição.
- **Fato separado de hipótese:** "causa confirmada" e "causa provável" aparecem com marcações diferentes.
- **Sem segredos:** os scripts já omitem credenciais. Mesmo assim, antes de entregar, procure no HTML e no Markdown por senhas, tokens e chaves das contas de teste (os nomes das variáveis estão no yaml). Se aparecer algum valor, corrija a origem e gere de novo.
- **Sem autoria de ferramenta de IA:** o relatório é assinado como "Gerado pelo prodtester".
