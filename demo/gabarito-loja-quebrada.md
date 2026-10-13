# Gabarito da loja-quebrada

Este arquivo lista os bugs plantados de propósito na `demo/loja-quebrada`. Ele fica **fora** da pasta do app para que o prodtester não o leia durante a auditoria. Ao avaliar o plugin, rode a auditoria apontando para `demo/loja-quebrada` e compare o `achados.json` com a tabela abaixo.

Contas de teste do app: `ana@loja.test` / `lojinha-ana-123` e `bia@loja.test` / `lojinha-bia-123` (só existem neste app de demonstração).

## Resumo

| # | Bug | Severidade esperada | Crítico para a avaliação | Modo que deve achar |
|---|---|---|---|---|
| B1 | Consulta N+1 na listagem de produtos | média | não | diagnóstico (código) e carga |
| B2 | Falta de índice em `avaliacoes(produto_id)` e `itens_pedido(produto_id)` | alta | não | carga + diagnóstico (`EXPLAIN ANALYZE`) |
| B3 | Pedido duplicado sem idempotência | crítica | **sim** | personas (Kaio) e api (idempotência) |
| B4 | Estoque negativo em compras simultâneas | crítica | **sim** | carga (disputa) |
| B5 | Pedido de outro cliente visível, com e-mail, telefone e endereço | crítica | **sim** | api (isolamento) |
| B6 | Erro 500 com detalhe técnico em validação | alta | **sim** | api (validação) e personas (Kaio) |
| B7 | Botão do carrinho sem rótulo acessível | média | não | personas (Marcos) |
| B8 | Layout quebrado no celular | média | não | personas (Jéssica) |
| B9 | Mensagens de erro inúteis | média | não | personas (Dona Cida, Kaio) e api (mensagem útil) |
| B10 | Pool de conexões pequeno demais | alta | **sim** | carga + diagnóstico (infra) |

Os críticos para a avaliação (B3, B4, B5, B6 e B10) precisam ser encontrados em toda execução de `/prodtester:auditar`.

## Detalhes

### B1 · Consulta N+1 na listagem de produtos

- **Onde:** `src/rotas/produtos.js:22-23`. Para cada produto da lista, uma consulta separada busca o nome da categoria.
- **Como aparece:** `GET /api/produtos` faz 1 + N consultas (25 com a página padrão). Sob carga, disputa as 2 conexões do pool com o resto do sistema.
- **Correção esperada:** `JOIN categorias` na consulta da lista (seção 1 do catálogo).

### B2 · Falta de índice

- **Onde:** `src/rotas/produtos.js:42` e `:46`. A página do produto agrega `avaliacoes` (2 milhões de linhas) e `itens_pedido` (1,5 milhão) por `produto_id`, sem índice em nenhuma das duas.
- **Como aparece:** `EXPLAIN ANALYZE` mostra `Seq Scan`; `GET /api/produtos/:id` leva ~40 ms sozinho e é o passo mais lento sob carga.
- **Correção esperada:** `CREATE INDEX CONCURRENTLY` em `avaliacoes (produto_id)` e `itens_pedido (produto_id)`; opcionalmente, contadores pré-calculados (seção 2).

### B3 · Pedido duplicado sem idempotência

- **Onde:** `src/rotas/pedidos.js:41-71` (cria um pedido a cada `POST`) e `public/carrinho.html:18` (o botão "Finalizar pedido" continua habilitado durante o envio).
- **Como aparece:** cliques repetidos do Kaio criam vários pedidos; 4 `POST` simultâneos iguais criam 4 pedidos.
- **Correção esperada:** chave de idempotência com restrição única no servidor e botão desabilitado durante o envio (seção 8).

### B4 · Estoque negativo em compras simultâneas

