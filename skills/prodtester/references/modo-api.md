# Etapa 2 — Modo api

Cada endpoint do sistema é testado por casos descritos em JSON e executados pelo k6, uma vez cada. O resultado é determinístico: a mesma execução, no mesmo estado do sistema, dá o mesmo resultado. Os erros 500 em validação, os vazamentos entre contas e as duplicidades aparecem aqui com prova.

Antes de começar, releia a seção de proibições de `seguranca.md`.

## 1. Descobrir os endpoints

Monte a lista de endpoints a partir destas fontes, nesta ordem, juntando o que cada uma trouxer:

1. **OpenAPI/Swagger.** Se a especificação estiver em JSON (arquivo ou URL do ambiente de teste):
   ```bash
   node <skill>/scripts/openapi-endpoints.mjs <arquivo-ou-url>
   ```
   Em YAML, leia o arquivo diretamente.
2. **Rotas no código.** Procure as definições de rota do framework (por exemplo `router.get(`, `app.post(`, `@GetMapping`, `@app.get(`, `route.ts` do Next.js, `supabase/functions/`, `pages/api/`). Para cada rota, leia o handler: que campos ele lê, que validação faz, se exige autenticação e se filtra por usuário ou tenant.
3. **Requisições capturadas** pelas personas em `<execucao>/requisicoes.json`, que trazem payloads reais.

Fora da lista ficam: rotas de `proibicoes.rotas_proibidas` e de `api.ignorar` do yaml, webhooks de provedores externos, rotas de administração e qualquer rota que dispare efeito fora do ambiente (e-mail, SMS, pagamento real).

## 2. Escrever os casos

Grave `<execucao>/testes/casos-api.json`, seguindo o modelo comentado em `<skill>/templates/casos-api.example.json`. Para cada endpoint, gere os tipos de caso abaixo que fizerem sentido. No modo `rapido`, só `caminho_feliz`, `validacao` e `autenticacao`.

| Tipo | O que provar | Esperado |
|---|---|---|
| `caminho_feliz` | Requisição válida funciona e devolve o formato certo | Status 2xx, JSON, campos principais presentes |
| `validacao` | Campo obrigatório faltando, tipo errado, valor extremo (negativo, zero, enorme, vazio, só espaços, emoji em campo numérico) | Status 400 ou 422 com mensagem útil. **Nunca 500** |
| `autenticacao` | Sem token e com token inválido (`"conta": "invalida"`) em rota não pública | Status 401 |
| `isolamento` | Conta B lendo, alterando ou apagando recurso criado pela conta A | Status 403 ou 404 |
| `idempotencia` | O mesmo `POST` de criação ou pagamento repetido 4 vezes ao mesmo tempo | No máximo 1 registro criado |
| `limites` | `limit` ou `per_page` gigante, página enorme, texto de 100 mil caracteres | Teto aplicado (`max_itens`) ou 4xx, tempo dentro do limite, nunca 500 |

Regras para os casos:

- **Um caso, uma pergunta.** Cada caso testa uma coisa só e tem `descricao` em português claro, porque ela aparece no relatório.
- **Ids sequenciais** `C-001`, `C-002`, …, e `endpoint` no formato `MÉTODO /rota/:param`.
- **Dados de teste de verdade:** use payloads parecidos com os capturados pelas personas. Para valores únicos (e-mail, documento), use `{{aleatorio}}`.
- **Credenciais só por referência:** `{{segredo:NOME}}` ou `token_env`. Nunca escreva um valor de credencial no arquivo.
- **Encadeamento:** `capturar` guarda um campo da resposta numa variável, e `{{variavel}}` usa esse valor em casos seguintes. É assim que a conta B tenta acessar o recurso que a conta A acabou de criar.
- **Isolamento exige duas contas de teste em tenants ou usuários diferentes.** Sem a segunda conta, não escreva casos de isolamento: registre no plano que o isolamento ficou "não executado" e por quê. Nunca use chaves que ignoram as regras de acesso (`service_role`, chave de administrador).
- **Idempotência:** se o sistema documenta um cabeçalho de idempotência (`Idempotency-Key` ou parecido), gere um caso com a mesma chave nos 4 envios. Gere também um caso sem chave nas rotas de criação mais sensíveis (pedido, pagamento em sandbox, reserva); um sistema sem proteção nenhuma cria 4 registros.
- **Corpo malformado** (JSON quebrado, com `corpo_bruto`) é um caso válido de `validacao`, com esperado 400. Se o código mostrar que ele pode derrubar o processo, coloque esse caso por último, para não interromper os outros, e registre a queda como achado crítico se ela acontecer.
- **Métodos destrutivos** (`DELETE`, e `PUT`/`PATCH` que apagam dados) só em recursos criados pelos próprios casos.
- **Proibido:** injeção (SQL, comando, template, scripts), força bruta de senha ou de ids, fuzzing com milhares de variações e qualquer tentativa de contornar a autenticação. Os casos de validação usam poucos valores estranhos e realistas.

Contas declaradas em `contas`:

- `"tipo": "bearer"`, `"cabecalho"` ou `"cookie"` com `token_env`: o token vem da variável ou do arquivo de segredos.
- `"tipo": "login"`: o script faz o login no início com `{{segredo:...}}` e usa o token devolvido (campo `extrair`) ou o cookie (`extrair_cookie`).
- `"conta": "nenhuma"` nos casos públicos e de autenticação; `"conta": "invalida"` envia um token inválido.

## 3. Preparar e rodar

1. Copie o executor e crie a pasta de resultados:
   ```bash
   node <skill>/scripts/preparar-testes.mjs <execucao> api
   ```
2. Rode a partir da pasta da execução, com o k6 local ou, se não houver, com Docker. Passe sempre a URL base:
   ```bash
   bash <skill>/scripts/rodar-k6.sh --base <url> --saida api/resultado.json <execucao> testes/api.k6.js
   ```
   O executor lê `casos-api.json` da mesma pasta do script. Se o usuário usa `PRODTESTER_SEGREDOS`, a variável já está no ambiente e o script a repassa.
3. Consolide e mostre a tabela ao usuário:
   ```bash
   node <skill>/scripts/consolidar-api.mjs <execucao>
   ```

Se uma conta de teste não conseguiu logar, a tabela mostra o erro. Os casos dela ficam "não executados", nunca "aprovados".

## 4. Registrar os achados

Para cada caso que falhou, crie ou complemente um achado em `achados.json` com `modo: "api"`:

- evidência `{"tipo": "requisicao", "ref": "api/resultado.json#C-003", "resumo": "status 500 em 34 ms, corpo: TypeError…"}`;
- categoria pelo tipo do caso: `validacao`, `autenticacao`, `isolamento`, `idempotencia`, `limites`; erro 500 no caminho feliz é `bug`; caso lento é `desempenho`;
- severidade pela tabela de `formato-dados.md`. Vazamento entre contas e duplicidade são críticos. Erro 500 em validação é alto. Mensagem de erro inútil é média. Detalhe técnico exposto na resposta (rastro de pilha) é alto;
- se o mesmo problema já apareceu nas personas (por exemplo, o pedido duplicado do Kaio), junte as evidências no achado existente em vez de criar outro.

Depois, rode `node <skill>/scripts/validar.mjs <execucao>` e corrija os erros.

## 5. Guardar para o CI

`testes/api.k6.js` e `testes/casos-api.json` formam um teste reproduzível. No fim da auditoria, ofereça copiá-los para a pasta `testes/` do projeto, para o job de CI gerado no diagnóstico.
