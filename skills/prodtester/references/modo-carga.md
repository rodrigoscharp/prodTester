# Etapa 3 — Modo carga

Usuários virtuais percorrem as jornadas reais do sistema, com pausas humanas e dados variados, em etapas cada vez mais pesadas, até encontrar o ponto de quebra. A capacidade que vai para o relatório é sempre um degrau **medido**; nada é extrapolado.

## 0. Travas antes de qualquer carga

Releia a seção "Teste de carga" de `seguranca.md`. A carga só roda com tudo isto registrado em `contexto.json`:

```json
"carga": {
  "confirmado_nesta_execucao": true,
  "isolado_de_producao": true,
  "pico_esperado_usuarios": 200,
  "hospedagem_producao": "Render, 1 instância de 512 MB"
}
```

- `confirmado_nesta_execucao` só vira `true` com o "sim" do usuário **nesta conversa**, depois de você explicar que a carga pode deixar o ambiente lento ou fora do ar.
- `isolado_de_producao` só vira `true` se o usuário confirmar que o ambiente não compartilha banco, cache, fila nem servidores com produção.
- `alvo.ambiente` precisa ser `local` ou `staging`.

O script `rodar-carga.sh` confere esses campos e se recusa a rodar sem eles. Nunca edite o `contexto.json` para contornar essa trava.

## 1. Montar o cenário

Grave `<execucao>/testes/cenario-carga.json`, seguindo `<skill>/templates/cenario-carga.example.json`.

**Jornadas** vêm dos fluxos reais:

- Use as requisições capturadas pelas personas (`requisicoes.json`) e os fluxos críticos. Cada jornada é uma sequência de passos que um usuário real faz, com `pausa_s` (mínimo e máximo, em segundos) entre eles.
- O `peso` de cada jornada reflete a mistura real do momento de pico. Pergunte ou deduza: num cardápio digital na sexta à noite, muita leitura (cardápio) e escrita concorrente (pedidos); num SaaS B2B na segunda de manhã, login, painel e relatórios.
- Varie os dados com `{{escolher:<lista em dados>}}`, `{{aleatorio}}`, `{{vu}}` e `{{iteracao}}`, para não medir só o cache.
- Use `capturar` para encadear passos (criar um pedido e depois acompanhá-lo).
- `id` de jornada e de passo: só letras minúsculas, números e hífen.
- Credenciais por `{{segredo:NOME}}` ou `token_env`, como no modo api. Os logins acontecem uma vez no início e são distribuídos entre os usuários virtuais.

**Fora da carga:** chamadas a serviços de terceiros (pagamento, e-mail, SMS, mapas, LLM pago), rotas proibidas e webhooks. Se uma jornada real depende de um deles, use o modo de teste do provedor ou corte esse passo, e anote no plano.

**Etapas:** ajuste `etapas` ao que o usuário informou. `esperada.vus` e `pico_esperado_usuarios` são o pico informado; `pico.vus` costuma ser de 2 a 3 vezes isso. Os degraus de `estresse` seguem `carga.degraus_estresse` do yaml (padrão 50, 100, 250, 500, 1000).

**Limites:** `thresholds` vem do yaml (padrão p95 < 500 ms e erro < 1%). `interromper_se.taxa_erro` (padrão 5%) interrompe a etapa sozinho.

## 2. Preparar

```bash
node <skill>/scripts/preparar-testes.mjs <execucao> carga
```

## 3. Rodar as etapas, uma por vez

```bash
bash <skill>/scripts/rodar-carga.sh --base <url> <execucao> <etapa>
```

Ordem e regras:

1. **`smoke`** (1 a 5 usuários, 1 min). Se falhar, pare: o problema é funcional, não de carga. Volte ao diagnóstico.
2. **`esperada`** (o pico informado, 5 a 10 min).
3. **`estresse`** (degraus até degradar). A etapa para sozinha se a taxa de erro de um degrau passar de 5%.
4. **`pico`** (de 0 ao valor alto em ~10 s).
5. **`disputa`**, para cada cenário de disputa (veja a seção 4).
6. **`resistencia`** (30 a 60 min) **só se o usuário pedir**.

Etapas longas (esperada, estresse, resistência) passam do tempo limite de um comando. Rode-as em segundo plano e espere o aviso de término; não fique consultando. Antes de cada etapa, diga ao usuário em uma linha o que vai rodar e quanto tempo deve levar. Depois de cada uma, mostre as linhas de resultado que o script imprime.

