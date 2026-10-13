-- Lojinha da Vila: esquema e dados de demonstração.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE categorias (
  id serial PRIMARY KEY,
  nome text NOT NULL
);

CREATE TABLE produtos (
  id serial PRIMARY KEY,
  categoria_id int NOT NULL REFERENCES categorias (id),
  nome text NOT NULL,
  descricao text NOT NULL,
  preco_centavos int NOT NULL,
  estoque int NOT NULL,
  imagem text NOT NULL
);

CREATE TABLE clientes (
  id serial PRIMARY KEY,
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  telefone text NOT NULL,
  endereco text NOT NULL
);

CREATE TABLE sessoes (
  token text PRIMARY KEY,
  cliente_id int NOT NULL REFERENCES clientes (id),
  criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pedidos (
  id serial PRIMARY KEY,
  cliente_id int NOT NULL REFERENCES clientes (id),
  total_centavos int NOT NULL,
  status text NOT NULL DEFAULT 'confirmado',
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE itens_pedido (
  id serial PRIMARY KEY,
  pedido_id int NOT NULL REFERENCES pedidos (id),
  produto_id int NOT NULL REFERENCES produtos (id),
  quantidade int NOT NULL,
  preco_centavos int NOT NULL
);

CREATE TABLE avaliacoes (
  id serial PRIMARY KEY,
  produto_id int NOT NULL REFERENCES produtos (id),
  cliente_id int NOT NULL REFERENCES clientes (id),
  nota int NOT NULL,
  comentario text NOT NULL,
  criada_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO categorias (nome) VALUES
  ('Cozinha'), ('Mesa posta'), ('Casa'), ('Jardim'), ('Papelaria'), ('Presentes');

INSERT INTO produtos (categoria_id, nome, descricao, preco_centavos, estoque, imagem) VALUES
  (1, 'Panela de barro capixaba', 'Feita à mão em Goiabeiras, ideal para moqueca. Peça única desta fornada.', 18900, 1, '🍲'),
  (1, 'Colher de pau de goiabeira', 'Madeira maciça, acabamento com óleo vegetal.', 2490, 120, '🥄'),
  (1, 'Tábua de corte de pinus', 'Tábua grande, 40 × 25 cm.', 5990, 60, '🪵'),
  (1, 'Cuscuzeira de alumínio', 'Tamanho família, cabe 500 g de flocão.', 7490, 45, '🫕'),
  (1, 'Chaleira esmaltada azul', 'Esmalte vitrificado, 2 litros.', 12900, 18, '🫖'),
  (1, 'Pilão de madeira', 'Para alho, temperos e caipirinha.', 4590, 70, '🧄'),
  (1, 'Forma de bolo com furo', 'Alumínio fundido, 24 cm.', 3990, 90, '🍰'),
  (2, 'Jogo de 4 xícaras de ágata', 'Ágata branca com borda azul.', 8990, 35, '☕'),
  (2, 'Toalha de mesa de chita', 'Chita floral, 1,5 × 2,2 m.', 9990, 25, '🌺'),
  (2, 'Jarra de vidro canelado', 'Vidro reciclado, 1,2 litro.', 6490, 40, '🫙'),
  (2, 'Sousplat de palha de taboa', 'Kit com 4 unidades.', 7990, 30, '🌾'),
  (2, 'Copo americano (6 unidades)', 'O clássico de boteco, 190 ml.', 2990, 200, '🥛'),
  (2, 'Guardanapo de linho', 'Kit com 4, bordado à mão.', 6990, 22, '🧺'),
  (3, 'Rede de dormir cearense', 'Algodão, punho trançado.', 21900, 12, '🛏️'),
  (3, 'Vela de cera de abelha', 'Aroma natural de mel, 40 horas.', 3490, 80, '🕯️'),
  (3, 'Cesto de fibra de bananeira', 'Médio, 30 cm de diâmetro.', 5490, 33, '🧺'),
  (3, 'Almofada de crochê', 'Feita à mão, 45 × 45 cm.', 7990, 28, '🧶'),
  (3, 'Filtro de barro', 'O filtro de barro tradicional, 4 litros.', 15900, 15, '💧'),
  (3, 'Capacho de sisal', '60 × 40 cm.', 4490, 50, '🚪'),
  (4, 'Vaso de cerâmica rústica', 'Para plantas de médio porte.', 6990, 26, '🪴'),
  (4, 'Muda de jabuticabeira', 'Muda enxertada, já produzindo.', 8990, 9, '🌳'),
  (4, 'Regador de zinco', '5 litros, bico chuveiro.', 7490, 20, '🚿'),
  (4, 'Kit de sementes de horta', 'Alface, rúcula, salsinha e cebolinha.', 1990, 150, '🌱'),
  (4, 'Tesoura de poda', 'Lâmina de aço carbono.', 5990, 34, '✂️'),
  (5, 'Caderno de capa de cordel', 'Capa com xilogravura, 96 folhas.', 3490, 75, '📒'),
  (5, 'Lápis de grafite (12 unidades)', 'Grafite HB.', 1290, 300, '✏️'),
  (5, 'Agenda 2027', 'Capa dura, uma semana por página.', 5990, 55, '📅'),
  (5, 'Caneta tinteiro', 'Pena média, tinta azul.', 8990, 14, '🖋️'),
  (6, 'Caixa de doce de leite', 'Doce de leite mineiro, 6 tabletes.', 3990, 100, '🍬'),
  (6, 'Cachaça artesanal de alambique', 'Envelhecida em amburana, 700 ml.', 11900, 24, '🥃'),
  (6, 'Kit de café especial', 'Dois pacotes de 250 g, Sul de Minas.', 6990, 48, '☕'),
  (6, 'Sabonete de argila', 'Kit com 3 aromas.', 3290, 85, '🧼');

INSERT INTO clientes (nome, email, senha_hash, telefone, endereco) VALUES
  ('Ana Teste', 'ana@loja.test', crypt('lojinha-ana-123', gen_salt('bf')), '(27) 99999-0001', 'Rua das Palmeiras, 10, Vitória, ES'),
  ('Bia Teste', 'bia@loja.test', crypt('lojinha-bia-123', gen_salt('bf')), '(27) 99999-0002', 'Avenida do Contorno, 250, Vila Velha, ES');

-- Clientes antigos, para dar volume ao histórico.
INSERT INTO clientes (nome, email, senha_hash, telefone, endereco)
SELECT 'Cliente ' || g, 'cliente' || g || '@exemplo.test', crypt('nao-usada-' || g, gen_salt('md5')), '(27) 90000-' || lpad(g::text, 4, '0'), 'Endereço ' || g
FROM generate_series(1, 2000) AS g;

-- Histórico de pedidos e avaliações.
INSERT INTO pedidos (cliente_id, total_centavos, criado_em)
SELECT 3 + (g % 2000), 5000 + (g % 20000), now() - (g || ' minutes')::interval
FROM generate_series(1, 120000) AS g;

INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_centavos)
SELECT 1 + (g % 120000), 2 + (g % 31), 1 + (g % 3), 1000 + (g % 9000)
FROM generate_series(1, 1500000) AS g;

INSERT INTO avaliacoes (produto_id, cliente_id, nota, comentario, criada_em)
SELECT 2 + (g % 31), 3 + (g % 2000), 1 + (g % 5), 'Avaliação de cliente número ' || g, now() - (g || ' minutes')::interval
FROM generate_series(1, 2000000) AS g;

ANALYZE;
