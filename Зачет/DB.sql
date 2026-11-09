-- ==========================================
-- 1. OLTP: Чеки и Склад
-- ==========================================
CREATE TABLE Medicines (
    Id INT PRIMARY KEY,
    Name NVARCHAR(100),
    FarmGroup NVARCHAR(100),
    StockQuantity INT
);

CREATE TABLE Receipts (
    Id INT PRIMARY KEY IDENTITY(1,1),
    MedicineId INT,
    Quantity INT,
    TotalSum DECIMAL(10,2),
    SaleDate DATETIME DEFAULT GETDATE()
);

-- ==========================================
-- 2. DWH: Аналитика спроса и дефектуры
-- ==========================================
CREATE TABLE DwhFarmGroupAnalytics (
    FarmGroup NVARCHAR(100) PRIMARY KEY,
    UnitsSold INT,          -- Спрос (сколько куплено)
    DefecturaCount INT      -- Дефектура (сколько раз товара НЕ было в наличии при запросе)
);

-- ==========================================
-- 3. КВ (Key-Value): Несовместимость
-- ==========================================
CREATE TABLE MedicineIncompatibility (
    MedicineKey INT,        -- ID первого лекарства
    IncompatibleKey INT,    -- ID запрещенного в пару лекарства
    WarningMessage NVARCHAR(255),
    PRIMARY KEY (MedicineKey, IncompatibleKey)
);
