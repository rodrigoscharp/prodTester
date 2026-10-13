import express from 'express';
import { fileURLToPath } from 'node:url';
import { rotasAuth } from './rotas/auth.js';
import { rotasProdutos } from './rotas/produtos.js';
import { rotasPedidos } from './rotas/pedidos.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

app.use('/api', rotasAuth);
app.use('/api/produtos', rotasProdutos);
app.use('/api/pedidos', rotasPedidos);

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use((erro, req, res, next) => {
  console.error(erro);
  res.status(500).json({ erro: erro.message, detalhe: erro.stack });
});

const porta = Number(process.env.PORT) || 3000;
app.listen(porta, () => console.log(`Lojinha da Vila em http://localhost:${porta}`));
