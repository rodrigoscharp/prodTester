# Perfis de sistema

O perfil do sistema decide o plano de teste. Uma carga de 500 usuários simultâneos é essencial num SaaS e não faz sentido num app que só o dono usa. Detecte o perfil **antes** de montar o plano e registre a evidência que levou à conclusão em `contexto.json` (`perfil.evidencias`).

Se o `testes-fluxos.yaml` definir `sistema.perfil` com um valor diferente de `auto`, use esse valor e pule a detecção. Ainda assim, avise se a evidência encontrada contradiz o perfil declarado.

## Como detectar

Procure os sinais abaixo no código, na documentação e na infraestrutura. Conte os sinais de cada perfil. O perfil com mais sinais fortes vence. Em caso de empate ou dúvida, pergunte ao usuário, mostrando os sinais encontrados.

### SaaS multiusuário / multi-tenant

Sinais fortes:
- Colunas ou campos `tenant_id`, `organization_id`, `org_id`, `workspace_id`, `company_id`, `account_id`, `restaurant_id`, `store_id` nas tabelas principais.
- Políticas de Row Level Security (`CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`), comum em projetos Supabase.
- Rotas com escopo de tenant: `/:org/...`, `/t/:tenant/...`, subdomínio por cliente (`*.app.com`).
- Cadastro público de novas contas, planos de assinatura, cobrança recorrente (Stripe, Mercado Pago, Pagar.me, Asaas).
- Convite de membros, papéis (`role`, `admin`, `owner`, `member`).

Sinais de apoio:
- Hospedagem em nuvem com autoscaling, várias réplicas, balanceador.
- Filas, cache distribuído (Redis), CDN.

### App local-first / monousuário

Sinais fortes:
- Empacotamento desktop: Electron, Tauri, Wails, ou instruções de "rodar localmente" como forma principal de uso.
- Ausência de cadastro público; um único usuário fixo ou autenticação apenas local.
- Banco embutido ou local (SQLite, PGlite, IndexedDB, Postgres no `docker-compose` da própria máquina) sem configuração de hospedagem remota.
- Integração com LLM local (Ollama, llama.cpp, LM Studio, vLLM em `localhost`).
- `docker-compose.yml` como única infraestrutura, sem Terraform, Kubernetes ou configuração de plataforma.

Sinais de apoio:
- Sincronização opcional, exportação e importação de dados, backups locais.
- README falando em "meus dados", "pessoal", "produtividade".

### API pública / backend puro

Sinais fortes:
- Nenhum frontend no repositório (sem `index.html`, sem framework de UI, sem rotas que devolvem HTML).
- Especificação OpenAPI/Swagger, GraphQL schema ou gRPC `.proto` como interface principal.
- Autenticação por chave de API, OAuth client credentials ou JWT emitido para integrações.
- Documentação voltada a desenvolvedores consumidores (SDKs, exemplos de `curl`, limites de requisição).

### Híbridos

Sistemas reais misturam perfis. Exemplos comuns:
- SaaS com app de cliente final público (cardápio digital, vitrine, página de agendamento): trate como **SaaS multi-tenant** e adicione um cenário de leitura pesada anônima.
- Backend puro que serve um app mobile: trate como **API pública**, com personas apenas se houver versão web.
- App local-first com sincronização na nuvem: trate como **local-first** e teste a sincronização como API.

Registre o híbrido em `contexto.json` como perfil principal mais `perfil.complementos`.

## Plano de teste por perfil

| Aspecto | SaaS multi-tenant | Local-first / monousuário | API pública |
|---|---|---|---|
| Personas | Todas as padrão + personalizadas do público | 1 persona principal (usuário intenso) + `so-teclado` + `quebrador` | Nenhuma |
| Modo api | Completo, com **isolamento entre dois tenants** obrigatório | Caminho feliz, validação e limites; isolamento só se houver multiusuário | Completo, com foco em autenticação, limites e idempotência |
| Modo carga | Escada de usuários virtuais até quebrar, pico, disputa | **Sem escada de usuários.** Volume de dados e responsividade | Escada de usuários virtuais, pico, disputa |
| Métrica principal | Usuários simultâneos com p95 < 500 ms | Tempo das telas pesadas com N registros, memória, latência de operações longas | Requisições por segundo com p95 < limite |
| Riscos típicos | Vazamento entre tenants, disputa por recurso, pool de conexões | N+1 com muitos registros, listas sem paginação, memória crescendo, chamadas a LLM sem timeout | Falta de rate limit, `limit` sem teto, falta de idempotência |

### SaaS multi-tenant: o que é obrigatório

1. **Duas contas de teste em tenants diferentes** (A e B) para o modo api. Sem elas, o teste de isolamento fica marcado como "não executado", nunca como "aprovado".
2. Tokens de usuário comum. Nunca chaves privilegiadas que ignoram as regras de acesso (por exemplo `service_role` do Supabase).
3. Cenário de carga que reflita o horário de pico real do negócio. Pergunte qual é ("sexta à noite", "segunda de manhã", "fim do mês") e modele a mistura de leitura e escrita desse momento.

### Local-first: como trocar a carga

Em vez da escada de usuários virtuais, o modo carga roda:

1. **Volume de dados:** popular o ambiente de teste com volumes crescentes (por exemplo 1 mil, 10 mil, 100 mil registros na entidade principal) usando o seed do próprio projeto ou a API, e medir o tempo das telas e endpoints mais pesados em cada degrau.
2. **Responsividade:** de 1 a 3 usuários virtuais alternando entre seções, medindo p95 por tela.
3. **Memória:** amostrar o consumo de memória do processo do backend (`docker stats`, `ps`) antes, durante e depois de cada degrau.
4. **Operações longas:** medir latência, timeout e comportamento de cancelamento de operações demoradas (por exemplo chamadas a um LLM local). Registrar p50, p95 e o maior tempo observado.

Popular dados só acontece em ambiente local ou de teste e só com confirmação do usuário, porque escreve no banco.

### API pública: o que muda

- Sem personas de navegador. Pule o modo personas e diga isso no relatório.
- Descoberta de endpoints começa pela especificação (OpenAPI, GraphQL) e depois pelas rotas no código.
- Fluxos de carga montados a partir dos exemplos da documentação ou de sequências típicas de integração.
