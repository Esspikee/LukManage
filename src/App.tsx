import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Download,
  Forward,
  Landmark,
  LayoutDashboard,
  Plus,
  ReceiptText,
  Scale,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, normalizeLabel, parseCsv, toCsv, toNumber, todayIso } from "./format";
import {
  createDebt,
  createRecurringPayment,
  createSavingsAccount,
  createTransaction,
  loadFinanceState,
  saveFinanceState,
} from "./storage";
import type { Debt, FinanceState, RecurringPayment, SavingsAccount, Transaction, TransactionType } from "./types";
import {
  buildForecast,
  buildHealthIssues,
  buildReport,
  clampDueDay,
  coerceFinanceState,
  createEmptyState,
  createSampleState,
  debtKey,
  importMessage,
  parseDebtRow,
  parseRecurringPaymentRow,
  parseSavingsRow,
  parseTransactionRow,
  recurringPaymentKey,
  reportPeriods,
  savingsKey,
  transactionKey,
  uniqueSorted,
} from "./finance";
import type { ForecastData, HealthIssue, ReportData, ReportPeriod } from "./finance";

type Section = "past" | "current" | "future" | "settings";
type CurrentSub = "overview" | "transactions";
type SettingsSub = "savings" | "debts" | "backup" | "health";
type CsvKind = "transactions" | "savings" | "debts" | "recurring";

const transactionTypes: TransactionType[] = ["Gasto", "Ingreso", "Ahorro"];
const chartColors = ["#2563eb", "#16a34a", "#dc2626", "#ca8a04", "#9333ea", "#0891b2"];

