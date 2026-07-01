# Personal Finance Local App

Phase 1 starts the app from zero with a local-first foundation. It is built for personal use and does not require a production server.

## Stack

- TypeScript
- React
- Vite static build
- Recharts for charts
- Local browser storage for the current prototype data
- SQLite schema prepared in `database/schema.sql`

The long-term desktop route remains Tauri + SQLite. This machine does not currently expose Rust/Tauri build tools, so the first implementation is a Tauri-ready React foundation that can run as a local static app while the database boundary is finalized.

## Current Screens

- Dashboard
  - Setup checklist while first-use records are incomplete
  - Total saved
  - Total debt
  - Net position
  - Current month income, expenses, savings, and net flow
  - Savings chart by bank
  - Debt chart by debt name
  - Current month flow and expense-category charts
  - Transaction totals
- Savings
  - Bank name
  - Balance
  - Inline row editing
- Debts
  - Debt name
  - Current balance
  - Monthly payment
  - Due date
  - Notes
  - Inline row editing
- Transactions
  - `fecha`
  - `gasto/ingreso/Ahorro`
  - `Categoria`
  - `Subcategoria`
  - `descripcion`
  - `monto`
  - Inline row editing
  - Category, subcategory, and description suggestions from existing records
  - Whitespace normalization for cleaner labels
- Reports
  - Filter by month, bimester, trimester, quarter, semester, or year
  - Income, expenses, savings, and net-flow metrics
  - Flow totals chart
  - Expenses by category chart
  - Read-only filtered transaction table
- Future
  - Add recurring expected income, expenses, and savings
  - Toggle recurring items active/inactive
  - Include debt monthly payments in the monthly forecast
  - Project end-of-month balance from current savings and expected movements
- Health
  - Flags invalid transaction dates
  - Flags zero or negative transaction amounts
  - Flags empty transaction labels
  - Flags debts without monthly payments
  - Flags inactive or incomplete recurring items
- Backup
  - Export local data as JSON
  - Restore local data from JSON
  - Export transactions, savings, debts, and recurring payments as separate CSV files
  - Import transactions, savings, debts, and recurring payments from CSV files
  - Load sample data for testing
  - Clear local data after confirmation

CSV imports append records to the current local data. Use JSON restore when you want to replace the whole local state.
CSV imports skip duplicates and show an import summary. Transaction duplicates are detected from the six transaction columns; savings, debts, and recurring payments are detected by name.

## Commands

```powershell
$env:Path = 'C:\Users\laura\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& 'C:\Users\laura\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd' install
& 'C:\Users\laura\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd' build
```

The production files are generated in `dist/`.
