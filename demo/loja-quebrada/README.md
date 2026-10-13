# Lojinha da Vila

Loja online de utensílios e presentes de pequenos produtores do Espírito Santo. Os clientes navegam pela vitrine, abrem o produto, colocam no carrinho e finalizam o pedido com a própria conta.

App de demonstração: roda só na sua máquina.

## Como rodar

```bash
docker compose up --build
```

A loja abre em http://localhost:3000. Na primeira vez, o banco leva alguns segundos a mais para carregar o histórico de pedidos e avaliações.

Para recomeçar do zero (estoque e pedidos originais):

```bash
docker compose down -v && docker compose up --build
```

## Contas de teste

| Cliente | E-mail | Senha |
|---|---|---|
| Ana Teste | ana@loja.test | lojinha-ana-123 |
| Bia Teste | bia@loja.test | lojinha-bia-123 |

Essas contas existem apenas no banco local deste app.

## Stack

- Node.js 22 + Express, em `src/`
- PostgreSQL 16, esquema e dados em `db/init.sql`
- Páginas em HTML e JavaScript puro, em `public/`

## API

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/login` | Entra com e-mail e senha; devolve um token |
| GET | `/api/eu` | Dados do cliente logado |
| GET | `/api/produtos` | Lista de produtos (`?busca=`, `?limit=`) |
| GET | `/api/produtos/:id` | Detalhe do produto, com avaliações e vendidos |
| GET | `/api/pedidos` | Pedidos do cliente logado |
| GET | `/api/pedidos/:id` | Detalhe de um pedido |
| POST | `/api/pedidos` | Cria um pedido: `{ "itens": [{ "produto_id": 1, "quantidade": 1 }], "observacao": "" }` |

As rotas de pedidos exigem `Authorization: Bearer <token>`.

## Hospedagem

Em produção, a Lojinha roda numa instância de 512 MB no Render, com Postgres gerenciado no plano Basic.
