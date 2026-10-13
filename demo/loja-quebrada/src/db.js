import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
});

export const consulta = (texto, valores) => pool.query(texto, valores);
