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
- Credenciais de teste sem expor senhas, via segredos do navegador (`PRODTESTER_SEGREDOS`) ou sessão salva (`PRODTESTER_SESSAO`).
