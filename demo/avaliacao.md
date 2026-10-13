# Avaliação do prodtester na loja-quebrada

Registro das execuções de avaliação contra o [gabarito](gabarito-loja-quebrada.md). Cada rodada usa uma cópia limpa da `demo/loja-quebrada` (banco recriado), fora da pasta onde fica o gabarito.

## Rodada 1 · 13/10/2026

**Comando:** `/prodtester:auditar http://localhost:3000`, sem interação humana (`claude -p`), navegadores invisíveis, credenciais pelo arquivo de segredos.

**Condições:** app, Postgres e k6 na mesma máquina (um MacBook), etapas de carga encurtadas para caber na avaliação (degraus de 40 s com 50, 100, 250 e 500 usuários). O relatório registra o alerta de CPU alta na máquina, então a capacidade medida fica abaixo da que o app teria com o gerador separado.

### Resultado da auditoria

| Medida | Valor |
|---|---|
| Placar | 41/100 (Arriscado) |
| Capacidade medida | ~100 usuários simultâneos com p95 de 145 ms |
| Ponto de quebra | 200 usuários (o pico esperado): p95 de 4.703 ms |
| Disputa pela última panela | 25 vendas para 1 unidade; estoque final −24 |
| API | 14 de 28 casos passaram |
| Personas | 15 combinações fluxo × persona: 4 ✅, 11 ⚠️, nenhuma falha |
| Achados | 18 (5 críticos, 5 altos, 5 médios, 3 baixos) |

### Comparação com o gabarito

| Bug | Achou? | Achado | Causa |
|---|---|---|---|
| B1 · N+1 na listagem | ✅ | Vitrine faz 25 consultas por visita | confirmada |
| B2 · Falta de índice | ✅ | Detalhe do produto lê tabelas inteiras (`EXPLAIN ANALYZE` anexado) | confirmada |
| B3 · Pedido duplicado ⭐ | ✅ | 4 cliques criam 4 pedidos; a API também | confirmada |
| B4 · Estoque negativo ⭐ | ✅ | Última panela vendida 25 vezes | confirmada |
| B5 · Pedido de outro cliente ⭐ | ✅ | Cliente B lê pedido do cliente A, com telefone e endereço | confirmada |
| B6 · 500 em validação ⭐ | ✅ | Erro 500 com rastro de pilha; quantidade negativa aceita | confirmada |
| B7 · Botão sem rótulo | ✅ | Botão do carrinho sem nome acessível | confirmada |
| B8 · Layout no celular | ❌ | A Jéssica comentou "tela larga demais", mas não mediu nem registrou | — |
| B9 · Mensagens inúteis | ✅ | "Algo deu errado." e "Erro." | confirmada |
| B10 · Pool pequeno ⭐ | ✅ | Degrada com 200 usuários; `src/db.js:5` com `max: 2` | hipótese |

**Taxa de acerto: 9/10.** Críticos: 5/5. Com causa confirmada: 8/10.

Achados reais fora do gabarito: erro 500 em `/api/produtos/abc` e em `?limit=-1`, JSON malformado virando 500, observação de 100 mil caracteres aceita, mensagens sem `aria-live`, 24 links com o mesmo nome "Ver produto", busca com `%` listando tudo.

### Ajustes feitos depois da rodada 1

1. **Medição obrigatória de largura no celular:** a Jéssica mede `scrollWidth` × `clientWidth` na primeira tela de cada fluxo e registra o estouro como problema.
2. **Percepção vira problema:** quando a persona percebe algo errado, mesmo seguindo o fluxo, a fala é do tipo `problema`.
3. **Falas entre aspas simples:** dois registros da Dona Cida foram recusados pelo hook por caracteres de shell entre aspas duplas.
4. **Etapas de carga em primeiro plano:** na execução sem usuário, o estresse foi para segundo plano e a sessão terminou com ele rodando. Agora etapas de até ~9 minutos rodam em primeiro plano, e as maiores são esperadas com laço em primeiro plano.
5. **URL com acento:** os executores k6 codificam caracteres fora do ASCII (um termo de busca com "í" derrubou a primeira tentativa da etapa esperada).
6. **Relatório:** nome do sistema vindo do `testes-fluxos.yaml` e eixo do traçado arredondado, em segundos acima de 1.000 ms.

### Reteste do B8

Rodada só com a Jéssica, banco limpo: achado **"Vitrine mais larga que a tela do celular (1122 px numa tela de 375 px)"**, causa confirmada em `public/estilo.css:24`. Com o ajuste, a taxa de acerto vai a **10/10**.
