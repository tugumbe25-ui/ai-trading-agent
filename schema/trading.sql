-- Trading History Schema

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL, -- 'openai', 'anthropic', etc.
  model TEXT NOT NULL,
  status TEXT DEFAULT 'inactive', -- 'active', 'inactive', 'error'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Market Data table
CREATE TABLE IF NOT EXISTS market_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL NOT NULL,
  volume INTEGER,
  source TEXT, -- 'yfinance', 'alpha_vantage', etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, timestamp, source)
);

-- Trading Decisions table (LLM reasoning)
CREATE TABLE IF NOT EXISTS trading_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decision TEXT NOT NULL, -- 'BUY', 'SELL', 'HOLD'
  confidence REAL, -- 0.0 to 1.0
  reasoning TEXT, -- Full LLM explanation
  market_context TEXT, -- JSON: recent prices, volume, etc.
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(agent_id) REFERENCES agents(id),
  INDEX idx_agent_symbol_date (agent_id, symbol, timestamp)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  order_id TEXT UNIQUE,
  symbol TEXT NOT NULL,
  order_type TEXT NOT NULL, -- 'BUY', 'SELL'
  quantity REAL NOT NULL,
  price REAL NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'filled', 'cancelled', 'rejected'
  reason TEXT, -- Rejection reason if applicable
  decision_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  filled_at DATETIME,
  FOREIGN KEY(agent_id) REFERENCES agents(id),
  FOREIGN KEY(decision_id) REFERENCES trading_decisions(id),
  INDEX idx_agent_symbol_status (agent_id, symbol, status)
);

-- Trades table (filled orders)
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  trade_id TEXT UNIQUE,
  order_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL, -- 'BUY', 'SELL'
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL,
  commission REAL DEFAULT 0,
  pnl REAL,
  pnl_percent REAL,
  status TEXT DEFAULT 'open', -- 'open', 'closed'
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  FOREIGN KEY(agent_id) REFERENCES agents(id),
  FOREIGN KEY(order_id) REFERENCES orders(id),
  INDEX idx_agent_symbol_status (agent_id, symbol, status),
  INDEX idx_agent_profit (agent_id, pnl)
);

-- Portfolio positions
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL UNIQUE,
  cash REAL DEFAULT 100000,
  total_value REAL DEFAULT 100000,
  unrealized_pnl REAL DEFAULT 0,
  realized_pnl REAL DEFAULT 0,
  total_pnl REAL DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  loss_count INTEGER DEFAULT 0,
  win_rate REAL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(agent_id) REFERENCES agents(id)
);

-- Holdings table
CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL,
  avg_cost REAL NOT NULL,
  current_price REAL,
  unrealized_pnl REAL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id, symbol),
  FOREIGN KEY(agent_id) REFERENCES agents(id)
);

-- Risk Events table
CREATE TABLE IF NOT EXISTS risk_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'max_loss_exceeded', 'position_size_exceeded', 'drawdown_alert'
  severity TEXT NOT NULL, -- 'warning', 'critical'
  message TEXT,
  trade_id INTEGER,
  decision_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(agent_id) REFERENCES agents(id),
  FOREIGN KEY(trade_id) REFERENCES trades(id),
  FOREIGN KEY(decision_id) REFERENCES trading_decisions(id)
);

-- Performance metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  date DATE NOT NULL,
  daily_return REAL,
  daily_pnl REAL,
  trades_count INTEGER,
  win_count INTEGER,
  loss_count INTEGER,
  avg_win REAL,
  avg_loss REAL,
  max_drawdown REAL,
  sharpe_ratio REAL,
  profit_factor REAL,
  UNIQUE(agent_id, date),
  FOREIGN KEY(agent_id) REFERENCES agents(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_market_data_symbol_timestamp ON market_data(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_opened_at ON trades(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_decisions_timestamp ON trading_decisions(timestamp DESC);
