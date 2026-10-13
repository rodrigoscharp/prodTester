# Avaliação do prodtester na loja-quebrada

Registro das execuções de avaliação contra o [gabarito](gabarito-loja-quebrada.md). Cada rodada usa uma cópia limpa da `demo/loja-quebrada` (banco recriado), fora da pasta onde fica o gabarito.

## Rodada 1 · 13/10/2026

**Comando:** `/prodtester:auditar http://localhost:3000`, sem interação humana (`claude -p`), navegadores invisíveis, credenciais pelo arquivo de segredos.

**Condições:** app, Postgres e k6 na mesma máquina (um MacBook), etapas de carga encurtadas para caber na avaliação (degraus de 40 s com 50, 100, 250 e 500 usuários). O relatório registra o alerta de CPU alta na máquina, então a capacidade medida fica abaixo da que o app teria com o gerador separado.

### Resultado da auditoria

| Medida | Valor |
|---|---|
| Placar | 41/100 (Arriscado) |
| Capacidade medida | ~100 usuários simultâneos com p95 de 145 ms |
| Ponto de quebra | 200 usuários (o pico esperado): p95 de 4.703 ms |
| Disputa pela última panela | 25 vendas para 1 unidade; estoque final −24 |
| API | 14 de 28 casos passaram |
| Personas | 15 combinações fluxo × persona: 4 ✅, 11 ⚠️, nenhuma falha |
| Achados | 18 (5 críticos, 5 altos, 5 médios, 3 baixos) |

### Comparação com o gabarito

| Bug | Achou? | Achado | Causa |
|---|---|---|---|
| B1 · N+1 na listagem | ✅ | Vitrine faz 25 consultas por visita | confirmada |
| B2 · Falta de índice | ✅ | Detalhe do produto lê tabelas inteiras (`EXPLAIN ANALYZE` anexado) | confirmada |
| B3 · Pedido duplicado ⭐ | ✅ | 4 cliques criam 4 pedidos; a API também | confirmada |
| B4 · Estoque negativo ⭐ | ✅ | Última panela vendida 25 vezes | confirmada |
| B5 · Pedido de outro cliente ⭐ | ✅ | Cliente B lê pedido do cliente A, com telefone e endereço | confirmada |
| B6 · 500 em validação ⭐ | ✅ | Erro 500 com rastro de pilha; quantidade negativa aceita | confirmada |
| B7 · Botão sem rótulo | ✅ | Botão do carrinho sem nome acessível | confirmada |
| B8 · Layout no celular | ❌ | A Jéssica comentou "tela larga demais", mas não mediu nem registrou | — |
| B9 · Mensagens inúteis | ✅ | "Algo deu errado." e "Erro." | confirmada |
| B10 · Pool pequeno ⭐ | ✅ | Degrada com 200 usuários; `src/db.js:5` com `max: 2` | hipótese |

**Taxa de acerto: 9/10.** Críticos: 5/5. Com causa confirmada: 8/10.

Achados reais fora do gabarito: erro 500 em `/api/produtos/abc` e em `?limit=-1`, JSON malformado virando 500, observação de 100 mil caracteres aceita, mensagens sem `aria-live`, 24 links com o mesmo nome "Ver produto", busca com `%` listando tudo.

### Ajustes feitos depois da rodada 1

1. **Medição obrigatória de largura no celular:** a Jéssica mede `scrollWidth` × `clientWidth` na primeira tela de cada fluxo e registra o estouro como problema.
2. **Percepção vira problema:** quando a persona percebe algo errado, mesmo seguindo o fluxo, a fala é do tipo `problema`.
3. **Falas entre aspas simples:** dois registros da Dona Cida foram recusados pelo hook por caracteres de shell entre aspas duplas.
4. **Etapas de carga em primeiro plano:** na execução sem usuário, o estresse foi para segundo plano e a sessão terminou com ele rodando. Agora etapas de até ~9 minutos rodam em primeiro plano, e as maiores são esperadas com laço em primeiro plano.
5. **URL com acento:** os executores k6 codificam caracteres fora do ASCII (um termo de busca com "í" derrubou a primeira tentativa da etapa esperada).
6. **Relatório:** nome do sistema vindo do `testes-fluxos.yaml` e eixo do traçado arredondado, em segundos acima de 1.000 ms.

### Reteste do B8

Rodada só com a Jéssica, banco limpo: achado **"Vitrine mais larga que a tela do celular (1122 px numa tela de 375 px)"**, causa confirmada em `public/estilo.css:24`. Com o ajuste, a taxa de acerto vai a **10/10**.

## Rodada 2 · 13/10/2026

