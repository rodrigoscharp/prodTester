import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { consulta } from '../db.js';
import { exigirLogin } from '../auth.js';

export const rotasAuth = Router();

rotasAuth.post('/login', async (req, res, next) => {
  try {
    const { email, senha } = req.body ?? {};
    const { rows } = await consulta(
      'SELECT id, nome FROM clientes WHERE email = $1 AND senha_hash = crypt($2, senha_hash)',
      [email, senha],
    );
    if (!rows.length) return res.status(401).json({ erro: 'Erro.' });
    const token = randomBytes(24).toString('hex');
    await consulta('INSERT INTO sessoes (token, cliente_id) VALUES ($1, $2)', [token, rows[0].id]);
    res.json({ token, nome: rows[0].nome });
  } catch (erro) {
    next(erro);
  }
});

rotasAuth.get('/eu', exigirLogin, async (req, res, next) => {
  try {
    const { rows } = await consulta('SELECT id, nome, email FROM clientes WHERE id = $1', [req.clienteId]);
    res.json(rows[0]);
  } catch (erro) {
    next(erro);
  }
});
