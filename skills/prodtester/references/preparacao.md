# Etapa 0 — Preparação

A preparação sempre roda, em todos os modos. O resultado dela é o `contexto.json` e o `plano.md` da execução, aprovados pelo usuário. Nenhum teste começa antes disso.

Antes de começar, leia `seguranca.md`.

## 1. Criar a pasta da execução

1. Crie `auditoria/<AAAA-MM-DD_HHMM>/` no diretório do projeto, usando a data e hora informadas no topo do `SKILL.md`.
2. Grave o nome da pasta em `auditoria/ultima.txt`.
3. Se o projeto tiver `.gitignore` e ele não ignorar `auditoria/`, sugira ao usuário adicionar a linha. Não edite o arquivo sem o "sim" dele.

## 2. Entender o produto sozinho

Leia, nesta ordem, o que existir:

1. `testes-fluxos.yaml` na raiz do projeto. Se existir, ele tem prioridade sobre o que você deduzir.
2. `README`, pasta `docs/`, `CONTRIBUTING`, `CHANGELOG`.
3. Especificação de API: `openapi.(json|yaml)`, `swagger.(json|yaml)`, rotas como `/openapi.json`, `/swagger.json`, `/docs`, `/api-docs`, `/v3/api-docs` (Spring), `/graphql` com introspecção desligada ou ligada.
4. Rotas no código: arquivos de roteamento do framework (por exemplo `app/`, `pages/`, `routes/`, `controllers/`, `@RestController`, `router.get(`, `@app.get(`).
5. Modelo de dados: migrações, `schema.prisma`, entidades JPA, `supabase/migrations`, arquivos `.sql`.
6. Seeds e fixtures: contas de teste, dados de exemplo.
7. Landing page do produto, se a URL estiver no README e não for produção. Só leitura; nada de cadastro.

Com isso, escreva em poucas linhas o que o produto faz, quem usa e quais são os fluxos de valor. Proponha de 3 a 6 **fluxos críticos** com: id curto, nome, tela inicial, objetivo e critério de sucesso observável ("tela de confirmação com número do pedido", não "funciona").

## 3. Detectar o perfil do sistema

Leia `perfis-de-sistema.md` e classifique o sistema. Guarde as evidências em `contexto.json` (`perfil.evidencias`). O perfil muda quais modos rodam e como.

## 4. Ler a infraestrutura

Procure e leia o que existir:

- `Dockerfile`, `docker-compose*.yml`, `Procfile`.
- Terraform (`*.tf`), Kubernetes (`*.yaml` com `kind: Deployment`), Helm.
- Configuração de plataforma: `vercel.json`, `render.yaml`, `fly.toml`, `railway.json`, `app.yaml`, `netlify.toml`, `nixpacks.toml`, `.platform.app.yaml`, `heroku.yml`.
- Configuração de banco e pool: `max`, `pool_size`, `maximumPoolSize`, `connection_limit`, `DATABASE_URL` com `?connection_limit=`, `pgbouncer`, `spring.datasource.hikari.*`.
- Cache: Redis, Memcached, cabeçalhos `Cache-Control`, CDN.
- Variáveis de ambiente de exemplo (`.env.example`). Nunca leia `.env` com segredos reais para copiar valores; só para saber **quais** variáveis existem.

Registre em `contexto.json` (`infra`) o que encontrou, com arquivo e linha. Isso é o que permite, no diagnóstico, uma correção do tipo "mude `max: 2` para `max: 20` em `src/db.js:4`" em vez de "aumente o pool".

## 5. Verificar dependências

O topo do `SKILL.md` já traz o resultado de `scripts/verificar-dependencias.sh`. Complete com:

- **Playwright MCP:** verifique se as ferramentas `mcp__plugin_prodtester_pw-cida__browser_navigate` (e as dos outros navegadores) estão disponíveis. Se não estiverem, o modo personas não roda. Explique que o plugin precisa estar habilitado e que o Node.js com `npx` é necessário.
- **k6:** use o k6 local se existir. Se não existir e o Docker estiver rodando, use a imagem `grafana/k6`. Se nenhum dos dois existir, os modos api e carga não rodam. Mostre como instalar (`brew install k6`, `winget install k6`, `sudo apt install k6` ou o site oficial) e siga com os modos possíveis.

## 6. Perguntar o que falta, numa única mensagem

Junte tudo o que ainda não está no yaml nem é dedutível e pergunte **de uma vez**. Use a ferramenta de perguntas quando houver opções claras. Itens possíveis:

1. **URL alvo** (local ou staging). Nunca produção.
2. **Autorização:** o usuário é dono do sistema ou tem autorização do dono?
3. **Proibições:** pagamento real, e-mail ou SMS para pessoas reais, apagar dados, outras ações que não podem acontecer.
4. **Login:** contas de teste do projeto, variáveis de ambiente com credenciais de teste, ou sessão exportada pelo usuário. Nunca a senha real.
5. **Fluxos críticos:** confirme ou ajuste a lista proposta.
6. **Público:** se quiser personas personalizadas, peça uma descrição curta do público real.
7. **Carga** (só se o modo incluir carga):
   - confirmação explícita para rodar carga **nesta execução**;
   - o ambiente compartilha banco ou infraestrutura com produção?
   - pico de usuários simultâneos esperado (ou, no perfil local-first, volume de dados realista);
   - onde a produção está hospedada (plataforma, tamanho da instância, número de instâncias), para comparar com o ambiente de teste.

Não pergunte o que o yaml já responde. Se o usuário não responder algum item de carga, a carga fica fora e o motivo vai para `contexto.json` (`modos_pulados`).

## 7. Montar e aprovar o plano

Escreva `plano.md` com:

- resumo do produto e perfil detectado (com a evidência principal);
- fluxos críticos;
- modos que vão rodar e os que ficaram de fora, com o motivo;
- personas escaladas e o fluxo de cada uma;
- para carga: etapas, números de usuários, duração estimada e critério de interrupção;
- proibições e contas de teste que serão usadas (só identificadores).

Mostre o plano ao usuário de forma curta e espere o "sim". Depois grave `contexto.json` e siga para a primeira etapa de teste.