Validação dos caminhos do plugin que a rodada 1 não exercitou. Cada item usou uma cópia da `demo/loja-quebrada` fora do repositório, com o banco recriado do seed antes das rodadas que comparam resultados.

**Como foi rodada.** O plano era repetir o `claude -p` da rodada 1 com um servidor que registrasse cada pedido de permissão. O classificador do modo automático do Claude Code recusou iniciar um agente com aprovação automática de permissões e recusou que a sessão respondesse pelo dono do sistema às perguntas da preparação. Por isso as auditorias rodaram dentro de uma sessão do Claude Code no app desktop (modo automático), com o plugin instalado, navegadores visíveis e as personas como subagentes de verdade. Os pedidos de permissão foram contados reexecutando o hook `aprovar.mjs` sobre cada chamada de ferramenta registrada nas transcrições. A sessão orquestradora conhecia a lista de bugs da rodada 1, o que pode ter influenciado os casos de API; as personas não conheciam.

### 1. Auditoria interativa com navegadores visíveis

**Comando:** `/prodtester:prodtester personas http://localhost:3000`, sem `PRODTESTER_HEADLESS`, MacBook com M4 (10 núcleos) e 16 GB, com outros apps abertos.

| Medida | Valor |
|---|---|
| Janelas | 5 Chrome visíveis ao mesmo tempo (nenhum processo com `--headless`) |
| Duração das personas | de 3 min (Dona Cida) a 9 min (Kaio), em paralelo |
| CPU da máquina | média de 33% ocupada, um pico de 97% numa amostra de 5 s |
| Memória | Chrome subiu de 1,8 GB para 6,6 GB; memória livre mínima de 41% |
| Travamento | nenhum: o amostrador de CPU e memória manteve o ritmo de uma amostra a cada ~6 s do começo ao fim |
| Palco (`palco.mjs`) | 76 falas mostradas ao vivo, atraso máximo de 1 s em relação à gravação |
| Resultado | placar 39, 12 achados, matriz com 1 ❌ (Léo abandonou), B3, B7, B8 e B9 achados |

**Pedidos de permissão.** As 5 personas fizeram 589 chamadas de ferramenta (navegador, `registrar.mjs` e leitura do protocolo) e todas foram aprovadas pelo hook: **nenhum pedido**. Fora do hook ficaram as gravações do orquestrador em `auditoria/` (`ultima.txt`, `contexto.json`, `plano.md`, `achados.json`, um `.diff` por correção) e um `git apply --check` por diff, de 10 a 30 pedidos numa auditoria completa. Os comandos que fazem requisições ao sistema (`rodar-k6.sh`, `rodar-carga.sh`) e o `EXPLAIN ANALYZE` continuam pedindo aprovação, de propósito.

**Ajustes feitos:**

1. O hook aprova `Write` e `Edit` dentro de `<projeto>/auditoria/` (seguindo links simbólicos, sem sair da pasta).
2. Novo `conferir-correcoes.mjs`, aprovado pelo hook, que roda `git apply --check` em todos os diffs de uma vez.
3. A preparação pede para abrir o Claude Code na pasta do projeto: os navegadores só gravam screenshots dentro do diretório da sessão, e com o projeto em outra pasta eles se espalharam por dois lugares.
4. README com limitações conhecidas, incluindo o peso dos navegadores visíveis.

### 2. Revalidação de ponta a ponta

Na branch `prodtester/correcoes-2026-10-13` da cópia foram aplicados 3 diffs propostos pela auditoria: `A-001` (botão travado no envio, mensagem do servidor e região `aria-live` no carrinho), `A-005` (grade responsiva) e `A-006` (nome acessível do carrinho). Banco recriado, imagem reconstruída e `/prodtester:prodtester revalidar` com as 5 personas nos fluxos que não tinham dado ✅.

| Prova | Antes | Depois | Resultado |
|---|---|---|---|
| A-001 · 4 cliques em Finalizar | 4 pedidos | 1 pedido, botão "Enviando pedido…" | corrigido |
| A-001 · recarregar no envio e clicar de novo | 2 pedidos | 2 pedidos (o servidor segue sem idempotência) | sem mudança |
| A-001 · Finalizar com o carrinho vazio | botão visível | botão visível: `.formulario { display: grid }` anula o `hidden` do diff | sem mudança |
| A-002 · erro ao finalizar | "Algo deu errado.", Léo abandona | "Entre na sua conta…" e "Sem estoque suficiente…" | corrigido |
| A-004 · largura no iPhone SE | 1122 px | 375 px | corrigido |
| A-005 · nome do botão do carrinho | sem nome | "Carrinho, 1 item" | corrigido |
| A-006 · confirmação anunciada | sem `aria-live` | `role=status` e `role=alert` | corrigido |