**Interrompa a sequência** se uma etapa terminar `INTERROMPIDA` com o ambiente fora do ar (smoke falhando depois), ou se o usuário pedir. Nunca rode a próxima etapa sobre um sistema caído.

Para medir a memória do sistema auditado durante a etapa, passe `--container <nome do contêiner>` (Docker) ou `--pid <pid do processo>` (local).

## 4. Disputa por recurso

Cenários em que muitos usuários disputam a mesma coisa ao mesmo tempo: o último item do estoque, o mesmo horário da agenda, o mesmo cupom de uso único, o mesmo saldo.

- `usuarios` disparam a `requisicao` no mesmo instante.
- `verificacao` mede um valor antes e depois (por exemplo, o estoque), e `condicao` diz o que é válido (`minimo: 0` para estoque, `maximo: N` para usos de um cupom). Com `contar: true`, mede o tamanho de uma lista.
- `max_sucessos` diz quantas requisições podem dar certo (1 para o último item).

**Prepare o estado antes.** O recurso precisa começar no ponto da disputa: produto com estoque 1, cupom com 1 uso, horário livre. Use dados criados para o teste, pelo seed do projeto ou pela própria API, e só com o "sim" do usuário, porque isso escreve no banco. Se o recurso já começar esgotado, o resultado sai como **inconclusivo**, nunca como aprovado.

Rode cada cenário com:

```bash
bash <skill>/scripts/rodar-carga.sh --base <url> <execucao> disputa --disputa <id>
```

## 5. Perfil local-first: volume no lugar da escada

Para apps de um usuário só, não rode `esperada`, `estresse` nem `pico`. Em vez disso:

1. Combine com o usuário os volumes realistas (por exemplo 1 mil, 10 mil e 100 mil registros na entidade principal) e como popular o ambiente de teste (seed do projeto, script de importação ou a própria API). Popular só com o "sim" dele.
2. Para cada volume, depois de popular, rode a etapa `responsividade` (1 a 3 usuários alternando entre as telas pesadas):
   ```bash
   bash <skill>/scripts/rodar-carga.sh --base <url> <execucao> responsividade --volume 10mil --pid <pid do backend>
   ```
3. Operações longas (por exemplo, chamadas a um LLM local) entram como jornada própria, com `timeout` maior no passo (`"timeout": "120s"`). Registre p50, p95 e o maior tempo.
4. A memória do backend em cada volume vem do `--pid` ou do `--container`.

## 6. Consolidar

```bash
node <skill>/scripts/consolidar-carga.mjs <execucao>
```

O script grava `carga/consolidado.json` e imprime:

- a curva usuários × p95 × erro;
- a **capacidade medida**: o maior degrau dentro dos limites antes da primeira quebra ("pelo menos N" quando nenhum degrau quebrou);
- o **ponto de quebra** e o motivo (p95, erro ou os dois);
- os passos mais lentos (onde investigar primeiro);
- as disputas e os volumes;
- **alertas de validade**: gerador saturado (os números da etapa não valem; sugira k6 distribuído ou na nuvem), máquina saturada com o sistema auditado na mesma máquina (capacidade subestimada) e contas sem login.

Mostre essa saída ao usuário.

## 7. Registrar os achados

Em `achados.json`, com `modo: "carga"` (ou `"volume"` no local-first):

- **Ponto de quebra abaixo do pico esperado**: crítico. Evidência `{"tipo": "k6", "ref": "carga/estresse.json", "resumo": "p95 1021 ms com 100 usuários; pico esperado 200"}`.
- **Ponto de quebra acima do pico esperado, mas com folga pequena** (menos de 2×): médio.
- **Disputa com violação** (estoque negativo, vendas além do disponível, cupom usado mais vezes): crítico, categoria `disputa`.
- **Passo lento** sob a carga esperada: alto, categoria `desempenho`, apontando o passo.
- **Memória crescendo** entre volumes ou durante a resistência sem voltar: alto, categoria `escalabilidade`.
- Etapas com gerador saturado não geram achado de capacidade: registre o alerta no relatório.

Rode `validar.mjs` depois.

## 8. Guardar para o CI

`testes/carga.k6.js` e `testes/cenario-carga.json` com a etapa `smoke` viram a guarda contra regressão no CI. No fim, ofereça copiá-los para a pasta `testes/` do projeto.
