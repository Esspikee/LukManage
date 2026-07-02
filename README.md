# LukManage

LukManage is a personal, local-first finance app for tracking savings, debts, transactions, past reports, and future cash flow from a phone.

The app can be hosted on GitHub Pages, but the finance records entered in the app stay in the browser storage on the device. The repository must not contain real CSV exports, spreadsheet files, or personal backup files.

## Privacy Model

- The hosted app shell is static HTML, CSS, and JavaScript.
- Personal records are stored locally in the phone browser using IndexedDB.
- JSON and CSV exports are manual backups that should stay private.
- Real finance files are ignored by git through `.gitignore`.
- If sensitive files were ever pushed, remove them from git history before treating the repository as clean.

## Stack

- TypeScript
- React
- Vite static build
- Recharts for charts
- IndexedDB through a repository layer in `src/persistence.ts`
- Vitest for logic and persistence tests
- PWA support through `vite-plugin-pwa`
- GitHub Pages deployment workflow in `.github/workflows/deploy.yml`
- SQLite schema draft in `database/schema.sql` for a possible future desktop route

## App Structure

The main navigation is intentionally simple:

- Past
  - Historical reports
  - Month, bimester, trimester, quarter, semester, and year filters
  - Flow totals, category charts, and period transactions
- Current Month
  - Overview dashboard
  - Savings, debt, net position, current-month movement, and health status
  - Monthly category budgets and progress
  - Transaction register using the six columns:
    - `fecha`
    - `gasto/ingreso/Ahorro`
    - `Categoria`
    - `Subcategoria`
    - `descripcion`
    - `monto`
- Future
  - Recurring expected income, expenses, and savings
  - Debt monthly payments
  - Projected end balance
- Settings
  - Savings banks
  - Debts
  - Backup/import/export
  - Health checks
  - Install/status checks

## Data Safety

Use `Settings > Backup > Download JSON` regularly, especially before clearing browser data, changing phones, or reinstalling the app from the home screen.

CSV imports append records and skip duplicates. JSON restore replaces the local state with the selected backup.

Ignored private file patterns include:

- `*.csv`
- `*.xlsx`
- `*.xls`
- `money-manager-backup-*.json`
- `finance-backup-*.json`
- `backup-*.json`

## Commands

```powershell
$env:Path = 'C:\Users\laura\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& 'C:\Users\laura\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd' install
& 'C:\Users\laura\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd' test
& 'C:\Users\laura\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd' build
```

Preview locally:

```powershell
& 'C:\Users\laura\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd' preview --host 127.0.0.1 --port 4173
```

The GitHub Pages preview path is:

```text
http://127.0.0.1:4173/LukManage/
```

## Phase Plan

Phase 1 is the personal-use foundation:

- Keep the three main tabs stable.
- Polish phone layout and first setup.
- Make backup/restore clear and reliable.
- Keep personal files out of git.
- Add tests around data logic as flows change.

Phase 2 improves daily use:

- Budgets and current-month progress. Started with monthly category limits in `Current Month > Budgets`.
- Better category management. Started with managed category names, types, colors, chart coloring, and CSV backup in `Current Month > Categories`.
- Debt payment workflow. Started with posting debt payments to transactions while reducing the debt balance.
- Faster daily transaction review. Started with search, type, category filters, sorting, and visible-row totals in `Current Month > Transactions`.
- Stronger data health checks. Started with actionable review links, duplicate transaction detection, and unmanaged-category warnings for manual, imported, or posted rows.
- More useful reports. Started with month-by-month trend charts inside the selected report period.
- More practical future projections. Started with an actionable monthly due list, rolling projected-balance chart, monthly projection table, and recurring-to-transaction posting.
- Stronger installable-phone experience. Started with PWA identity colors and `Settings > Install` status.

Phase 3 investigates automation:

- Android notification listener routes.
- Bank email parsing.
- CSV or statement imports.
- Tasker or MacroDroid workflows.
- OCR only as a fallback.
- Direct bank integrations only if they are safe and worth the tradeoff.

Automation should send detected transactions to a review queue with duplicate detection. It should not silently write messy notification data into final records.
