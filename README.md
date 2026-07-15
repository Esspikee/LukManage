# LukManage

LukManage is a personal, local-first finance app for tracking bank balances, debts, transactions, past reports, and future cash flow from a phone.

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
  - Bank balance, debt, net position, current-month movement, and health status
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
  - Bank balances
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

## Android APK (local-only)

LukManage can be bundled as a Capacitor Android app. The APK contains the built
web app, so normal use does not need GitHub Pages, a backend, an API key, or an
internet connection. The Android app uses its own device-local storage.

### Before moving from GitHub Pages

The installed APK cannot read the finance records stored by the GitHub Pages
browser app. Before installing it on your phone:

1. In the GitHub Pages app, use **Settings → Backup → Download JSON**.
2. Install the APK.
3. In the APK, use **Settings → Backup → Restore JSON**.
4. Verify your balances, debts, transactions, budgets, and categories before
   relying on the APK.

Keep JSON backups somewhere you control. Local-only data can be lost if the
phone is reset, the app is uninstalled, or the device is lost.

Android backup is left enabled by default (`android:allowBackup="true"`) so the
device owner can choose to use Android’s backup facilities. For stricter
phone-only storage, set it to `false` in `android/app/src/main/AndroidManifest.xml`;
doing so makes your manual JSON backup the only recovery path.

### Android development

Install Android Studio and its Android SDK, then connect an Android phone with
USB debugging enabled. The native project is committed in `android/`; do not
commit `android/local.properties`, signing keys, APKs, AABs, or personal
backups.

```powershell
# Build the assets with Android-safe relative URLs (no GitHub Pages base path)
pnpm run build:android

# Copy the build into the native Android project and sync Capacitor plugins
pnpm run android:sync

# Regenerate launcher and splash artwork from resources/
pnpm run android:assets

# Open the native project in Android Studio
pnpm run android:open

# Or build, sync, and run on a connected phone/emulator
pnpm run android:run

# Build an unsigned debug APK after syncing (Windows)
cd android
.\gradlew.bat assembleDebug
```

In Android Studio, use **Run** for development. For a personal install, use
**Build → Generate Signed Bundle / APK → APK** and keep the generated signing
key backed up securely; the same key is required to install future updates over
an existing installation.

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.
For a release APK, use Android Studio's signing wizard above instead of committing
keys or passwords to this repository.

The Android launcher and splash screens are generated from `resources/icon.png`
and `resources/splash.png`, which are based on the existing LukManage icon.
Update those source assets and run `pnpm run android:assets` before committing a
new native visual identity.

The Android build disables the web PWA service worker because assets are bundled
inside the APK. The GitHub Pages build remains available through `pnpm run
build:web` until you decide to retire it.

### Voice input on Android

The browser build uses the Web Speech API. The Android build uses the native
Capacitor speech-recognition adapter and asks for microphone permission only
when voice entry starts. It prefers on-device recognition when the phone and
Spanish (`es-CO`) support it, then falls back to the Android recognizer. The
same structured transaction parser and Keep / Re-do review remain in use.

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
