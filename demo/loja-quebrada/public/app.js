const sessao = {
  get token() { return localStorage.getItem('token'); },
  get nome() { return localStorage.getItem('nome'); },
  entrar(token, nome) { localStorage.setItem('token', token); localStorage.setItem('nome', nome); },
  sair() { localStorage.removeItem('token'); localStorage.removeItem('nome'); },
};

const carrinho = {
  itens() { return JSON.parse(localStorage.getItem('carrinho') || '[]'); },
  salvar(itens) { localStorage.setItem('carrinho', JSON.stringify(itens)); atualizarContador(); },
  adicionar(produto) {
    const itens = carrinho.itens();
    const existente = itens.find((i) => i.produto_id === produto.id);
    if (existente) existente.quantidade += 1;
    else itens.push({ produto_id: produto.id, nome: produto.nome, preco_centavos: produto.preco_centavos, quantidade: 1 });
    carrinho.salvar(itens);
  },
  limpar() { carrinho.salvar([]); },
};

const reais = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(sessao.token ? { Authorization: `Bearer ${sessao.token}` } : {}),
      ...(opcoes.headers || {}),
    },
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw Object.assign(new Error(corpo.erro || 'Falha'), { status: resposta.status });
  return corpo;
}

function atualizarContador() {
  const el = document.querySelector('.contador');
  if (!el) return;
  const total = carrinho.itens().reduce((s, i) => s + i.quantidade, 0);
  el.textContent = total;
  el.hidden = total === 0;
}

function montarCabecalho() {
  const header = document.createElement('header');
  header.className = 'barra';
  header.innerHTML = `
    <a class="marca" href="/">Lojinha da Vila</a>
    <nav>
      <a href="/pedidos.html">Meus pedidos</a>
      <a href="/entrar.html" id="link-conta"></a>
      <button class="botao-icone" type="button" id="abrir-carrinho">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12l2-8H6.2"/></svg>
        <span class="contador" hidden>0</span>
      </button>
    </nav>`;
  document.body.prepend(header);
  document.getElementById('link-conta').textContent = sessao.nome ? `Olá, ${sessao.nome.split(' ')[0]}` : 'Entrar';
  document.getElementById('abrir-carrinho').addEventListener('click', () => { location.href = '/carrinho.html'; });
  atualizarContador();
}

document.addEventListener('DOMContentLoaded', montarCabecalho);
