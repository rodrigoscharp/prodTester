# Changelog

Todas as mudanças relevantes deste projeto ficam registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue o [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Esqueleto do plugin: manifesto, marketplace e servidores Playwright MCP (um navegador isolado por persona).
- Skill `prodtester` com orquestração por etapas e modos (`completo`, `rapido`, `carga`, `personas`, `api`, `revalidar`).
- Atalhos `/prodtester:auditar`, `/prodtester:auditar-rapido`, `/prodtester:auditar-carga` e `/prodtester:revalidar`.
- Referências de preparação, perfis de sistema, segurança e formato dos dados da auditoria.
- Modelo comentado `testes-fluxos.example.yaml` e verificação automática de dependências.
- Cinco personas padrão (Dona Cida, Léo, Jéssica, Marcos e Kaio) e gerador de personas personalizadas.
- Subagentes de persona em paralelo, cada um com o seu navegador isolado; rede 3G simulada para a Jéssica.
- Narrativa ao vivo (`registrar.mjs`) e palco no terminal (`palco.mjs`), com reapresentação para gravação.
- Hook que aprova automaticamente só os navegadores do prodtester, o script de registro e a leitura dos arquivos do plugin, para as personas rodarem sem interrupção.
- Consolidação da etapa de personas (`consolidar-personas.mjs`): requisições por rota com tempos e matriz fluxo × persona.
- Validação dos achados (`validar.mjs`): formato, campos obrigatórios e existência dos arquivos de evidência.
- Modo api: casos em JSON por endpoint (caminho feliz, validação, autenticação, isolamento entre contas, idempotência e limites) executados por um único `api.k6.js`, com resultado por caso e tabela endpoint × check.
- `rodar-k6.sh`: usa o k6 local ou a imagem Docker `grafana/k6`, repassando credenciais sem expô-las.
- `preparar-testes.mjs`: copia os executores k6 para a execução sem alteração.
- Modo carga: jornadas reais com pausas humanas e dados variados em `cenario-carga.json`, executadas por `carga.k6.js` nas etapas smoke, esperada, estresse, pico, resistência e responsividade, com métricas por degrau e por passo e interrupção automática acima de 5% de erro.
- Cenários de disputa por recurso com verificação antes e depois e resultado inconclusivo quando o estado inicial não permite concluir.
- `rodar-carga.sh` com travas de segurança (confirmação nesta execução, ambiente isolado, alvo registrado) e monitor de CPU do k6, CPU da máquina e memória do sistema auditado.
- `consolidar-carga.mjs`: curva usuários × p95 × erro, capacidade medida, ponto de quebra, passos mais lentos e alertas de validade.
- Diagnóstico e correção: causa raiz confirmada ou hipótese, correção no formato da camada (diff, migração, passos de infraestrutura com custo, caminho de arquitetura com paliativo) e catálogo de boas práticas com 15 temas.
- `plano-correcao.mjs`: prioridade por severidade, impacto e esforço (críticos, ganhos rápidos, estruturais, melhorias).
- Revalidação (`comparar-revalidacao.mjs`): antes × depois por caso de API, degrau de carga, disputa e fluxo de persona.
- Guarda contra regressão: modelo de job do GitHub Actions e modo `PRODTESTER_FALHAR=1` nos executores k6.
- Relatório em forma de laudo (`gerar-relatorio.mjs`): HTML autocontido que abre offline, com tema papel de eletrocardiograma e tema monitor, placar em dígitos de monitor, traçado do teste de esforço, matriz e linha do tempo das personas com screenshots, tabela de API, gráficos de carga, conduta com diffs realçados, antes × depois e limites; versão em Markdown para PR e issue.
- Placar de saúde com fórmula documentada: penalidade por severidade, nota por exame, média ponderada dos exames realizados e teto de 59 com achado crítico.
- App de demonstração `demo/loja-quebrada` (Node + Express + Postgres, sobe com `docker compose up`) com 10 bugs plantados e gabarito em `demo/gabarito-loja-quebrada.md`, fora da pasta do app.
- Avaliação na loja-quebrada (`demo/avaliacao.md`): 9 de 10 bugs na primeira rodada, todos os críticos, e o décimo (layout no celular) depois do ajuste da persona Jéssica.
- Leitura de especificações OpenAPI em JSON (`openapi-endpoints.mjs`).
- Credenciais de teste sem expor senhas, via segredos do navegador (`PRODTESTER_SEGREDOS`) ou sessão salva (`PRODTESTER_SESSAO`).
- README de vitrine com instalação em 3 comandos, screenshots do laudo, configuração, segurança e como contribuir.
- Hook aprova também a gravação de arquivos dentro de `<projeto>/auditoria/` e o novo `conferir-correcoes.mjs`, que confere todos os diffs com `git apply --check` sem alterar o repositório.
- Monitor da máquina mede o tráfego de rede do gerador (contêiner do k6 ou interfaces da máquina) e alerta quando passa de 80% da capacidade informada em `PRODTESTER_REDE_MBPS`.

### Corrigido
- Etapas de carga longas não morrem mais quando a execução é não interativa: rodam ou são aguardadas em primeiro plano.
- URLs com acentos ou emoji nos casos de API e nas jornadas de carga.
- Medição de estouro de largura no celular usa a largura real da tela.
- Falas das personas entre aspas simples, sem recusa do hook por caracteres de shell.
