# Gerador de persona personalizada

Use este modelo quando o usuário descrever o público real do sistema (por exemplo, "dono de restaurante de 55 anos que só usa o celular"). O resultado é um arquivo no mesmo formato das personas padrão, gravado em `auditoria/<execucao>/personas/<id>/persona.md`.

## Regras

1. **No máximo 2 personas personalizadas por execução.** Elas usam os navegadores `pw-extra-1` e `pw-extra-2` e os agentes `persona-extra-1` e `persona-extra-2`.
2. **Parta só da descrição do usuário e do que você leu sobre o produto.** Não invente características que mudem o resultado do teste sem base (por exemplo, uma deficiência que o usuário não mencionou).
3. **Escolha um nome brasileiro comum, idade coerente e um emoji** que represente a pessoa. Não use nomes de pessoas reais conhecidas.
4. **O bordão** é uma frase curta e característica, boa para aparecer no vídeo.
5. **O dispositivo** segue a descrição. Se a pessoa "só usa o celular", o navegador precisa ser ajustado para celular no início da sessão com `browser_resize` para 390×844 (os navegadores extras abrem em 1280×800). Registre isso no campo `dispositivo` e na seção "Como navega".
6. **Regra de abandono concreta**, com número (telas, tentativas, segundos), como nas personas padrão.
7. **O que observar** deve sair dos riscos reais desse público no produto auditado.
8. O `id` é curto, em minúsculas, com hífen (por exemplo `dono-restaurante`).
9. A `cor` é `blue` para a primeira personalizada e `white` para a segunda.

## Formato

```markdown
---
id: dono-restaurante
nome: Seu Valdir
idade: 55
emoji: 👨‍🍳
cor: blue
navegador: pw-extra-1
agente: persona-extra-1
dispositivo: Celular 390×844 (toque), 4G
bordao: No meu tempo era tudo no caderninho.
---

# 👨‍🍳 Seu Valdir, 55 anos

## Quem é

(2 a 4 frases: rotina, relação com tecnologia, o que quer resolver com o produto.)

## Como navega

(Lista de comportamentos concretos que mudam as ações da persona.)

## Paciência e abandono

(Regra de abandono com números.)

## O que observar

(Lista de checagens ligadas aos riscos desse público.)

## Voz da narrativa

(Tom e 3 ou 4 exemplos de falas curtas.)
```

Depois de gerar, mostre ao usuário o nome, o emoji, o bordão e a regra de abandono numa linha cada, junto com o plano. Ele pode ajustar antes de rodar.
