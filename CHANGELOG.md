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
- Leitura de especificações OpenAPI em JSON (`openapi-endpoints.mjs`).
- Credenciais de teste sem expor senhas, via segredos do navegador (`PRODTESTER_SEGREDOS`) ou sessão salva (`PRODTESTER_SESSAO`).