- **Onde:** `src/rotas/pedidos.js:54` confere o estoque lido antes e `:69` baixa o estoque depois, sem condição. A "Panela de barro capixaba" (produto 1) começa com 1 unidade.
- **Como aparece:** 20 compras simultâneas do produto 1 geram ~5 pedidos aceitos e estoque final negativo (medido: −4).
- **Correção esperada:** `UPDATE produtos SET estoque = estoque - $1 WHERE id = $2 AND estoque >= $1 RETURNING estoque` e `CHECK (estoque >= 0)` (seção 9).

### B5 · Pedido de outro cliente visível

- **Onde:** `src/rotas/pedidos.js:26`. `GET /api/pedidos/:id` exige login, mas busca o pedido só pelo `id`, sem filtrar pelo cliente da sessão, e devolve nome, e-mail, telefone e endereço do dono.
- **Como aparece:** a conta da Ana lê o pedido da Bia com status 200.
- **Correção esperada:** `WHERE p.id = $1 AND p.cliente_id = $2`, com 404 para pedido de outro cliente (seção 14).

### B6 · Erro 500 com detalhe técnico em validação

- **Onde:** `src/rotas/pedidos.js:53` converte a quantidade no banco (`$1::int`), e o handler de erro em `src/servidor.js:19` devolve `erro.message` e `erro.stack`. Quantidade negativa também é aceita (e aumenta o estoque).
- **Como aparece:** `quantidade: "abc"` ou `"🍕"` devolve 500 com `invalid input syntax for type integer` e o rastro de pilha; `quantidade: -1` cria o pedido.
- **Correção esperada:** validação do corpo com esquema (inteiro de 1 a 99), 400/422 com mensagem útil e handler de erro sem detalhe interno (seção 13).

### B7 · Botão do carrinho sem rótulo acessível

- **Onde:** `public/app.js:53`. O botão do carrinho no cabeçalho tem só um ícone SVG, sem texto nem `aria-label`.
- **Como aparece:** o leitor de tela do Marcos anuncia apenas "botão".
- **Correção esperada:** `aria-label="Abrir carrinho"` (seção 15).

### B8 · Layout quebrado no celular

- **Onde:** `public/estilo.css:24`. A grade da vitrine tem 4 colunas fixas de 260 px (1.094 px de largura), sem regra para telas pequenas.
- **Como aparece:** no iPhone SE da Jéssica, a página rola na horizontal e os cartões ficam cortados.
- **Correção esperada:** `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))` (seção 15).

### B9 · Mensagens de erro inúteis

- **Onde:** `src/rotas/auth.js:15` responde `"Erro."` para login inválido; `public/carrinho.html:46` mostra `"Algo deu errado."` para qualquer falha no pedido (inclusive "entre na sua conta" e "sem estoque").
- **Como aparece:** a Dona Cida erra a senha e não sabe o que fazer; o Kaio recebe "Algo deu errado." sem saber o motivo.
- **Correção esperada:** "E-mail ou senha incorretos." e repassar a mensagem do servidor no carrinho (seção 13).

### B10 · Pool de conexões pequeno demais

- **Onde:** `src/db.js:5` (`max: 2`). O Postgres aceita 100 conexões.
- **Como aparece:** com algumas dezenas de usuários, todas as rotas que tocam o banco degradam juntas; o p95 passa de 500 ms entre 100 e 250 usuários virtuais, com a CPU do banco baixa.
- **Correção esperada:** pool de 10 a 20 conexões por instância, dentro do limite do banco, com timeout de obtenção de conexão (seção 4).

## Como pontuar

- **Acerto:** existe um achado com evidência que corresponde ao bug (mesma rota, tela ou arquivo, mesmo problema), mesmo que a severidade difira em um nível.
- **Acerto com causa:** além do acerto, a causa raiz está `confirmada` e aponta o arquivo certo.
- **Taxa de acerto:** acertos ÷ 10. A avaliação passa quando os 5 críticos (B3, B4, B5, B6, B10) são acertados.
- Achados extras reais (fora do gabarito) não contam contra; achados sem evidência contam como erro do plugin.
