# Formato dos dados da auditoria

Todas as etapas escrevem e leem os mesmos arquivos. O relatório é gerado **só** a partir deles. Por isso, um número que não está nesses arquivos não pode aparecer no relatório.

## Pasta de uma execução

Cada execução cria uma pasta própria dentro do projeto auditado:

```
auditoria/
├── ultima.txt                      # nome da pasta da execução mais recente
└── AAAA-MM-DD_HHMM/
    ├── contexto.json               # preparação: alvo, perfil, infra, fluxos, autorizações
    ├── plano.md                    # plano aprovado pelo usuário
    ├── narrativa.jsonl             # uma linha por fala das personas (alimenta o palco)
    ├── personas/<id>/
    │   ├── passos.jsonl            # um passo por linha
    │   ├── resumo.json             # resultado de cada fluxo para esta persona
    │   ├── requisicoes.json        # requisições que esta persona capturou
    │   └── screenshots/*.png
    ├── requisicoes.json            # requisições consolidadas (uma por método + rota)
    ├── matriz.json                 # resultado de cada fluxo para cada persona
    ├── testes/
    │   ├── api.k6.js               # gerado no modo api
    │   └── carga.k6.js             # gerado no modo carga
    ├── api/resultado.json          # resumo do k6 do modo api
    ├── carga/
    │   ├── <etapa>.json            # resumo do k6 de cada etapa
    │   ├── maquina.json            # uso de CPU e rede da máquina geradora
    │   └── consolidado.json        # saída do script de consolidação
    ├── achados.json                # todos os problemas encontrados
    ├── correcoes/<id-do-achado>.diff
    ├── revalidacao.json            # antes e depois, quando houver
    ├── relatorio.html
    └── relatorio.md
```

A pasta `auditoria/` contém dados do sistema auditado. Sugira ao usuário adicioná-la ao `.gitignore` do projeto dele.

Os scripts k6 ficam dentro da execução. No fim, ofereça copiar `testes/api.k6.js` e o smoke de carga para a pasta `testes/` do projeto, para o job de CI. Só copie com o "sim" do usuário.

## Regra para valores sensíveis

Em todos os arquivos abaixo, substitua por `«omitido»` o valor de cabeçalhos `Authorization`, `Cookie` e `Set-Cookie`, e de qualquer campo cujo nome contenha `senha`, `password`, `pass`, `token`, `secret`, `chave`, `key`, `cpf`, `cartao`, `card`. Dados pessoais de teste também são omitidos quando não forem necessários para entender o achado.

## `contexto.json`

```json
{
  "execucao": "2026-10-13_1530",
  "modo": "completo",
  "alvo": {
    "url": "http://localhost:3000",
    "api_base": "http://localhost:3000/api",
    "ambiente": "local",
    "classificacao_evidencia": "host localhost"
  },
  "autorizacao": { "confirmada": true, "por": "usuário na conversa", "em": "2026-10-13T15:30:00-03:00" },
  "perfil": {
    "principal": "saas-multitenant",
    "complementos": ["cardapio-publico"],
    "evidencias": ["coluna tenant_id em 9 tabelas", "políticas RLS em supabase/migrations"]
  },
  "stack": { "backend": "Node 22 + Express", "frontend": "HTML + JS", "banco": "PostgreSQL 16" },
  "infra": {
    "arquivos_lidos": ["docker-compose.yml", "Dockerfile"],
    "hospedagem_producao": "informada pelo usuário: Render, 1 instância de 512 MB",
    "pool_conexoes": { "valor": 2, "onde": "src/db.js:4" },
    "cache": null,
    "observacoes": []
  },
  "fluxos": [
    { "id": "comprar", "nome": "Comprar um produto", "critico": true, "inicio": "/", "sucesso": "Tela de confirmação com número do pedido" }
  ],
  "proibicoes": ["pagamento real", "e-mail para pessoas reais", "apagar dados que não foram criados pela auditoria"],
  "contas_teste": [{ "id": "conta-a", "tenant": "loja-a", "origem": "seed do projeto" }],
  "dependencias": { "playwright_mcp": true, "k6": "docker", "node": "24.13.1" },
  "carga": {
    "confirmado_nesta_execucao": false,
    "isolado_de_producao": null,
    "pico_esperado_usuarios": null
  },
  "modos_planejados": ["personas", "api", "carga", "diagnostico", "relatorio"],
  "modos_pulados": [{ "modo": "carga", "motivo": "usuário não confirmou" }]
}
```

