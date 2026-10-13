# Etapa 1 — Modo personas

Personas sintéticas navegam pelos fluxos críticos como usuários reais, **em paralelo**, cada uma no seu navegador. Elas narram ao vivo, registram cada passo e capturam as requisições de API que alimentam os modos api e carga.

## 1. Escalar o elenco

| Persona | Agente | Navegador |
|---|---|---|
| `novato` 👵 Dona Cida | `prodtester:dona-cida` | `pw-cida` |
| `apressado` ⚡ Léo | `prodtester:leo` | `pw-leo` |
| `celular-3g` 📱 Jéssica | `prodtester:jessica` | `pw-jessica` |
| `so-teclado` ⌨️ Marcos | `prodtester:marcos` | `pw-marcos` |
| `quebrador` 💥 Kaio | `prodtester:kaio` | `pw-kaio` |
| personalizada 1 | `prodtester:persona-extra-1` | `pw-extra-1` |
| personalizada 2 | `prodtester:persona-extra-2` | `pw-extra-2` |

Quem entra em cena:

- **Modo `completo` e `personas`:** as personas de `personas.padrao` do yaml (ou as 5, se não houver yaml), mais até 2 personalizadas.
- **Modo `rapido`:** só `novato` e `quebrador`, só nos fluxos marcados como críticos.
- **Perfil local-first:** a persona principal é uma personalizada "usuário intenso" (gere com `<skill>/personas/_modelo.md` a partir do que o usuário contou), mais `so-teclado` e `quebrador`.
- **Perfil API pública:** nenhuma persona. Pule esta etapa e registre o motivo.

Os arquivos das personas padrão estão em `<skill>/personas/<id>.md`.

### Personas personalizadas

Se o usuário descreveu o público, gere cada persona seguindo `<skill>/personas/_modelo.md` e mostre nome, emoji, bordão e regra de abandono no plano, antes de rodar.

## 2. Preparar as pastas

Para cada persona escalada:

```bash
mkdir -p <execucao>/personas/<id>/screenshots
cp <skill>/personas/<id>.md <execucao>/personas/<id>/persona.md   # personas padrão
```

As personalizadas são escritas direto em `<execucao>/personas/<id>/persona.md`.

## 3. Definir as credenciais

Escolha uma forma por execução, seguindo `seguranca.md`, e diga às personas qual é:

- **Segredos do navegador:** o usuário iniciou o Claude Code com `PRODTESTER_SEGREDOS=<caminho de um arquivo .env>` contendo as credenciais de teste. As personas digitam o **nome** da chave (por exemplo `PRODTESTER_SENHA_A`) e o navegador troca pelo valor. Ninguém vê a senha.
- **Sessão já autenticada:** o usuário iniciou o Claude Code com `PRODTESTER_SESSAO=<caminho de um storage state do Playwright>`. Os navegadores já abrem logados.
- **Contas do seed local:** usuário e senha de teste lidos do seed do projeto, só quando o alvo é local.
- **Sem login:** os fluxos que exigem login ficam como `nao_executado`.

Os navegadores leem `PRODTESTER_SEGREDOS` e `PRODTESTER_SESSAO` quando a sessão do Claude Code começa. Se o usuário precisar configurá-los agora, explique que é preciso reiniciar a sessão com as variáveis definidas.

## 4. Abrir o palco

Antes de disparar as personas, mostre ao usuário o comando para acompanhar a narrativa ao vivo num segundo terminal:

```bash
node <skill>/scripts/palco.mjs <execucao>
```

Use o caminho absoluto do `<skill>` e da execução, para o comando funcionar de qualquer pasta. Depois da auditoria, o mesmo palco reapresenta a execução com `--replay` (útil para gravar vídeo).

## 5. Disparar as personas em paralelo

Chame **todos os agentes numa única mensagem**, cada um com a ferramenta de agentes em segundo plano, para que rodem ao mesmo tempo. A missão de cada um segue este modelo:

```
Missão de persona do prodtester.

execucao: <caminho absoluto da execução>
pasta: <caminho absoluto>/personas/<id>
scripts: <caminho absoluto de <skill>/scripts>
url_base: <url>
max_passos: 25
fluxos:
  - id: comprar
    nome: Comprar um produto
    inicio: /
    objetivo: Escolher um produto, colocar no carrinho e finalizar o pedido.
    sucesso: Tela de confirmação com o número do pedido.
proibicoes: <lista>
rotas_proibidas: <lista>
credenciais: <forma escolhida e, se for o caso, os nomes das chaves de segredo>
```

Enquanto as personas trabalham, não fique consultando o andamento. Cada agente avisa quando termina. A cada aviso, mostre ao usuário uma linha com o resultado daquela persona (por exemplo `💥 Kaio terminou: 2 fluxos, 1 ❌, 3 problemas`).

Se uma persona falhar por problema de ferramenta (navegador não abriu, servidor MCP desconectado), registre `nao_executado` com o motivo e siga com as outras. Não refaça a persona inteira sem perguntar.

Se uma persona voltar com fluxo `bloqueado` por ação irreversível não prevista, pergunte ao usuário se a ação é permitida. Com o "sim", dispare de novo só aquele fluxo.

## 6. Consolidar

Quando todas terminarem:

1. **Requisições:** junte os `personas/*/requisicoes.json` em `<execucao>/requisicoes.json`, removendo duplicatas pela combinação `metodo` + `rota` (mantenha o exemplo com payload mais completo e o maior e o menor tempo observados).
2. **Matriz fluxo × persona:** leia os `personas/*/resumo.json`. Ela vai para o relatório.
3. **Achados:** transforme os problemas relatados pelas personas em entradas de `achados.json` com `modo: "personas"`. Um mesmo problema visto por várias personas vira **um** achado, com todas as evidências. Classifique a severidade pela tabela de `formato-dados.md`. A causa raiz fica para o diagnóstico; por enquanto, preencha `causa_raiz.status` como `hipotese` só se a persona trouxe indício, ou deixe `causa_raiz` nulo.
4. Mostre ao usuário a matriz fluxo × persona e os achados mais graves, em poucas linhas.

## Limites desta etapa

- Agentes de IA não são determinísticos: duas execuções podem seguir caminhos diferentes. Por isso todo achado precisa de evidência (screenshot, passo, requisição), e o relatório deixa isso claro na seção de limites.
- As personas simulam comportamentos; elas não substituem testes com pessoas reais, especialmente em acessibilidade com leitores de tela de verdade.
