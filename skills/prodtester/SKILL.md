---
name: prodtester
description: Auditoria completa de um sistema web em ambiente local ou de staging. Personas sintéticas navegam pelos fluxos como usuários reais, a API é testada endpoint por endpoint, a carga sobe com k6 até o ponto de quebra e cada problema sai com causa raiz, correção e um relatório visual com números medidos. Use quando pedirem para auditar um sistema, testar fluxos, testar carga ou escalabilidade, ou avaliar UX e acessibilidade de um app web.
argument-hint: "[completo|rapido|carga|revalidar|personas|api] [url-ou-caminho]"
allowed-tools: Bash(bash ${CLAUDE_SKILL_DIR}/scripts/verificar-dependencias.sh) Bash(date *)
---

# prodtester

Você vai auditar um sistema web e entregar um relatório em que **todo número veio de uma medição feita nesta execução**.

- Diretório desta skill: `${CLAUDE_SKILL_DIR}`. Nas references, ele aparece como `<skill>`.
- Raiz do plugin: `${CLAUDE_PLUGIN_ROOT}`.
- Projeto auditado: o diretório de trabalho atual, salvo se o usuário indicar outro caminho.

## Estado ao carregar

- Execução: !`date +%Y-%m-%d_%H%M`
!`bash ${CLAUDE_SKILL_DIR}/scripts/verificar-dependencias.sh`

## Modo desta execução

Argumentos recebidos: `$ARGUMENTS`

A primeira palavra escolhe o modo. Sem argumento, use `completo`. O resto é a URL alvo ou o caminho do projeto.

| Modo | Etapas |
|---|---|
| `completo` | Preparação → Personas → API → Carga → Diagnóstico → Relatório |
| `rapido` | Preparação → Personas `novato` e `quebrador` só nos fluxos críticos → API só caminho feliz, validação e autenticação → Diagnóstico só dos achados críticos → Relatório |
| `carga` | Preparação → API → Carga → Diagnóstico → Relatório |
| `personas` | Preparação → Personas → Diagnóstico → Relatório |
| `api` | Preparação → API → Diagnóstico → Relatório |
| `revalidar` | Reexecuta o que falhou na última auditoria e gera o antes × depois |

O perfil do sistema pode remover etapas. Por exemplo, uma API pública não tem personas, e um app local-first troca a escada de usuários por volume de dados. Sempre diga ao usuário o que foi pulado e por quê.

## Princípios

1. **Segurança primeiro.** Leia `<skill>/references/seguranca.md` antes de qualquer outra coisa. Nunca produção, nunca senha real, nunca carga sem confirmação nesta execução.
2. **Só reporte o que foi observado.** Todo achado tem evidência: screenshot, requisição, resumo do k6, linha de código, `EXPLAIN ANALYZE`. Sem medição, o campo fica "não medido". Nada de estimativa apresentada como resultado.
3. **Fato separado de hipótese.** Causa raiz é `confirmada` (com evidência direta) ou `hipotese`. Nunca misture.
4. **Não altere o sistema auditado.** Correções são propostas. Aplicar só com pedido do usuário, numa branch separada.
5. **Leia cada reference só quando chegar na etapa dela.** Não carregue tudo de uma vez.
6. **Os arquivos da execução são a fonte da verdade.** Siga `<skill>/references/formato-dados.md`. O relatório sai só deles.
7. **Comandos simples.** Leia arquivos com as ferramentas de leitura e busca, não com `cat` ou laços no shell. No Bash, prefira os scripts de `<skill>/scripts/`, um comando por chamada, sem `for`, `&&` ou `|`. Assim a auditoria roda com o mínimo de pedidos de permissão.

## Etapas

Ao começar cada etapa, mostre um título curto para o usuário, por exemplo `━━ Etapa 2/5 · Testes de API ━━`, e ao terminar, uma linha com o que foi medido.

### Etapa 0 · Preparação (sempre)

Leia `<skill>/references/preparacao.md` e `<skill>/references/perfis-de-sistema.md`. Resultado: pasta da execução, `contexto.json` e `plano.md` aprovados pelo usuário.

O modelo de configuração do projeto é `<skill>/templates/testes-fluxos.example.yaml`. Se o projeto não tiver um `testes-fluxos.yaml`, ofereça copiar o modelo no fim da auditoria, já preenchido com o que foi descoberto.

### Etapa 1 · Personas

Leia `<skill>/references/modo-personas.md`. As personas ficam em `<skill>/personas/` e rodam em paralelo como subagentes, cada uma com o seu navegador.

### Etapa 2 · API

Leia `<skill>/references/modo-api.md`.

### Etapa 3 · Carga

Leia `<skill>/references/modo-carga.md`. Só com as condições de `seguranca.md` cumpridas.

### Etapa 4 · Diagnóstico e correção

Leia `<skill>/references/diagnostico-correcao.md`. O catálogo de soluções está em `<skill>/references/boas-praticas-escalabilidade.md`; consulte só a seção do problema em análise.

### Etapa 5 · Relatório

Leia `<skill>/references/relatorio.md`.

### Revalidar

Leia a seção "Revalidação" de `<skill>/references/diagnostico-correcao.md`. A última execução está indicada em `auditoria/ultima.txt`.

## Ao terminar

Mostre ao usuário, em poucas linhas:

1. o placar de saúde e a capacidade medida;
2. os 3 problemas mais graves, cada um com a correção em uma frase;
3. o caminho do `relatorio.html` e do `relatorio.md`;
4. o que ficou fora e por quê;
5. as ofertas pendentes (copiar os scripts k6 para `testes/`, criar o `testes-fluxos.yaml`, aplicar correções numa branch). Cada uma só acontece com o "sim" do usuário.
