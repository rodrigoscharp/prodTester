# Catálogo de boas práticas

Consulte **só a seção do problema em análise**. Cada seção traz: como o problema aparece nos testes, como confirmar a causa, a correção de boa prática (com exemplos nas stacks mais comuns), o risco da mudança e como validar.

Os exemplos são pontos de partida. A correção entregue ao usuário é sempre escrita para o código e a infraestrutura reais dele.

## Índice

1. [Consulta N+1](#1-consulta-n1)
2. [Falta de índice](#2-falta-de-índice)
3. [Paginação por cursor e teto de `limit`](#3-paginação-por-cursor-e-teto-de-limit)
4. [Pool de conexões × limite do banco](#4-pool-de-conexões--limite-do-banco)
5. [Transações curtas](#5-transações-curtas)
6. [Chamadas externas: timeout, retry, circuit breaker, fila](#6-chamadas-externas-timeout-retry-circuit-breaker-fila)
7. [Cache e invalidação](#7-cache-e-invalidação)
8. [Idempotência: chave + restrição única](#8-idempotência-chave--restrição-única)
9. [Disputa por recurso](#9-disputa-por-recurso)
10. [App sem estado e escala horizontal](#10-app-sem-estado-e-escala-horizontal)
11. [CDN e compressão](#11-cdn-e-compressão)
12. [Rate limit](#12-rate-limit)
13. [Validação de entrada e erros úteis](#13-validação-de-entrada-e-erros-úteis)
14. [Autenticação e isolamento entre contas](#14-autenticação-e-isolamento-entre-contas)
15. [Interface: acessibilidade, celular e feedback](#15-interface-acessibilidade-celular-e-feedback)

---

## 1. Consulta N+1

**Como aparece:** uma lista fica lenta conforme cresce; o p95 de uma rota de listagem sobe com o volume de dados (perfil local-first) ou com poucos usuários; o pool de conexões satura cedo.

**Como confirmar:** leia o handler da rota. Um laço que faz uma consulta por item (`for (const p of pedidos) await db.query(... p.id)`, `pedido.getItens()` dentro de `forEach`, lazy loading do JPA, `.select()` dentro de `map` no Supabase) é a prova. Com log de SQL ligado (`DEBUG=knex:query`, `spring.jpa.show-sql=true`, `log_statement = 'all'` no Postgres local), conte as consultas de uma requisição.

**Correção:** buscar tudo de uma vez.

```sql
-- antes: 1 consulta para os pedidos + 1 por pedido para os itens
-- depois: uma consulta só
SELECT p.*, json_agg(i.*) AS itens
FROM pedidos p LEFT JOIN itens i ON i.pedido_id = p.id
WHERE p.cliente_id = $1
GROUP BY p.id;
```

- Node + pg: troque o laço por `WHERE pedido_id = ANY($1)` e agrupe em memória.
- Spring Data JPA: `@EntityGraph(attributePaths = "itens")` ou `JOIN FETCH` na `@Query`; `spring.jpa.properties.hibernate.default_batch_fetch_size=50` como paliativo.
- Supabase: um `select` com relação embutida (`pedidos(*, itens(*))`).
- Prisma: `include: { itens: true }`.

**Risco:** baixo. Atenção a `JOIN` que multiplica linhas (use agregação ou duas consultas com `IN`).

**Como validar:** número de consultas por requisição cai para 1 ou 2; p95 da rota medido de novo no mesmo volume ou degrau.

## 2. Falta de índice

**Como aparece:** uma rota de busca, filtro ou listagem fica lenta mesmo com poucos usuários; o tempo cresce com o volume da tabela.

**Como confirmar:** `EXPLAIN ANALYZE` da consulta, **só no banco local ou de staging** e **só com `SELECT`** (o `ANALYZE` executa a consulta). Para consultas de escrita, use `EXPLAIN` sem `ANALYZE`, ou rode dentro de `BEGIN; … ROLLBACK;` com o "sim" do usuário. `Seq Scan` numa tabela grande com filtro seletivo é a prova. Guarde a saída em `explain/<id-do-achado>.txt` como evidência.

**Correção:**

```sql
CREATE INDEX CONCURRENTLY idx_pedidos_tenant_criado
  ON pedidos (tenant_id, criado_em DESC);
```

- Índice composto na ordem: igualdade primeiro, depois intervalo ou ordenação.
- Em multi-tenant, quase todo índice começa por `tenant_id`.
- Busca por texto: `pg_trgm` com índice GIN, em vez de `ILIKE '%x%'` sem índice.

**Risco:** médio. `CREATE INDEX` sem `CONCURRENTLY` bloqueia escritas na tabela. Índices custam espaço e deixam escritas um pouco mais lentas. Em produção, aplique numa janela calma.

**Como validar:** `EXPLAIN ANALYZE` de novo mostra `Index Scan`/`Bitmap Index Scan` e tempo menor; p95 da rota medido de novo.

## 3. Paginação por cursor e teto de `limit`

**Como aparece:** caso de API `limites` falha (devolve milhares de itens com `limit=100000`); páginas profundas (`offset` grande) ficam lentas; memória do backend sobe numa listagem.

**Como confirmar:** o handler repassa `limit` do usuário direto para a consulta, sem teto; ou usa `OFFSET` alto.

**Correção:**

```js
const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
```

```sql
-- cursor: em vez de OFFSET 10000
SELECT * FROM pedidos
WHERE tenant_id = $1 AND (criado_em, id) < ($2, $3)
ORDER BY criado_em DESC, id DESC
LIMIT $4;
```

- Devolva o cursor da próxima página (`proximo: "<criado_em>,<id>"`).
- Spring: `Pageable` com `@PageableDefault(size = 20)` e `spring.data.web.pageable.max-page-size=100`.

**Risco:** baixo para o teto; médio para trocar `offset` por cursor (o cliente precisa mudar).

**Como validar:** o caso `limites` passa; p95 da listagem medido de novo.

## 4. Pool de conexões × limite do banco

**Como aparece:** o p95 dispara a partir de um número pequeno de usuários, mas a CPU do banco está baixa; erros de timeout ao obter conexão; todos os passos que tocam o banco degradam juntos no mesmo degrau.

**Como confirmar:** leia a configuração do pool (`max` no `pg.Pool`, `connection_limit` na URL do Prisma, `spring.datasource.hikari.maximum-pool-size`, `pool_size` do SQLAlchemy). Um pool de 2 a 5 conexões com dezenas de requisições simultâneas é a prova. Compare com o limite do banco (`SHOW max_connections;`) e com o número de instâncias do app.

**Correção:**

- Regra de bolso: `conexões_por_instância × instâncias ≤ max_connections do banco − reserva (~10)`.
- Comece com 10 a 20 por instância para apps web típicos; ajuste medindo.
- Em plataformas serverless ou com muitas instâncias, use um pooler (PgBouncer em modo transação, Supavisor no Supabase, RDS Proxy) e um pool pequeno por instância.
- Defina timeout de obtenção de conexão (`connectionTimeoutMillis`, `hikari.connection-timeout`) para falhar rápido em vez de enfileirar para sempre.

```js
const pool = new Pool({ max: 20, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 2_000 });
```

**Risco:** médio. Pool maior que o banco aguenta derruba o banco. No plano gerenciado, o limite de conexões depende do tamanho da instância: cite o custo provável de subir de plano quando for o caso.

**Como validar:** degrau de estresse onde quebrou, rodado de novo.

## 5. Transações curtas

**Como aparece:** bloqueios e timeouts sob carga de escrita; p95 de escrita alto com CPU baixa; deadlocks no log.

**Como confirmar:** o handler abre transação e, dentro dela, faz chamadas externas (pagamento, e-mail, LLM), espera de rede ou processamento pesado. No Postgres local: `SELECT * FROM pg_stat_activity WHERE state = 'idle in transaction';` durante a carga.

**Correção:** dentro da transação, só leituras e escritas no banco. Chamadas externas antes (com o resultado guardado) ou depois (com fila ou outbox).

**Risco:** médio. Reordenar pode exigir compensação se a chamada externa falhar depois do commit.

**Como validar:** p95 de escrita no degrau que falhou.

## 6. Chamadas externas: timeout, retry, circuit breaker, fila

**Como aparece:** p95 muito alto ou erros em rotas que chamam terceiros (pagamento, frete, e-mail, LLM local ou remoto); a rota fica pendurada quando o terceiro demora; tudo trava junto quando um serviço cai.

**Como confirmar:** chamada HTTP sem timeout (`fetch` sem `AbortSignal.timeout`, `RestTemplate` sem timeouts configurados, `requests.get` sem `timeout=`); retry sem limite ou sem espera.

**Correção:**

- **Timeout** em toda chamada externa (por exemplo 3 a 10 s; LLM local conforme a medição).
- **Retry com backoff exponencial e jitter**, só para operações idempotentes, com no máximo 2 ou 3 tentativas.
- **Circuit breaker** (opossum no Node, Resilience4j no Spring) para parar de chamar um serviço que está falhando.
- **Fila** (BullMQ, SQS, RabbitMQ, pg-boss) para o que não precisa acontecer na hora (e-mail, notificação, processamento de LLM demorado), com resposta imediata ao usuário e acompanhamento do status.

```js
const resposta = await fetch(url, { signal: AbortSignal.timeout(5000) });
```

**Risco:** baixo para timeout; médio para fila (nova peça de infraestrutura).

**Como validar:** p95 e taxa de erro da rota na mesma etapa; para LLM, p50/p95/máximo da operação longa.

## 7. Cache e invalidação

**Como aparece:** rotas de leitura pesada (cardápio, vitrine, catálogo, configurações) dominam a carga e o p95 sobe com usuários, embora os dados mudem pouco.

**Como confirmar:** a mesma consulta roda a cada requisição; a resposta não tem `Cache-Control`; não há cache em memória nem distribuído.

**Correção:**

- Respostas públicas e iguais para todos: `Cache-Control: public, max-age=60, stale-while-revalidate=300` e CDN na frente.
- Dados por tenant: cache em memória (LRU com TTL curto) ou Redis com chave que inclui o tenant (`cardapio:<tenant_id>`).
- **Invalidação:** apague a chave quando o dado mudar (no mesmo ponto do código que grava), e mantenha um TTL como rede de segurança.
- Com várias instâncias, cache em memória diverge entre elas: use Redis ou TTL bem curto.

**Risco:** médio. Cache sem invalidação mostra dado velho (preço errado). Nunca coloque em cache público algo que dependa do usuário.

**Como validar:** p95 da leitura no degrau que falhou; teste funcional de que a alteração aparece depois de invalidar.

## 8. Idempotência: chave + restrição única

**Como aparece:** caso de API `idempotencia` falha (4 envios criaram 4 registros); o Kaio cria pedidos duplicados com cliques repetidos; a Jéssica duplica ao tocar de novo.

**Como confirmar:** a rota de criação insere sem verificar repetição e não existe restrição única que impeça.

**Correção em duas camadas:**

1. **Servidor (obrigatório):** o cliente envia `Idempotency-Key` (um UUID por intenção de compra). O servidor guarda a chave com o resultado e devolve o mesmo resultado para repetições.

```sql
ALTER TABLE pedidos ADD COLUMN chave_idempotencia text;
CREATE UNIQUE INDEX CONCURRENTLY pedidos_chave_idempotencia_unica
  ON pedidos (tenant_id, chave_idempotencia);
```

```js
// INSERT ... ON CONFLICT faz a checagem e a gravação de forma atômica
const { rows } = await db.query(
  `INSERT INTO pedidos (tenant_id, chave_idempotencia, ...) VALUES ($1, $2, ...)
   ON CONFLICT (tenant_id, chave_idempotencia) DO UPDATE SET chave_idempotencia = EXCLUDED.chave_idempotencia
   RETURNING *`,
  [tenantId, req.get('Idempotency-Key'), ...],
);
```

2. **Interface (complemento):** desabilite o botão e mostre carregamento enquanto a requisição está em andamento. Sozinha, essa camada não basta (rede lenta, duas abas, refresh).

- Pagamentos: use também a chave de idempotência do provedor (Mercado Pago `X-Idempotency-Key`, Stripe `Idempotency-Key`).

**Risco:** baixo. Requisições antigas sem chave continuam funcionando se a coluna aceitar nulo.

**Como validar:** caso `idempotencia` passa (1 registro); prova do Kaio refeita.

## 9. Disputa por recurso

**Como aparece:** cenário de `disputa` falha: mais vendas do que o estoque, estoque negativo, o mesmo horário reservado duas vezes, cupom usado além do limite, saldo negativo.

**Como confirmar:** o código lê o valor, decide na aplicação e grava depois (`const p = await buscar(); if (p.estoque > 0) await salvar(p.estoque - 1)`). Entre a leitura e a gravação, outra requisição lê o mesmo valor.

**Correção, da mais simples para a mais robusta:**

1. **Update atômico condicional** (preferido quando cabe numa linha):

```sql
UPDATE produtos SET estoque = estoque - $2
WHERE id = $1 AND estoque >= $2
RETURNING estoque;
-- nenhuma linha devolvida = esgotado → responda 409
```

2. **Restrição no banco** como rede de segurança: `CHECK (estoque >= 0)`; para reservas, `UNIQUE (recurso_id, horario)` ou constraint de exclusão com intervalo.
3. **`SELECT … FOR UPDATE`** dentro de transação curta, quando a decisão envolve várias linhas.
4. **Lock otimista** com coluna `versao` (`@Version` no JPA; `UPDATE … WHERE id = $1 AND versao = $2`) e nova tentativa limitada no conflito.

No Supabase, coloque a operação numa função SQL (`rpc`) para que a checagem e a gravação sejam atômicas no banco, em vez de duas chamadas do cliente.

**Risco:** baixo para update condicional e `CHECK`; médio para `FOR UPDATE` (pode criar fila de bloqueio em recurso muito disputado).

**Como validar:** cenário de disputa refeito com o recurso no mesmo estado inicial: `sucessos` igual ao disponível e verificação dentro da condição.

## 10. App sem estado e escala horizontal

**Como aparece:** a CPU da instância chega ao limite no degrau de quebra; a plataforma tem uma instância só; o p95 sobe de forma uniforme em todas as rotas.

**Como confirmar:** leia a configuração da hospedagem (número de instâncias, CPU e memória, autoscaling). Verifique se o app guarda estado na memória do processo (sessão em memória, uploads em disco local, cache local que precisa ser consistente, filas em memória): isso impede escalar.

**Correção:**

- Tire o estado do processo: sessão em cookie assinado ou Redis; arquivos em armazenamento de objetos (S3, Supabase Storage); filas em serviço próprio.
- Escale horizontalmente com pelo menos 2 instâncias atrás do balanceador e autoscaling por CPU ou por requisições (Render, Fly, Railway, ECS, Kubernetes HPA, Cloud Run `min-instances`).
- Escale verticalmente (mais CPU/memória) como paliativo imediato.
- Ajuste o pool de conexões ao novo total de instâncias (seção 4).

**Risco:** médio. Custo da hospedagem sobe: estime com os preços da plataforma lida nos arquivos e diga isso no plano.

**Como validar:** estresse refeito no ambiente com a mesma topologia proposta.

## 11. CDN e compressão

**Como aparece:** a Jéssica (3G) demora para ver a primeira tela; páginas pesadas; muitas requisições de arquivos estáticos; banda alta na carga.

**Como confirmar:** respostas sem `Content-Encoding: gzip`/`br`; estáticos sem `Cache-Control` longo nem hash no nome; imagens grandes sem redimensionar.

**Correção:** compressão no servidor ou no proxy (`compression` no Express, `server.compression.enabled=true` no Spring, padrão no Nginx/CDN); estáticos com hash no nome e `Cache-Control: public, max-age=31536000, immutable`; imagens em WebP/AVIF com tamanhos responsivos; CDN na frente (Cloudflare, CloudFront, a CDN da plataforma).

**Risco:** baixo.

**Como validar:** tempo até a tela ficar utilizável na sessão da Jéssica; bytes recebidos por iteração na carga.

## 12. Rate limit

**Como aparece:** nenhuma rota recusa excesso de requisições; um único cliente consegue gerar a carga do teste inteiro; rotas caras (login, busca, LLM) sem proteção.

**Como confirmar:** não há middleware de limite (`express-rate-limit`, Bucket4j, limite no gateway ou na plataforma).

**Correção:** limite por IP e por usuário/tenant, mais rígido nas rotas caras, respondendo `429` com `Retry-After`. Com várias instâncias, guarde os contadores no Redis ou use o limite do gateway/CDN.

**Risco:** médio. Limite apertado demais bloqueia uso real (vários usuários atrás do mesmo IP de um restaurante, por exemplo). Comece generoso e meça.

**Como validar:** requisições acima do limite recebem `429`; o tráfego normal da carga esperada não é afetado.

## 13. Validação de entrada e erros úteis

**Como aparece:** casos de `validacao` com erro 500, rastro de pilha ou mensagem "Erro"; o Kaio consegue gravar quantidade negativa, CPF com emoji, nome só com espaços.

**Como confirmar:** o handler usa o corpo da requisição sem validar (`parseInt` sem checar `NaN`, sem esquema); o tratamento de erro devolve `err.message` ou nada.

**Correção:**

- Valide na borda com esquema: Zod/Joi/Valibot (Node), Bean Validation `@Valid` (Spring), Pydantic (Python). Rejeite com `400`/`422` e um corpo que diga **qual campo** e **o que fazer**:

```json
{ "erro": "Quantidade inválida.", "campos": { "quantidade": "Informe um número inteiro entre 1 e 99." } }
```

- Handler global de erro: loga o detalhe no servidor e devolve ao cliente uma mensagem genérica de `500`, **sem** rastro de pilha.
- Repita as regras críticas no banco (`CHECK`, `NOT NULL`), que é a última barreira.

**Risco:** baixo. Atenção a clientes antigos que enviavam dados fora do padrão.

**Como validar:** casos de `validacao` passam; prova de entradas estranhas do Kaio refeita.

## 14. Autenticação e isolamento entre contas

**Como aparece:** caso de `autenticacao` aceita requisição sem token; caso de `isolamento` devolve `200` para a conta B lendo ou alterando recurso da conta A; `PATCH` deixa trocar o dono do recurso.

**Como confirmar:** a rota não exige sessão; a consulta busca por `id` sem filtrar por dono ou tenant; o `PATCH` copia o corpo inteiro para o registro (atribuição em massa).

**Correção:**

- Middleware de autenticação aplicado por padrão a todas as rotas, com lista explícita das públicas.
- Toda consulta de recurso filtra por dono/tenant **no servidor**: `WHERE id = $1 AND tenant_id = $2`, com o tenant vindo da sessão, nunca do corpo ou da URL.
- Supabase: RLS ligado em todas as tabelas, com políticas que usam `auth.uid()` ou o claim de tenant do JWT (`(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`), e nunca `service_role` no cliente.
- Responda `404` para recurso de outro tenant (não revela que existe).
- Em `PATCH`/`PUT`, aceite só uma lista explícita de campos editáveis.

**Risco:** médio. Filtros novos podem esconder dados que telas legítimas usavam: rode os casos de caminho feliz de novo.

**Como validar:** casos de `autenticacao` e `isolamento` passam; caminho feliz continua passando.

## 15. Interface: acessibilidade, celular e feedback

**Como aparece:** achados das personas Marcos (teclado), Jéssica (celular), Dona Cida (jargão e confirmação) e Léo (atrito).

**Correções de boa prática:**

| Problema | Correção |
|---|---|
| Botão só com ícone | `aria-label="Abrir menu"` ou texto visível; `aria-expanded` em menus |
| Foco invisível | Remova `outline: none` ou troque por `:focus-visible { outline: 3px solid … }` |
| `div` clicável | Use `<button>` (ação) ou `<a href>` (navegação) |
| Campo sem rótulo | `<label for>` associado; placeholder não substitui rótulo |
| Erro só em vermelho | `aria-invalid`, mensagem ligada por `aria-describedby`, região `role="alert"` |
| Modal | Foco vai para o modal, `Esc` fecha, foco volta ao gatilho |
| Layout quebra no celular | `meta viewport`; larguras fluidas (`max-width: 100%`); tabelas com rolagem própria ou em cartões |
| Alvo de toque pequeno | Mínimo de 44×44 px |
| Fonte < 16 px em campo | 16 px evita o zoom automático no iPhone |
| Envio sem feedback | Desabilite o botão e mostre carregamento durante a requisição (veja também a seção 8) |
| Jargão | Troque por palavras do usuário ("Finalizar compra" em vez de "Checkout") |

**Risco:** baixo.

**Como validar:** a persona que encontrou o problema refaz o fluxo e conclui.
