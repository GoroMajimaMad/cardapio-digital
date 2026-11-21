-- CAROL MIX - CARDÁPIO DIGITAL
-- Script de criação do Banco de Dados para MySQL

CREATE DATABASE IF NOT EXISTS carol_mix
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE carol_mix;

-- 1. Administradores
CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Categorias do Cardápio
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE,
    slug VARCHAR(80) NOT NULL UNIQUE,
    icon VARCHAR(50) DEFAULT 'bi-ice-cream',
    display_order INT NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- 3. Produtos do Cardápio
-- Usa exclusão lógica (active = 0) para proteger o histórico de pedidos
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    name VARCHAR(140) NOT NULL,
    short_description VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    allow_addons TINYINT(1) NOT NULL DEFAULT 1,
    sizes_json TEXT NULL COMMENT 'JSON opcional: [{"label":"300ml","extra_price":0},{"label":"500ml","extra_price":6}]',
    image_url VARCHAR(500) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_products_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 4. Adicionais / Coberturas
CREATE TABLE IF NOT EXISTS addons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- 5. Pedidos
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(120) NOT NULL,
    table_or_pickup VARCHAR(60) NOT NULL COMMENT 'Número da mesa ou Retirada no Balcão',
    notes TEXT NULL,
    status ENUM('Recebido', 'Em preparo', 'Pronto', 'Entregue', 'Cancelado') NOT NULL DEFAULT 'Recebido',
    total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 6. Itens do Pedido (Snapshot de nome/preço protege histórico)
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NULL,
    product_name VARCHAR(140) NOT NULL,
    selected_size VARCHAR(60) NULL,
    addons_json TEXT NULL COMMENT 'JSON dos adicionais escolhidos no momento do pedido',
    item_notes VARCHAR(255) NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_order_items_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- 7. Histórico de Alterações de Status
CREATE TABLE IF NOT EXISTS order_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    status VARCHAR(30) NOT NULL,
    changed_by_admin_id INT NULL,
    changed_by_name VARCHAR(120) NOT NULL,
    changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_history_order
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_history_admin
        FOREIGN KEY (changed_by_admin_id) REFERENCES admins(id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- Índices para acelerar filtros do painel administrativo
CREATE INDEX idx_products_category_active ON products(category_id, active);
CREATE INDEX idx_orders_status_created ON orders(status, created_at);
CREATE INDEX idx_history_order ON order_status_history(order_id, changed_at);