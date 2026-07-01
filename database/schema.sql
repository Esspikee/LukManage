PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS savings_accounts (
  id TEXT PRIMARY KEY,
  bank_name TEXT NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  current_balance INTEGER NOT NULL DEFAULT 0,
  monthly_payment INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  gasto_ingreso_ahorro TEXT NOT NULL CHECK (gasto_ingreso_ahorro IN ('Gasto', 'Ingreso', 'Ahorro')),
  categoria TEXT NOT NULL,
  subcategoria TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL,
  monto INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recurring_payments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Gasto', 'Ingreso', 'Ahorro')),
  category TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_fecha ON transactions (fecha);
CREATE INDEX IF NOT EXISTS idx_transactions_tipo ON transactions (gasto_ingreso_ahorro);
CREATE INDEX IF NOT EXISTS idx_transactions_categoria ON transactions (categoria);
CREATE INDEX IF NOT EXISTS idx_debts_due_date ON debts (due_date);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_active ON recurring_payments (active);
