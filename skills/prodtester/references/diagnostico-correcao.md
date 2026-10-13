# Etapa 4 — Diagnóstico e correção

Para cada achado: a causa raiz (confirmada com evidência ou marcada como hipótese), a camada e a correção de boa prática no formato da camada. Depois, o plano priorizado, a validação antes × depois e a guarda contra regressão no CI.

O catálogo de soluções está em `boas-praticas-escalabilidade.md`. Leia só a seção do problema em análise.

## 1. Investigar a causa raiz

Trabalhe nos achados em ordem de severidade. Para cada um:

1. **Parta da evidência.** Releia o passo, o screenshot, o caso de API ou o resultado de carga que gerou o achado.
2. **Encontre o código responsável.** Siga a rota (`endpoint` do achado ou requisição capturada) até o handler, o serviço e a consulta. Anote arquivo e linha.
3. **Procure a prova direta**, conforme o tipo:
   - código: a linha que faz a coisa errada (laço com consulta, `parseInt` sem checagem, falta de filtro por tenant, leitura e gravação separadas);
   - banco: `EXPLAIN ANALYZE` da consulta lenta, **só no banco local ou de staging e só com `SELECT`** (com escrita, use `EXPLAIN` sem `ANALYZE` ou `BEGIN … ROLLBACK` com o "sim" do usuário). Salve a saída em `explain/<id-do-achado>.txt` e use como evidência do tipo `explain`;
   - infra: o valor de configuração lido no arquivo (pool, instâncias, memória), com arquivo e linha;
   - medição: a curva de carga que mostra onde quebra e qual passo degrada primeiro.
4. **Classifique:**
   - `confirmada`: há prova direta, citada em `causa_raiz.evidencia` (`"src/rotas/pedidos.js:31 insere sem checar repetição"`, `"explain/A-004.txt: Seq Scan em 2,1 milhões de linhas"`);
   - `hipotese`: dedução plausível sem prova direta (por exemplo, sem acesso ao código ou ao banco). Diga o que confirmaria.
5. Preencha `causa_raiz` e `camada` no achado.

Sem acesso ao código-fonte (sistema de terceiros, só a URL), todas as causas ficam como hipótese, e o relatório diz isso.

## 2. Escrever a correção no formato da camada

Preencha `correcao` em cada achado. Use o catálogo como base e escreva para o código e a infra reais.

### Código

- **Diff unificado** contra o repositório do usuário, gravado em `correcoes/<id-do-achado>.diff` e referenciado em `correcao.diff`. O diff precisa aplicar com `git apply --check` no estado atual do repositório; confira antes de gravar.
- **Correções que mexem no mesmo trecho** (por exemplo, validação, autenticação e idempotência na mesma rota) viram **um diff combinado**, gravado no achado de maior prioridade e citado nos outros (`"diff": "correcoes/A-002.diff"`). Diffs separados que tocam as mesmas linhas conflitam quando aplicados em sequência.
- **Teste que prova a correção** (`correcao.teste`): o teste automatizado no estilo do projeto (mesmo framework) ou, no mínimo, o caso de API ou a prova da persona que precisa passar depois.
- **Não aplique no repositório do usuário sem pedido.** Se ele pedir, crie a branch `prodtester/correcoes-<AAAA-MM-DD>`, aplique só os diffs aprovados, rode os testes do projeto e mostre o resultado. Não faça push.

### Banco

- O comando exato (`CREATE INDEX CONCURRENTLY …`, reescrita da consulta, `ALTER TABLE … ADD CONSTRAINT`), no formato de migração que o projeto já usa (Prisma, Flyway, Liquibase, Supabase migrations, Alembic, Knex), em `correcoes/<id>.diff` ou `correcoes/<id>.sql`.
- Evidência: o `EXPLAIN ANALYZE` de antes.
- `correcao.risco`: bloqueios, tempo de criação do índice em tabela grande, espaço, efeito nas escritas.

### Hospedagem e infra