Os campos `contas_teste` guardam apenas identificadores e a origem. Nunca senhas ou tokens.

## `narrativa.jsonl`

Uma linha JSON por fala, gravada pelo script `registrar.mjs`. O script `palco.mjs` acompanha este arquivo e mostra as falas ao vivo no terminal.

```json
{"t":"2026-10-13T15:41:02-03:00","persona":"novato","nome":"Dona Cida","emoji":"👵","tipo":"pensamento","texto":"O que é \"adicionar ao carrinho\"? Vou tentar o botão laranja."}
```

Valores de `tipo`: `inicio`, `acao`, `pensamento`, `problema`, `abandono`, `sucesso`, `fim`.

Valores de `persona`: o `id` da persona (`novato`, `apressado`, `celular-3g`, `so-teclado`, `quebrador` ou o id de uma persona personalizada).

## `personas/<id>/passos.jsonl`

```json
{"n":4,"t":"2026-10-13T15:41:05-03:00","fluxo":"comprar","acao":"clicou em \"Finalizar pedido\" 4 vezes","viu":"botão continuou habilitado, sem indicação de carregamento","reacao":"Ué, não aconteceu nada? Vou clicar de novo.","console_erros":[],"rede_erros":[{"metodo":"POST","rota":"/api/pedidos","status":500,"tempo_ms":812}],"screenshot":"screenshots/04-finalizar.png"}
```

## `personas/<id>/resumo.json`

```json
{
  "persona": "quebrador",
  "fluxos": [
    { "fluxo": "comprar", "resultado": "falhou", "passos": 9, "motivo": "4 pedidos criados com um único carrinho", "achados": ["A-003"] }
  ]
}
```

Valores de `resultado`: `concluiu` (✅), `concluiu_com_problemas` (⚠️), `falhou` (❌), `abandonou` (❌), `nao_executado` (—).

## `personas/<id>/requisicoes.json`

Gravado pela persona, uma entrada por requisição observada:

```json
[
  {
    "fluxo": "comprar",
    "persona": "novato",
    "metodo": "POST",
    "rota": "/api/pedidos",
    "url_exemplo": "http://localhost:3000/api/pedidos",
    "status": 201,
    "tempo_ms": 143,
    "tipo_conteudo": "application/json",
    "autenticacao": "cookie",
    "payload_exemplo": { "itens": [{ "produto_id": 7, "quantidade": 1 }] }
  }
]
```

Requisições de arquivos estáticos (imagens, CSS, JS, fontes) ficam fora.

## `requisicoes.json`

Gerado por `consolidar-personas.mjs`, uma entrada por método + rota. A `rota` é normalizada: identificadores viram parâmetros (`/api/produtos/42` vira `/api/produtos/:id`).

```json
[
  {
    "metodo": "POST",
    "rota": "/api/pedidos",
    "ocorrencias": 6,
    "status_vistos": [201, 500],
    "fluxos": ["comprar"],
    "personas": ["novato", "quebrador"],
    "autenticacao": "cookie",
    "tipo_conteudo": "application/json",
    "url_exemplo": "http://localhost:3000/api/pedidos",
    "payload_exemplo": { "itens": [{ "produto_id": 7, "quantidade": 1 }] },
    "tempo_ms": { "min": 120, "mediana": 143, "max": 812, "amostras": 6 }
  }
]
```

## `matriz.json`

Gerado por `consolidar-personas.mjs`:

```json
{
  "fluxos": [{ "id": "comprar", "nome": "Comprar um produto" }],
  "personas": [{ "id": "novato", "nome": "Dona Cida", "emoji": "👵", "cor": "magenta" }],
  "celulas": {
    "comprar": { "novato": { "resultado": "concluiu", "passos": 6, "motivo": null, "achados": [] } }
  }
}
```

## `achados.json`

Um objeto por problema. Todo achado precisa de pelo menos uma evidência.

