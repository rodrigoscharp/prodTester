import { Router } from 'express';
import { consulta } from '../db.js';

export const rotasProdutos = Router();

rotasProdutos.get('/', async (req, res, next) => {
  try {
    const limite = Number(req.query.limit) || 24;
    const filtros = [];
    const valores = [];
    if (req.query.busca) {
      valores.push(`%${req.query.busca}%`);
      filtros.push(`nome ILIKE $${valores.length}`);
    }
    valores.push(limite);
    const { rows: produtos } = await consulta(
      `SELECT id, categoria_id, nome, preco_centavos, estoque, imagem FROM produtos
       ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
       ORDER BY id LIMIT $${valores.length}`,
      valores,
    );
    for (const produto of produtos) {
      const { rows } = await consulta('SELECT nome FROM categorias WHERE id = $1', [produto.categoria_id]);
      produto.categoria = rows[0]?.nome ?? null;
    }
    res.json(produtos);
  } catch (erro) {
    next(erro);
  }
});

rotasProdutos.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await consulta(
      `SELECT p.id, p.nome, p.descricao, p.preco_centavos, p.estoque, p.imagem, c.nome AS categoria
       FROM produtos p JOIN categorias c ON c.id = p.categoria_id WHERE p.id = $1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ erro: 'Produto não encontrado.' });
    const produto = rows[0];
    const { rows: notas } = await consulta(
      'SELECT round(avg(nota), 1)::float AS media, count(*)::int AS total FROM avaliacoes WHERE produto_id = $1',
      [produto.id],
    );
    const { rows: vendas } = await consulta(
      'SELECT coalesce(sum(quantidade), 0)::int AS vendidos FROM itens_pedido WHERE produto_id = $1',
      [produto.id],
    );
    res.json({ ...produto, avaliacao: notas[0], vendidos: vendas[0].vendidos });
  } catch (erro) {
    next(erro);
  }
});