Placar de 39 para 59 (o teto com crítico). A revalidação também achou um problema causado pela correção: depois de finalizar, o foco vai para o `body` (A-013).

**Ajustes feitos:**

1. Os navegadores ficam abertos entre missões na mesma sessão, e as personas da revalidação abriram com a sessão e o carrinho da rodada anterior ("Olá, Ana" com token inválido). O protocolo agora fecha o navegador no começo e no fim de cada missão e confere que o armazenamento está vazio. Na rodada seguinte (modo rápido), as personas começaram limpas.
2. O comparativo só olhava o resultado do fluxo, e um fluxo que continuava ⚠️ por outro problema escondia a correção (4 pedidos viraram 1 e o comparativo dizia "sem mudança"). As provas por achado vão em `provas.json` e entram no `revalidacao.json` e no laudo.

### 3. Modo rápido e modo carga

**`/prodtester:auditar-rapido`** (rodado como `prodtester rapido`, que é o que o atalho faz): Dona Cida e Kaio nos fluxos críticos, 25 casos de API de caminho feliz, validação e autenticação. 9 min no total, placar 59, 8 achados (2 críticos). Achou B3 (4 cliques, 4 pedidos), B6 (cinco erros 500 com rastro de pilha, quantidade negativa e zero aceitas), B7 e B9. Como esperado no modo rápido, ficaram de fora isolamento (B5), carga (B4, B10) e o celular (B8).

**API completa** (modo `api`, 31 casos, para cobrir os críticos que não dependem de carga): 18 passaram. B5 confirmado (conta B lê o pedido da conta A, status 200), B3 pela API (4 envios simultâneos, 4 pedidos, com e sem `Idempotency-Key`) e B6.

**`/prodtester:auditar-carga`:** pendente da confirmação do dono do sistema nesta execução (veja o fim da rodada).

### 4. Personas personalizadas

Descrição de público usada no teste: "artesãs do interior do ES, de 50 a 65 anos, que compram presentes pelo celular Android com 4G fraco; turistas em Vitória que compram lembrança no notebook do hotel, com pressa, comparando preço e prazo". Geradas pelo `_modelo.md`: 🧺 Dona Lurdes, 61 (`pw-extra-1`, celular 390×844 por `browser_resize`) e 🧳 Rafael, 34 (`pw-extra-2`, notebook).

O caminho funcionou de ponta a ponta: `preparar-personas.mjs` reconheceu os `persona.md` já escritos, o palco mostrou nome, emoji e cor de cada uma, a matriz e o laudo trazem as duas. Rafael abandonou a compra pela regra dele (sem prazo de entrega em 3 telas) e Dona Lurdes mediu a vitrine com 1122 px no celular, achando de novo o B8. Achado novo, coerente com esse público: nenhuma tela mostra frete nem prazo.

### 5. Perfis local-first e API pública

Dois alvos pequenos, escritos para o teste e mantidos fora do repositório:

- **Cotações API** (API pública, Node sem dependências, `openapi.json`, chave em `X-API-Key`). Perfil detectado como API pública pelas 4 evidências fortes (sem frontend, OpenAPI, chave de API, README para integradores). Personas puladas com o motivo no laudo ("não avaliado"). 16 casos, 9 passaram: achou os 5 problemas plantados (isolamento entre clientes, duplicidade com a mesma `Idempotency-Key`, peso inválido aceito, 500 com rastro em JSON malformado, `limit` sem teto devolvendo 1008 itens quando o OpenAPI documenta 100). Ficou sem teste o limite de uso documentado (60 por minuto): o modo api não tem um tipo de caso para limite de taxa.
- **Caderno** (local-first: "roda só na sua máquina, para uma pessoa", dados num JSON local). Perfil local-first pelas evidências do README e da ausência de conta e de hospedagem. Cenário de responsividade e volumes de 1 mil e 5 mil notas montados; a trava funcionou: `rodar-carga.sh` recusou a etapa sem a confirmação registrada. A etapa de volume em si está pendente da mesma confirmação da carga.

### 6. Resistência curta

Pendente da confirmação de carga.

### Os 5 críticos do gabarito

| Bug | Rodada 2 |
|---|---|
| B3 · Pedido duplicado | ✅ personas (Kaio, 2 vezes) e API |
| B4 · Estoque negativo | pendente (etapa de disputa, depende da carga) |
| B5 · Pedido de outro cliente | ✅ API, caso de isolamento |
| B6 · 500 em validação | ✅ API e Kaio (quantidade 1.5) |
| B10 · Pool pequeno | pendente (escada de carga) |