```json
{
  "id": "A-003",
  "titulo": "Pedido duplicado com cliques repetidos em \"Finalizar pedido\"",
  "modo": "personas",
  "categoria": "idempotencia",
  "severidade": "critica",
  "onde": { "fluxo": "comprar", "persona": "quebrador", "endpoint": "POST /api/pedidos", "arquivo": "src/rotas/pedidos.js:31" },
  "evidencias": [
    { "tipo": "screenshot", "ref": "personas/quebrador/screenshots/04-finalizar.png", "resumo": "Botão habilitado durante o envio" },
    { "tipo": "requisicao", "ref": "requisicoes.json#POST /api/pedidos", "resumo": "4 respostas 201 em 600 ms com o mesmo carrinho" }
  ],
  "medicoes": { "pedidos_criados": 4, "cliques": 4 },
  "causa_raiz": {
    "status": "confirmada",
    "descricao": "A rota cria um pedido a cada POST e não existe chave de idempotência nem restrição única por carrinho.",
    "evidencia": "src/rotas/pedidos.js:31 insere sem verificar pedido existente"
  },
  "camada": "codigo",
  "correcao": {
    "resumo": "Chave de idempotência enviada pelo cliente e restrição única no banco.",
    "diff": "correcoes/A-003.diff",
    "passos": [],
    "teste": "Enviar 5 POST simultâneos com a mesma chave e verificar 1 pedido criado.",
    "risco": "Baixo. Requisições sem chave continuam funcionando.",
    "custo_infra": null
  },
  "impacto": 5,
  "esforco": 2,
  "prioridade": "critico",
  "revalidacao": null
}
```

### Campos com valores fixos

- `evidencias[].tipo`: `screenshot`, `requisicao`, `k6`, `console`, `explain`, `log`, `codigo`, `passo`, `medicao`. Os tipos `screenshot`, `k6`, `explain` e `log` apontam para um arquivo da execução, e `validar.mjs` confere se ele existe.
- `modo`: `personas`, `api`, `carga`, `volume`, `preparacao`.
- `categoria`: `bug`, `ux`, `acessibilidade`, `mobile`, `mensagem-de-erro`, `validacao`, `autenticacao`, `isolamento`, `idempotencia`, `disputa`, `limites`, `desempenho`, `escalabilidade`, `infra`, `robustez`.
- `camada`: `codigo`, `banco`, `infra`, `arquitetura`, `conteudo`.
- `causa_raiz.status`: `confirmada` (há evidência direta: linha de código, `EXPLAIN ANALYZE`, log, reprodução) ou `hipotese` (dedução plausível ainda sem prova). Nunca apresente hipótese como fato.
- `impacto` e `esforco`: de 1 a 5.
- `prioridade`: `critico`, `ganho-rapido`, `estrutural`, `melhoria`.

### Severidade

| Severidade | Quando usar |
|---|---|
| `critica` | Vazamento ou alteração de dados de outro usuário ou tenant; dinheiro ou estoque errado (duplicidade, saldo ou estoque negativo); fluxo crítico impossível de concluir; erro 500 no caminho feliz; queda ou erro acima de 5% com a carga esperada. |
| `alta` | Erro 500 em validação de entrada; fluxo crítico abandonado por uma persona por problema do sistema; p95 acima do limite com a carga esperada; barreira de acessibilidade que impede concluir um fluxo; autenticação que aceita token ausente ou expirado em rota não pública. |
| `media` | Problema de UX que atrasa mas não impede; mensagem de erro inútil; layout quebrado no celular sem impedir o fluxo; endpoint individual acima de 1 s; falta de teto em `limit`; degradação só no estresse acima do pico esperado. |
| `baixa` | Detalhe visual, texto confuso, aviso no console sem efeito visível, ganho de desempenho pequeno. |

Na dúvida entre duas severidades, escolha a menor e explique no achado o que faria subir.

## `revalidacao.json`

```json
[
  {
    "achado": "A-003",
    "teste": "5 POST simultâneos em /api/pedidos com a mesma chave",
    "antes": { "pedidos_criados": 5, "fonte": "auditoria/2026-10-13_1530/api/resultado.json" },
    "depois": { "pedidos_criados": 1, "fonte": "auditoria/2026-10-13_1712/api/resultado.json" },
    "resultado": "corrigido"
  }
]
```

Valores de `resultado`: `corrigido`, `melhorou`, `sem-mudanca`, `piorou`.