- **Nunca altere a infraestrutura.** Entregue os passos em `correcao.passos`: o que mudar, onde (arquivo, painel da plataforma, variável) e para qual valor. Exemplo: "Em `render.yaml`, `numInstances: 1` → `2`, e `DATABASE_POOL_MAX` de 5 para 10 (2 × 10 = 20 conexões, abaixo do limite de 97 do plano Basic do Postgres)".
- `correcao.custo_infra`: o impacto provável no custo, com a fonte do preço quando houver. Se não souber o preço, diga que precisa ser conferido.
- Se o ambiente de teste é diferente da produção (tamanho, número de instâncias), diga como isso muda a leitura dos números.

### Arquitetura

- O caminho estrutural (fila, cache distribuído, separação de leitura e escrita, réplica de leitura, pooler), com esforço estimado.
- **Um paliativo imediato** que reduz o risco enquanto a mudança grande não sai (teto de `limit`, timeout, aumento de pool, cache curto).

## 3. Priorizar

Preencha `impacto` (1 a 5: quanto o problema afeta usuários, dinheiro e dados) e `esforco` (1 a 5: 1 = linhas de configuração, 3 = mudança local com teste, 5 = mudança estrutural) em cada achado. Depois rode:

```bash
node <skill>/scripts/plano-correcao.mjs <execucao>
```

Regra aplicada pelo script:

1. **Críticos:** severidade crítica, sempre primeiro.
2. **Ganhos rápidos:** impacto ≥ 3 e esforço ≤ 2.
3. **Estruturais:** esforço ≥ 4.
4. **Melhorias:** o restante.

O script grava a prioridade em `achados.json`, gera `plano-correcao.json` e imprime o plano. Mostre ao usuário. Rode `validar.mjs` em seguida.

## 4. Capacidade depois das correções

O relatório mostra a capacidade esperada depois das correções prioritárias **só se ela tiver sido medida** numa revalidação. Sem revalidação, o campo diz "a medir com /revalidar". Nunca estime esse número.

## 5. Revalidação

Acionada por `/prodtester:revalidar` ou quando o usuário pede para conferir uma correção aplicada.

1. Leia `auditoria/ultima.txt` (ou a pasta indicada) para achar a auditoria original e o `achados.json` dela.
2. Crie uma nova pasta de execução e grave no `contexto.json` dela o campo `"revalidacao_de": "<pasta original>"`. As travas de segurança valem de novo: a carga precisa de nova confirmação nesta conversa.
3. Reexecute **só o que falhou**:
   - **API:** copie os casos que falharam (e os casos de que eles dependem por `capturar`) para um novo `testes/casos-api.json`, com os mesmos ids, e rode como no modo api.
   - **Carga:** rode de novo as etapas que mostraram o problema, com o mesmo cenário e os mesmos degraus. Para disputas, recoloque o recurso no mesmo estado inicial.
   - **Personas:** rode de novo só as personas e os fluxos com resultado diferente de `concluiu`.
4. Compare:
   ```bash
   node <skill>/scripts/comparar-revalidacao.mjs <pasta-original> <pasta-revalidacao>
   ```
   O script grava `revalidacao.json` com antes, depois e resultado (`corrigido`, `melhorou`, `sem-mudanca`, `piorou`, `inconclusivo`) e imprime o comparativo.
5. Mostre o comparativo ao usuário e gere o relatório da revalidação, que inclui a seção antes × depois.

Revalidação só compara medições feitas da mesma forma. Se o ambiente mudou (outra máquina geradora, outro tamanho de instância), diga isso no relatório.

## 6. Guarda contra regressão no CI

Ofereça ao usuário, sem aplicar sem o "sim" dele:

1. Copiar para a pasta `testes/` do projeto: `api.k6.js`, `casos-api.json`, `carga.k6.js` e `cenario-carga.json`.
2. Copiar `<skill>/templates/ci-github.yml` para `.github/workflows/prodtester.yml`, ajustando:
   - o passo que sobe o sistema (o template usa `docker compose up`);
   - `PRODTESTER_BASE_URL`;
   - os nomes dos segredos das contas de teste.

Com `PRODTESTER_FALHAR=1`, os executores tornam os limites obrigatórios: o job falha se algum caso de API falhar ou se o smoke passar de p95 e taxa de erro. Casos que ainda falham porque a correção não foi aplicada vão quebrar o CI; combine com o usuário se eles entram já ou depois das correções.