export function App() {
  const [activeSection, setActiveSection] = useState<Section>("current");
  const [currentSub, setCurrentSub] = useState<CurrentSub>("overview");
  const [settingsSub, setSettingsSub] = useState<SettingsSub>("savings");
  const [importSummary, setImportSummary] = useState("");
  const [reportMonth, setReportMonth] = useState(todayIso().slice(0, 7));
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("month");
  const [state, setState] = useState<FinanceState>(() => loadFinanceState());

  useEffect(() => {
    saveFinanceState(state);
  }, [state]);

  const totals = useMemo(() => {
    const totalSavings = state.savingsAccounts.reduce((sum, account) => sum + account.balance, 0);
    const totalDebt = state.debts.reduce((sum, debt) => sum + debt.currentBalance, 0);
    const totalIncome = state.transactions
      .filter((transaction) => transaction.gastoIngresoAhorro === "Ingreso")
      .reduce((sum, transaction) => sum + transaction.monto, 0);
    const totalExpenses = state.transactions
      .filter((transaction) => transaction.gastoIngresoAhorro === "Gasto")
      .reduce((sum, transaction) => sum + transaction.monto, 0);
    const totalSavedFromTransactions = state.transactions
      .filter((transaction) => transaction.gastoIngresoAhorro === "Ahorro")
      .reduce((sum, transaction) => sum + transaction.monto, 0);

    return {
      totalSavings,
      totalDebt,
      totalIncome,
      totalExpenses,
      totalSavedFromTransactions,
      netPosition: totalSavings - totalDebt,
    };
  }, [state]);

  const suggestions = useMemo(() => {
    const categories = uniqueSorted(state.transactions.map((transaction) => transaction.categoria));
    const subcategories = uniqueSorted(state.transactions.map((transaction) => transaction.subcategoria));
    const descriptions = uniqueSorted(state.transactions.map((transaction) => transaction.descripcion));

    return { categories, descriptions, subcategories };
  }, [state.transactions]);

  const report = useMemo(
    () => buildReport(state.transactions, reportMonth, reportPeriod),
    [reportMonth, reportPeriod, state.transactions],
  );
  const currentMonthReport = useMemo(
    () => buildReport(state.transactions, todayIso().slice(0, 7), "month"),
    [state.transactions],
  );
  const forecast = useMemo(() => buildForecast(state), [state]);
  const healthIssues = useMemo(() => buildHealthIssues(state), [state]);

  function addSavingsAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bankName = normalizeLabel(form.get("bankName"));
    if (!bankName) return;

    setState((current) => ({
      ...current,
      savingsAccounts: [
        ...current.savingsAccounts,
        createSavingsAccount({ bankName, balance: toNumber(form.get("balance")) }),
      ],
    }));
    event.currentTarget.reset();
  }

  function addDebt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = normalizeLabel(form.get("name"));
    if (!name) return;

    setState((current) => ({
      ...current,
      debts: [
        ...current.debts,
        createDebt({
          name,
          currentBalance: toNumber(form.get("currentBalance")),
          monthlyPayment: toNumber(form.get("monthlyPayment")),
          dueDate: String(form.get("dueDate") || ""),
          notes: normalizeLabel(form.get("notes")),
        }),
      ],
    }));
    event.currentTarget.reset();
  }

  function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const categoria = normalizeLabel(form.get("categoria"));
    const descripcion = normalizeLabel(form.get("descripcion"));
    if (!categoria || !descripcion) return;

    setState((current) => ({
      ...current,
      transactions: [
        createTransaction({
          fecha: String(form.get("fecha") || todayIso()),
          gastoIngresoAhorro: String(form.get("tipo") || "Gasto") as TransactionType,
          categoria,
          subcategoria: normalizeLabel(form.get("subcategoria")),
          descripcion,
          monto: toNumber(form.get("monto")),
        }),
        ...current.transactions,
      ],
    }));
    event.currentTarget.reset();
  }

  function addRecurringPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = normalizeLabel(form.get("name"));
    const category = normalizeLabel(form.get("category"));
    if (!name || !category) return;

    setState((current) => ({
      ...current,
      recurringPayments: [
        ...current.recurringPayments,
        createRecurringPayment({
          name,
          type: String(form.get("type") || "Gasto") as TransactionType,
          category,
          amount: toNumber(form.get("amount")),
          dueDay: clampDueDay(toNumber(form.get("dueDay"))),
          active: true,
        }),
      ],
    }));
    event.currentTarget.reset();
  }

  function removeSavingsAccount(id: string) {
    setState((current) => ({
      ...current,
      savingsAccounts: current.savingsAccounts.filter((account) => account.id !== id),
    }));
  }

  function updateSavingsAccount(id: string, patch: Partial<SavingsAccount>) {
    setState((current) => ({
      ...current,
      savingsAccounts: current.savingsAccounts.map((account) =>
        account.id === id ? { ...account, ...patch } : account,
      ),
    }));
  }

  function removeDebt(id: string) {
    setState((current) => ({
      ...current,
      debts: current.debts.filter((debt) => debt.id !== id),
    }));
  }

  function updateDebt(id: string, patch: Partial<Debt>) {
    setState((current) => ({
      ...current,
      debts: current.debts.map((debt) => (debt.id === id ? { ...debt, ...patch } : debt)),
    }));
  }

  function removeTransaction(id: string) {
    setState((current) => ({
      ...current,
      transactions: current.transactions.filter((transaction) => transaction.id !== id),
    }));
  }

  function updateTransaction(id: string, patch: Partial<Transaction>) {
    setState((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) =>
        transaction.id === id ? { ...transaction, ...patch } : transaction,
      ),
    }));
  }

  function removeRecurringPayment(id: string) {
    setState((current) => ({
      ...current,
      recurringPayments: current.recurringPayments.filter((payment) => payment.id !== id),
    }));
  }

  function updateRecurringPayment(id: string, patch: Partial<RecurringPayment>) {
    setState((current) => ({
      ...current,
      recurringPayments: current.recurringPayments.map((payment) =>
        payment.id === id ? { ...payment, ...patch } : payment,
      ),
    }));
  }

  function loadSampleData() {
    const hasData =
      state.savingsAccounts.length ||
      state.debts.length ||
      state.transactions.length ||
      state.recurringPayments.length;
    if (hasData && !window.confirm("Replace current local data with sample data?")) return;

    setState(createSampleState());
    setImportSummary("Sample data loaded.");
  }

  function clearLocalData() {
    if (!window.confirm("Clear all local finance data from this app?")) return;

    setState(createEmptyState());
    setImportSummary("Local data cleared.");
  }

  function exportBackup() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, state }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `money-manager-backup-${todayIso()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadFile(filename: string, contents: string, type: string) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv(kind: CsvKind) {
    if (kind === "transactions") {
      downloadFile(
        `transactions-${todayIso()}.csv`,
        toCsv([
          ["fecha", "gasto/ingreso/Ahorro", "Categoria", "Subcategoria", "descripcion", "monto"],
          ...state.transactions.map((transaction) => [
            transaction.fecha,
            transaction.gastoIngresoAhorro,
            transaction.categoria,
            transaction.subcategoria,
            transaction.descripcion,
            transaction.monto,
          ]),
        ]),
        "text/csv;charset=utf-8",
      );
      return;
    }

    if (kind === "savings") {
      downloadFile(
        `savings-${todayIso()}.csv`,
        toCsv([
          ["bank_name", "balance"],
          ...state.savingsAccounts.map((account) => [account.bankName, account.balance]),
        ]),
        "text/csv;charset=utf-8",
      );
      return;
    }

    if (kind === "recurring") {
      downloadFile(
        `recurring-payments-${todayIso()}.csv`,
        toCsv([
          ["name", "type", "category", "amount", "due_day", "active"],
          ...state.recurringPayments.map((payment) => [
            payment.name,
            payment.type,
            payment.category,
            payment.amount,
            payment.dueDay,
            payment.active ? "true" : "false",
          ]),
        ]),
        "text/csv;charset=utf-8",
      );
      return;
    }

    downloadFile(
      `debts-${todayIso()}.csv`,
      toCsv([
        ["name", "current_balance", "monthly_payment", "due_date", "notes"],
        ...state.debts.map((debt) => [
          debt.name,
          debt.currentBalance,
          debt.monthlyPayment,
          debt.dueDate,
          debt.notes,
        ]),
      ]),
      "text/csv;charset=utf-8",
    );
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>, kind: CsvKind) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = parseCsv(await file.text());
      const [header = [], ...body] = rows;

      if (kind === "transactions") {
        const parsed = body
          .map((row) => parseTransactionRow(header, row))
          .filter((transaction): transaction is Transaction => Boolean(transaction));
        const existingKeys = new Set(state.transactions.map(transactionKey));
        const imported = parsed.filter((transaction) => {
          const key = transactionKey(transaction);
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });

        setState((current) => ({ ...current, transactions: [...imported, ...current.transactions] }));
        setImportSummary(importMessage("transactions", imported.length, parsed.length - imported.length, body.length - parsed.length));
        return;
      }

      if (kind === "savings") {
        const parsed = body
          .map((row) => parseSavingsRow(header, row))
          .filter((account): account is SavingsAccount => Boolean(account));
        const existingKeys = new Set(state.savingsAccounts.map(savingsKey));
        const imported = parsed.filter((account) => {
          const key = savingsKey(account);
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });

        setState((current) => ({ ...current, savingsAccounts: [...current.savingsAccounts, ...imported] }));
        setImportSummary(importMessage("savings", imported.length, parsed.length - imported.length, body.length - parsed.length));
        return;
      }

      if (kind === "recurring") {
        const parsed = body
          .map((row) => parseRecurringPaymentRow(header, row))
          .filter((payment): payment is RecurringPayment => Boolean(payment));
        const existingKeys = new Set(state.recurringPayments.map(recurringPaymentKey));
        const imported = parsed.filter((payment) => {
          const key = recurringPaymentKey(payment);
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });

        setState((current) => ({ ...current, recurringPayments: [...current.recurringPayments, ...imported] }));
        setImportSummary(importMessage("recurring payments", imported.length, parsed.length - imported.length, body.length - parsed.length));
        return;
      }

      const parsed = body.map((row) => parseDebtRow(header, row)).filter((debt): debt is Debt => Boolean(debt));
      const existingKeys = new Set(state.debts.map(debtKey));
      const imported = parsed.filter((debt) => {
        const key = debtKey(debt);
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });

      setState((current) => ({ ...current, debts: [...current.debts, ...imported] }));
      setImportSummary(importMessage("debts", imported.length, parsed.length - imported.length, body.length - parsed.length));
    } catch {
      setImportSummary("The selected CSV file could not be imported.");
    } finally {
      event.target.value = "";
    }
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const nextState = coerceFinanceState(parsed);

      setState(nextState);
    } catch {
      window.alert("The selected backup file could not be read.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">Local finance</p>
          <h1>Money Manager</h1>
        </div>
        <nav className="tabs primary-tabs" aria-label="Primary">
          <TabButton icon={<CalendarRange size={18} />} label="Past" tab="past" active={activeSection} onClick={setActiveSection} />
          <TabButton icon={<LayoutDashboard size={18} />} label="Current Month" tab="current" active={activeSection} onClick={setActiveSection} />
          <TabButton icon={<Forward size={18} />} label="Future" tab="future" active={activeSection} onClick={setActiveSection} />
        </nav>
        <nav className="tabs settings-tab" aria-label="Settings">
          <TabButton icon={<Settings size={18} />} label="Settings" tab="settings" active={activeSection} onClick={setActiveSection} badge={healthIssues.length} />
        </nav>
      </header>

      <section className="content">
        {activeSection === "current" && (
          <>
            <nav className="subnav" aria-label="Current month sections">
              <TabButton icon={<LayoutDashboard size={16} />} label="Overview" tab="overview" active={currentSub} onClick={setCurrentSub} />
              <TabButton icon={<ReceiptText size={16} />} label="Transactions" tab="transactions" active={currentSub} onClick={setCurrentSub} />
            </nav>
            {currentSub === "overview" && (
              <Dashboard
                savingsAccounts={state.savingsAccounts}
                debts={state.debts}
                currentMonthReport={currentMonthReport}
                transactions={state.transactions}
                totals={totals}
                healthIssues={healthIssues}
              />
            )}
            {currentSub === "transactions" && (
              <TransactionsView
                transactions={state.transactions}
                onAdd={addTransaction}
                onRemove={removeTransaction}
                onUpdate={updateTransaction}
                suggestions={suggestions}
              />
            )}
          </>
        )}

        {activeSection === "past" && (
          <ReportsView
            month={reportMonth}
            onMonthChange={setReportMonth}
            onPeriodChange={setReportPeriod}
            period={reportPeriod}
            report={report}
          />
        )}

        {activeSection === "future" && (
          <FutureView
            forecast={forecast}
            onAdd={addRecurringPayment}
            onRemove={removeRecurringPayment}
            onUpdate={updateRecurringPayment}
            recurringPayments={state.recurringPayments}
          />
        )}

        {activeSection === "settings" && (
          <>
            <nav className="subnav" aria-label="Settings sections">
              <TabButton icon={<Landmark size={16} />} label="Savings" tab="savings" active={settingsSub} onClick={setSettingsSub} />
              <TabButton icon={<Scale size={16} />} label="Debts" tab="debts" active={settingsSub} onClick={setSettingsSub} />
              <TabButton icon={<Download size={16} />} label="Backup" tab="backup" active={settingsSub} onClick={setSettingsSub} />
              <TabButton icon={<AlertTriangle size={16} />} label="Health" tab="health" active={settingsSub} onClick={setSettingsSub} badge={healthIssues.length} />
            </nav>
            {settingsSub === "savings" && (
              <SavingsView
                accounts={state.savingsAccounts}
                onAdd={addSavingsAccount}
                onRemove={removeSavingsAccount}
                onUpdate={updateSavingsAccount}
              />
            )}
            {settingsSub === "debts" && (
              <DebtsView debts={state.debts} onAdd={addDebt} onRemove={removeDebt} onUpdate={updateDebt} />
            )}
            {settingsSub === "backup" && (
              <BackupView
                onCsvExport={exportCsv}
                onCsvImport={importCsv}
                onExport={exportBackup}
                onImport={importBackup}
                importSummary={importSummary}
                onClearData={clearLocalData}
                onLoadSampleData={loadSampleData}
                state={state}
              />
            )}
            {settingsSub === "health" && <HealthView issues={healthIssues} state={state} />}
          </>
        )}
      </section>
    </main>
  );
}

function TabButton<T extends string>({
  active,
  badge,
  icon,
  label,
  onClick,
  tab,
}: {
  active: T;
  badge?: number;
  icon: React.ReactNode;
  label: string;
  onClick: (tab: T) => void;
  tab: T;
}) {
  return (
    <button className={active === tab ? "tab active" : "tab"} onClick={() => onClick(tab)} type="button">
      {icon}
      <span>{label}</span>
      {badge ? <span className="tab-badge">{badge}</span> : null}
    </button>
  );
}

function Dashboard({
  currentMonthReport,
  debts,
  healthIssues,
  savingsAccounts,
  totals,
  transactions,
}: {
  currentMonthReport: ReportData;
  debts: Debt[];
  healthIssues: HealthIssue[];
  savingsAccounts: SavingsAccount[];
  totals: {
    totalSavings: number;
    totalDebt: number;
    totalIncome: number;
    totalExpenses: number;
    totalSavedFromTransactions: number;
    netPosition: number;
  };
  transactions: Transaction[];
}) {
  const lifetimeFlowData = [
    { name: "Ingreso", value: totals.totalIncome },
    { name: "Gasto", value: totals.totalExpenses },
    { name: "Ahorro", value: totals.totalSavedFromTransactions },
  ];
  const currentMonthFlowData = [
    { name: "Ingreso", value: currentMonthReport.totals.income },
    { name: "Gasto", value: currentMonthReport.totals.expenses },
    { name: "Ahorro", value: currentMonthReport.totals.savings },
  ];
  const setupItems = [
    {
      done: savingsAccounts.length > 0,
      label: "Add your savings banks",
      value: `${savingsAccounts.length} bank${savingsAccounts.length === 1 ? "" : "s"}`,
    },
    {
      done: debts.length > 0,
      label: "Add debts if you have any",
      value: `${debts.length} debt${debts.length === 1 ? "" : "s"}`,
    },
    {
      done: transactions.length > 0,
      label: "Add or import transactions",
      value: `${transactions.length} row${transactions.length === 1 ? "" : "s"}`,
    },
  ];
  const setupComplete = setupItems.every((item) => item.done);

  return (
    <div className="stack">
      <Header title="Dashboard" subtitle="Your current position and this month's movement." />
      {!setupComplete ? <SetupChecklist items={setupItems} /> : null}
      <div className="metric-grid">
        <Metric label="Total saved" value={formatCurrency(totals.totalSavings)} tone="positive" />
        <Metric label="Total debt" value={formatCurrency(totals.totalDebt)} tone="negative" />
        <Metric label="Net position" value={formatCurrency(totals.netPosition)} tone={totals.netPosition >= 0 ? "positive" : "negative"} />
        <Metric label="Health issues" value={healthIssues.length.toString()} tone={healthIssues.length ? "negative" : "positive"} />
      </div>

      <section className="stack compact-stack">
        <div className="section-subtitle">
          <h3>Current month</h3>
          <span>{currentMonthReport.label}</span>
        </div>
        <div className="metric-grid">
          <Metric label="Month income" value={formatCurrency(currentMonthReport.totals.income)} tone="positive" />
          <Metric label="Month expenses" value={formatCurrency(currentMonthReport.totals.expenses)} tone="negative" />
          <Metric label="Month savings" value={formatCurrency(currentMonthReport.totals.savings)} tone="neutral" />
          <Metric
            label="Month net flow"
            value={formatCurrency(currentMonthReport.totals.netFlow)}
            tone={currentMonthReport.totals.netFlow >= 0 ? "positive" : "negative"}
          />
        </div>
      </section>

      <div className="chart-grid">
        <ChartPanel title="Savings by bank" empty={savingsAccounts.length === 0}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={savingsAccounts} dataKey="balance" nameKey="bankName" outerRadius={95} label>
                {savingsAccounts.map((account, index) => (
                  <Cell key={account.id} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Debt by name" empty={debts.length === 0}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={debts}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="currentBalance" fill="#dc2626" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <div className="chart-grid">
        <ChartPanel title="Current month flow" empty={currentMonthReport.filteredTransactions.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={currentMonthFlowData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Current month expenses" empty={currentMonthReport.categoryExpenses.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={currentMonthReport.categoryExpenses}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="value" fill="#dc2626" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <ChartPanel title="Lifetime transaction totals" empty={transactions.length === 0}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={lifetimeFlowData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}

function SetupChecklist({ items }: { items: Array<{ done: boolean; label: string; value: string }> }) {
  return (
    <section className="setup-panel">
      <div className="panel-title">
        <CheckCircle2 size={18} />
        <h3>Setup checklist</h3>
      </div>
      <div className="setup-list">
        {items.map((item) => (
          <div className={item.done ? "setup-item done" : "setup-item"} key={item.label}>
            <CheckCircle2 size={18} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function SavingsView({
  accounts,
  onAdd,
  onRemove,
  onUpdate,
}: {
  accounts: SavingsAccount[];
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<SavingsAccount>) => void;
}) {
  return (
    <div className="stack">
      <Header title="Savings" subtitle="Register each bank and the money currently saved there." />
      <form className="entry-form" onSubmit={onAdd}>
        <label>
          Bank name
          <input name="bankName" placeholder="Lulo Bank" required />
        </label>
        <label>
          Balance
          <input name="balance" inputMode="decimal" placeholder="2500000" required />
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          Add bank
        </button>
      </form>
      <SavingsTable accounts={accounts} onRemove={onRemove} onUpdate={onUpdate} />
    </div>
  );
}

function DebtsView({
  debts,
  onAdd,
  onRemove,
  onUpdate,
}: {
  debts: Debt[];
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Debt>) => void;
}) {
  return (
    <div className="stack">
      <Header title="Debts" subtitle="Track what you owe, without interest-rate complexity." />
      <form className="entry-form debt-form" onSubmit={onAdd}>
        <label>
          Debt name
          <input name="name" placeholder="Credit card" required />
        </label>
        <label>
          Current balance
          <input name="currentBalance" inputMode="decimal" placeholder="1200000" required />
        </label>
        <label>
          Monthly payment
          <input name="monthlyPayment" inputMode="decimal" placeholder="400000" />
        </label>
        <label>
          Due date
          <input name="dueDate" type="date" />
        </label>
        <label className="wide">
          Notes
          <input name="notes" placeholder="Optional" />
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          Add debt
        </button>
      </form>
      <DebtsTable debts={debts} onRemove={onRemove} onUpdate={onUpdate} />
    </div>
  );
}

function TransactionsView({
  onAdd,
  onRemove,
  onUpdate,
  suggestions,
  transactions,
}: {
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Transaction>) => void;
  suggestions: {
    categories: string[];
    descriptions: string[];
    subcategories: string[];
  };
  transactions: Transaction[];
}) {
  return (
    <div className="stack">
      <Header title="Transactions" subtitle="Your six-column register starts here." />
      <form className="entry-form transaction-form" onSubmit={onAdd}>
        <label>
          Fecha
          <input defaultValue={todayIso()} name="fecha" type="date" required />
        </label>
        <label>
          Gasto/Ingreso/Ahorro
          <select name="tipo">
            {transactionTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <input list="category-options" name="categoria" placeholder="Personal" required />
        </label>
        <label>
          Subcategoria
          <input list="subcategory-options" name="subcategoria" placeholder="Comida" />
        </label>
        <label>
          Descripcion
          <input list="description-options" name="descripcion" placeholder="Lunch" required />
        </label>
        <label>
          Monto
          <input name="monto" inputMode="decimal" placeholder="25000" required />
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          Add row
        </button>
        <Datalist id="category-options" options={suggestions.categories} />
        <Datalist id="subcategory-options" options={suggestions.subcategories} />
        <Datalist id="description-options" options={suggestions.descriptions} />
      </form>
      <TransactionsTable transactions={transactions} onRemove={onRemove} onUpdate={onUpdate} />
    </div>
  );
}

function ReportsView({
  month,
  onMonthChange,
  onPeriodChange,
  period,
  report,
}: {
  month: string;
  onMonthChange: (value: string) => void;
  onPeriodChange: (value: ReportPeriod) => void;
  period: ReportPeriod;
  report: ReportData;
}) {
  const flowData = [
    { name: "Ingreso", value: report.totals.income },
    { name: "Gasto", value: report.totals.expenses },
    { name: "Ahorro", value: report.totals.savings },
  ];

  return (
    <div className="stack">
      <Header title="Reports" subtitle="Review past movement by month, bimester, trimester, quarter, semester, or year." />
      <form className="report-controls">
        <label>
          Period
          <select onChange={(event) => onPeriodChange(event.currentTarget.value as ReportPeriod)} value={period}>
            {reportPeriods.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Month inside period
          <input onChange={(event) => onMonthChange(event.currentTarget.value)} type="month" value={month} />
        </label>
        <div className="report-label">{report.label}</div>
      </form>

      <div className="metric-grid">
        <Metric label="Income" value={formatCurrency(report.totals.income)} tone="positive" />
        <Metric label="Expenses" value={formatCurrency(report.totals.expenses)} tone="negative" />
        <Metric label="Savings" value={formatCurrency(report.totals.savings)} tone="neutral" />
        <Metric
          label="Net flow"
          value={formatCurrency(report.totals.netFlow)}
          tone={report.totals.netFlow >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="chart-grid">
        <ChartPanel title="Flow totals" empty={report.filteredTransactions.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={flowData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Expenses by category" empty={report.categoryExpenses.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={report.categoryExpenses}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="value" fill="#dc2626" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <section className="panel">
        <div className="panel-title">
          <ReceiptText size={18} />
          <h3>Transactions in period</h3>
        </div>
        <ReportTransactionsTable transactions={report.filteredTransactions} />
      </section>
    </div>
  );
}

function FutureView({
  forecast,
  onAdd,
  onRemove,
  onUpdate,
  recurringPayments,
}: {
  forecast: ForecastData;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<RecurringPayment>) => void;
  recurringPayments: RecurringPayment[];
}) {
  const forecastData = [
    { name: "Starting", value: forecast.startingSavings },
    { name: "Income", value: forecast.recurringIncome },
    { name: "Expenses", value: forecast.recurringExpenses },
    { name: "Savings", value: forecast.recurringSavings },
    { name: "Debt", value: forecast.debtPayments },
    { name: "Projected", value: forecast.projectedEndBalance },
  ];

  return (
    <div className="stack">
      <Header title="Future" subtitle="Track recurring expected money movements for a simple monthly forecast." />
      <div className="metric-grid">
        <Metric label="Starting savings" value={formatCurrency(forecast.startingSavings)} tone="positive" />
        <Metric label="Expected income" value={formatCurrency(forecast.recurringIncome)} tone="positive" />
        <Metric label="Expected outflow" value={formatCurrency(forecast.recurringExpenses + forecast.recurringSavings + forecast.debtPayments)} tone="negative" />
        <Metric
          label="Projected end"
          value={formatCurrency(forecast.projectedEndBalance)}
          tone={forecast.projectedEndBalance >= 0 ? "positive" : "negative"}
        />
      </div>

      <form className="entry-form recurring-form" onSubmit={onAdd}>
        <label>
          Name
          <input name="name" placeholder="Rent" required />
        </label>
        <label>
          Type
          <select name="type">
            {transactionTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          Category
          <input name="category" placeholder="Fixed expense" required />
        </label>
        <label>
          Amount
          <input name="amount" inputMode="decimal" placeholder="1000000" required />
        </label>
        <label>
          Due day
          <input max="31" min="1" name="dueDay" placeholder="1" type="number" />
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          Add recurring
        </button>
      </form>

      <ChartPanel title="Monthly forecast" empty={forecast.activePayments.length === 0 && forecast.debtPayments === 0}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={forecastData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <RecurringPaymentsTable payments={recurringPayments} onRemove={onRemove} onUpdate={onUpdate} />
    </div>
  );
}

function HealthView({ issues, state }: { issues: HealthIssue[]; state: FinanceState }) {
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const info = issues.filter((issue) => issue.severity === "info").length;

  return (
    <div className="stack">
      <Header title="Health" subtitle="Review data quality before it affects dashboards, reports, or forecasts." />
      <div className="metric-grid">
        <Metric label="Warnings" value={warnings.toString()} tone={warnings ? "negative" : "positive"} />
        <Metric label="Info" value={info.toString()} tone="neutral" />
        <Metric label="Transactions" value={state.transactions.length.toString()} tone="neutral" />
        <Metric label="Recurring" value={state.recurringPayments.length.toString()} tone="neutral" />
      </div>
      <section className="panel">
        <div className="panel-title">
          <AlertTriangle size={18} />
          <h3>Data checks</h3>
        </div>
        {issues.length ? (
          <div className="health-list">
            {issues.map((issue) => (
              <article className={`health-item ${issue.severity}`} key={issue.id}>
                <AlertTriangle size={18} />
                <div>
                  <strong>{issue.title}</strong>
                  <span>{issue.detail}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">No data health issues found.</div>
        )}
      </section>
    </div>
  );
}

function BackupView({
  importSummary,
  onClearData,
  onCsvExport,
  onCsvImport,
  onExport,
  onImport,
  onLoadSampleData,
  state,
}: {
  importSummary: string;
  onClearData: () => void;
  onCsvExport: (kind: CsvKind) => void;
  onCsvImport: (event: ChangeEvent<HTMLInputElement>, kind: CsvKind) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadSampleData: () => void;
  state: FinanceState;
}) {
  return (
    <div className="stack">
      <Header title="Backup" subtitle="Keep a local copy of the records you enter." />
      <div className="backup-grid">
        <section className="panel action-panel">
          <div className="panel-title">
            <Download size={18} />
            <h3>Export</h3>
          </div>
          <button className="primary-button" onClick={onExport} type="button">
            <Download size={18} />
            Download JSON
          </button>
          <div className="button-row">
            <button className="secondary-button" onClick={() => onCsvExport("transactions")} type="button">
              Transactions CSV
            </button>
            <button className="secondary-button" onClick={() => onCsvExport("savings")} type="button">
              Savings CSV
            </button>
            <button className="secondary-button" onClick={() => onCsvExport("debts")} type="button">
              Debts CSV
            </button>
            <button className="secondary-button" onClick={() => onCsvExport("recurring")} type="button">
              Recurring CSV
            </button>
          </div>
        </section>
        <section className="panel action-panel">
          <div className="panel-title">
            <Upload size={18} />
            <h3>Import</h3>
          </div>
          <label className="file-button">
            <Upload size={18} />
            Restore JSON
            <input accept="application/json" onChange={onImport} type="file" />
          </label>
          <div className="button-row">
            <label className="file-button compact">
              Transactions CSV
              <input accept=".csv,text/csv" onChange={(event) => onCsvImport(event, "transactions")} type="file" />
            </label>
            <label className="file-button compact">
              Savings CSV
              <input accept=".csv,text/csv" onChange={(event) => onCsvImport(event, "savings")} type="file" />
            </label>
            <label className="file-button compact">
              Debts CSV
              <input accept=".csv,text/csv" onChange={(event) => onCsvImport(event, "debts")} type="file" />
            </label>
            <label className="file-button compact">
              Recurring CSV
              <input accept=".csv,text/csv" onChange={(event) => onCsvImport(event, "recurring")} type="file" />
            </label>
          </div>
        </section>
      </div>
      <section className="panel action-panel">
        <div className="panel-title">
          <Trash2 size={18} />
          <h3>Utilities</h3>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={onLoadSampleData} type="button">
            Load sample data
          </button>
          <button className="danger-button" onClick={onClearData} type="button">
            Clear local data
          </button>
        </div>
      </section>
      {importSummary ? <div className="import-summary">{importSummary}</div> : null}
      <div className="metric-grid">
        <Metric label="Savings banks" value={state.savingsAccounts.length.toString()} tone="neutral" />
        <Metric label="Debts" value={state.debts.length.toString()} tone="negative" />
        <Metric label="Transactions" value={state.transactions.length.toString()} tone="positive" />
      </div>
    </div>
  );
}

function Datalist({ id, options }: { id: string; options: string[] }) {
  if (!options.length) return null;

  return (
    <datalist id={id}>
      {options.map((option) => (
        <option key={option} value={option} />
      ))}
    </datalist>
  );
}

function Header({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <header className="section-header">
      <p className="eyebrow">Phase 1</p>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </header>
  );
}

function Metric({ label, tone, value }: { label: string; tone: "positive" | "negative" | "neutral"; value: string }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ChartPanel({ children, empty, title }: { children: React.ReactNode; empty: boolean; title: string }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <BarChart3 size={18} />
        <h3>{title}</h3>
      </div>
      {empty ? <div className="empty-state">Add records to see this chart.</div> : children}
    </section>
  );
}

function SavingsTable({
  accounts,
  onRemove,
  onUpdate,
}: {
  accounts: SavingsAccount[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<SavingsAccount>) => void;
}) {
  if (!accounts.length) return <EmptyTable message="No savings banks yet." />;
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Bank</th>
          <th>Balance</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {accounts.map((account) => (
          <tr key={account.id}>
            <td>
              <input
                className="table-input"
                defaultValue={account.bankName}
                onBlur={(event) => onUpdate(account.id, { bankName: normalizeLabel(event.currentTarget.value) || account.bankName })}
              />
            </td>
            <td>
              <input
                className="table-input number"
                defaultValue={account.balance}
                inputMode="decimal"
                onBlur={(event) => onUpdate(account.id, { balance: toNumber(event.currentTarget.value) })}
              />
            </td>
            <td>
              <IconButton label="Delete bank" onClick={() => onRemove(account.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function DebtsTable({
  debts,
  onRemove,
  onUpdate,
}: {
  debts: Debt[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Debt>) => void;
}) {
  if (!debts.length) return <EmptyTable message="No debts yet." />;
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Name</th>
          <th>Current balance</th>
          <th>Monthly payment</th>
          <th>Due date</th>
          <th>Notes</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {debts.map((debt) => (
          <tr key={debt.id}>
            <td>
              <input
                className="table-input"
                defaultValue={debt.name}
                onBlur={(event) => onUpdate(debt.id, { name: normalizeLabel(event.currentTarget.value) || debt.name })}
              />
            </td>
            <td>
              <input
                className="table-input number"
                defaultValue={debt.currentBalance}
                inputMode="decimal"
                onBlur={(event) => onUpdate(debt.id, { currentBalance: toNumber(event.currentTarget.value) })}
              />
            </td>
            <td>
              <input
                className="table-input number"
                defaultValue={debt.monthlyPayment}
                inputMode="decimal"
                onBlur={(event) => onUpdate(debt.id, { monthlyPayment: toNumber(event.currentTarget.value) })}
              />
            </td>
            <td>
              <input
                className="table-input"
                defaultValue={debt.dueDate}
                onBlur={(event) => onUpdate(debt.id, { dueDate: event.currentTarget.value })}
                type="date"
              />
            </td>
            <td>
              <input
                className="table-input"
                defaultValue={debt.notes}
                onBlur={(event) => onUpdate(debt.id, { notes: normalizeLabel(event.currentTarget.value) })}
              />
            </td>
            <td>
              <IconButton label="Delete debt" onClick={() => onRemove(debt.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function TransactionsTable({
  onRemove,
  onUpdate,
  transactions,
}: {
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Transaction>) => void;
  transactions: Transaction[];
}) {
  if (!transactions.length) return <EmptyTable message="No transactions yet." />;
  return (
    <DataTable>
      <thead>
        <tr>
          <th>fecha</th>
          <th>gasto/ingreso/Ahorro</th>
          <th>Categoria</th>
          <th>Subcategoria</th>
          <th>descripcion</th>
          <th>monto</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => (
          <tr key={transaction.id}>
            <td>
              <input
                className="table-input"
                defaultValue={transaction.fecha}
                onBlur={(event) => onUpdate(transaction.id, { fecha: event.currentTarget.value })}
                type="date"
              />
            </td>
            <td>
              <select
                className="table-input"
                defaultValue={transaction.gastoIngresoAhorro}
                onChange={(event) =>
                  onUpdate(transaction.id, { gastoIngresoAhorro: event.currentTarget.value as TransactionType })
                }
              >
                {transactionTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </td>
            <td>
              <input
                className="table-input"
                defaultValue={transaction.categoria}
                onBlur={(event) =>
                  onUpdate(transaction.id, { categoria: normalizeLabel(event.currentTarget.value) || transaction.categoria })
                }
              />
            </td>
            <td>
              <input
                className="table-input"
                defaultValue={transaction.subcategoria}
                onBlur={(event) => onUpdate(transaction.id, { subcategoria: normalizeLabel(event.currentTarget.value) })}
              />
            </td>
            <td>
              <input
                className="table-input description"
                defaultValue={transaction.descripcion}
                onBlur={(event) =>
                  onUpdate(transaction.id, { descripcion: normalizeLabel(event.currentTarget.value) || transaction.descripcion })
                }
              />
            </td>
            <td>
              <input
                className="table-input number"
                defaultValue={transaction.monto}
                inputMode="decimal"
                onBlur={(event) => onUpdate(transaction.id, { monto: toNumber(event.currentTarget.value) })}
              />
            </td>
            <td>
              <IconButton label="Delete transaction" onClick={() => onRemove(transaction.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function ReportTransactionsTable({ transactions }: { transactions: Transaction[] }) {
  if (!transactions.length) return <EmptyTable message="No transactions found for this period." />;

  return (
    <DataTable>
      <thead>
        <tr>
          <th>fecha</th>
          <th>gasto/ingreso/Ahorro</th>
          <th>Categoria</th>
          <th>Subcategoria</th>
          <th>descripcion</th>
          <th>monto</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => (
          <tr key={transaction.id}>
            <td>{transaction.fecha}</td>
            <td>{transaction.gastoIngresoAhorro}</td>
            <td>{transaction.categoria}</td>
            <td>{transaction.subcategoria || "-"}</td>
            <td>{transaction.descripcion}</td>
            <td>{formatCurrency(transaction.monto)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function RecurringPaymentsTable({
  onRemove,
  onUpdate,
  payments,
}: {
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<RecurringPayment>) => void;
  payments: RecurringPayment[];
}) {
  if (!payments.length) return <EmptyTable message="No recurring payments yet." />;

  return (
    <DataTable>
      <thead>
        <tr>
          <th>Active</th>
          <th>Name</th>
          <th>Type</th>
          <th>Category</th>
          <th>Amount</th>
          <th>Due day</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {payments.map((payment) => (
          <tr key={payment.id}>
            <td>
              <input
                checked={payment.active}
                className="table-checkbox"
                onChange={(event) => onUpdate(payment.id, { active: event.currentTarget.checked })}
                type="checkbox"
              />
            </td>
            <td>
              <input
                className="table-input"
                defaultValue={payment.name}
                onBlur={(event) => onUpdate(payment.id, { name: normalizeLabel(event.currentTarget.value) || payment.name })}
              />
            </td>
            <td>
              <select
                className="table-input"
                defaultValue={payment.type}
                onChange={(event) => onUpdate(payment.id, { type: event.currentTarget.value as TransactionType })}
              >
                {transactionTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </td>
            <td>
              <input
                className="table-input"
                defaultValue={payment.category}
                onBlur={(event) => onUpdate(payment.id, { category: normalizeLabel(event.currentTarget.value) || payment.category })}
              />
            </td>
            <td>
              <input
                className="table-input number"
                defaultValue={payment.amount}
                inputMode="decimal"
                onBlur={(event) => onUpdate(payment.id, { amount: toNumber(event.currentTarget.value) })}
              />
            </td>
            <td>
              <input
                className="table-input number"
                defaultValue={payment.dueDay}
                max="31"
                min="1"
                onBlur={(event) => onUpdate(payment.id, { dueDay: clampDueDay(toNumber(event.currentTarget.value)) })}
                type="number"
              />
            </td>
            <td>
              <IconButton label="Delete recurring payment" onClick={() => onRemove(payment.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function DataTable({ children }: { children: React.ReactNode }) {
  return <div className="table-wrap"><table>{children}</table></div>;
}

function EmptyTable({ message }: { message: string }) {
  return <div className="empty-state">{message}</div>;
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className="icon-button" onClick={onClick} title={label} type="button">
      <Trash2 size={16} />
    </button>
  );
}
