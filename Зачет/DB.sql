-- Справочник медикаментов
CREATE TABLE medicines (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    pharma_group VARCHAR(100) NOT NULL, 
    price DECIMAL(10, 2) NOT NULL
);

-- Справочник аптек / складов
CREATE TABLE pharmacies (
    id SERIAL PRIMARY KEY,
    address VARCHAR(255) NOT NULL,
    is_warehouse BOOLEAN DEFAULT FALSE 
);

-- Текущие остатки на складах аптек
CREATE TABLE inventory (
    pharmacy_id INT REFERENCES pharmacies(id),
    medicine_id INT REFERENCES medicines(id),
    stock INT NOT NULL CHECK (stock >= 0),
    PRIMARY KEY (pharmacy_id, medicine_id)
);

-- Чеки (Продажи)
CREATE TABLE receipts (
    id SERIAL PRIMARY KEY,
    pharmacy_id INT REFERENCES pharmacies(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_amount DECIMAL(10, 2) NOT NULL
);

CREATE TABLE receipt_items (
    receipt_id INT REFERENCES receipts(id) ON DELETE CASCADE,
    medicine_id INT REFERENCES medicines(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    price_at_sale DECIMAL(10, 2) NOT NULL,
    PRIMARY KEY (receipt_id, medicine_id)
);

-- Перемещения между аптеками/складами
CREATE TABLE stock_transfers (
    id SERIAL PRIMARY KEY,
    from_pharmacy_id INT REFERENCES pharmacies(id),
    to_pharmacy_id INT REFERENCES pharmacies(id),
    status VARCHAR(50) DEFAULT 'PENDING', 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transfer_items (
    transfer_id INT REFERENCES stock_transfers(id) ON DELETE CASCADE,
    medicine_id INT REFERENCES medicines(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (transfer_id, medicine_id)
);
