import { Router } from 'express';
import { consulta } from '../db.js';
import { exigirLogin } from '../auth.js';

export const rotasPedidos = Router();

rotasPedidos.use(exigirLogin);

rotasPedidos.get('/', async (req, res, next) => {
  try {
    const { rows } = await consulta(
      'SELECT id, total_centavos, status, criado_em FROM pedidos WHERE cliente_id = $1 ORDER BY id DESC LIMIT 20',
      [req.clienteId],
    );
    res.json(rows);
  } catch (erro) {
    next(erro);
  }
});

rotasPedidos.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await consulta(
      `SELECT p.id, p.total_centavos, p.status, p.observacao, p.criado_em,
              c.nome AS cliente, c.email, c.telefone, c.endereco
       FROM pedidos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = $1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const { rows: itens } = await consulta(
      `SELECT i.produto_id, pr.nome, i.quantidade, i.preco_centavos
       FROM itens_pedido i JOIN produtos pr ON pr.id = i.produto_id WHERE i.pedido_id = $1`,
      [req.params.id],
    );
    res.json({ ...rows[0], itens });
  } catch (erro) {
    next(erro);
  }
});

rotasPedidos.post('/', async (req, res, next) => {
  try {
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    if (!itens.length) return res.status(400).json({ erro: 'O carrinho está vazio.' });

    const produtos = [];
    for (const item of itens) {
      const { rows } = await consulta(
        'SELECT id, nome, preco_centavos, estoque FROM produtos WHERE id = $1',
        [item.produto_id],
      );
      if (!rows.length) return res.status(404).json({ erro: 'Produto não encontrado.' });
      const quantidade = (await consulta('SELECT $1::int AS q', [item.quantidade])).rows[0].q;
      if (rows[0].estoque < quantidade) return res.status(409).json({ erro: `Sem estoque suficiente de ${rows[0].nome}.` });
      produtos.push({ ...rows[0], quantidade });
    }

    const total = produtos.reduce((soma, p) => soma + p.preco_centavos * p.quantidade, 0);
    const { rows } = await consulta(
      'INSERT INTO pedidos (cliente_id, total_centavos, observacao) VALUES ($1, $2, $3) RETURNING id, total_centavos, status, criado_em',
      [req.clienteId, total, req.body.observacao ?? null],
    );
    const pedido = rows[0];
    for (const p of produtos) {
      await consulta(
        'INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_centavos) VALUES ($1, $2, $3, $4)',
        [pedido.id, p.id, p.quantidade, p.preco_centavos],
      );
      await consulta('UPDATE produtos SET estoque = estoque - $1 WHERE id = $2', [p.quantidade, p.id]);
    }
    res.status(201).json(pedido);
  } catch (erro) {
    next(erro);
  }
});
