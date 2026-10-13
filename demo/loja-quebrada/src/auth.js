import { consulta } from './db.js';

export async function clienteDaRequisicao(req) {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { rows } = await consulta('SELECT cliente_id FROM sessoes WHERE token = $1', [token]);
  return rows[0]?.cliente_id ?? null;
}

export function exigirLogin(req, res, next) {
  clienteDaRequisicao(req)
    .then((clienteId) => {
      if (!clienteId) return res.status(401).json({ erro: 'Entre na sua conta para continuar.' });
      req.clienteId = clienteId;
      next();
    })
    .catch(next);
}
