import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Circle,
  CreditCard,
  Download,
  Forward,
  Landmark,
  LayoutDashboard,
  Plus,
  ReceiptText,
  Scale,
  Settings,
  Sparkles,
  Smartphone,
  Tags,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, normalizeLabel, parseCsv, toCsv, toNumber, todayIso } from "./format";
import {
  createBudget,
  createCategory,
  createDebt,
  createRecurringPayment,
  createSavingsAccount,
  createTransaction,
} from "./storage";
import { repository } from "./persistence";
import type { Budget, Category, Debt, FinanceState, RecurringPayment, SavingsAccount, Transaction, TransactionType } from "./types";
import {
  budgetKey,
  applyCreditCardPayment,
  applyDebtPayment,
  applyTransactionToSavingsAccounts,
  buildBudgetProgress,
  buildCategoryUsage,
  buildCreditCardActivity,
  buildDebtOverview,
  buildForecast,
  buildHealthIssues,
  buildReport,
  buildReportComparison,
  buildTransactionQuickPicks,
  clampDueDay,
  creditCardBalance,
  debtPayoffMonths,
  effectiveDebtBalance,
  isCreditCard,
  coerceFinanceState,
  createEmptyState,
  createSampleState,
  categoryKey,
  debtKey,
  filterTransactions,
  importMessage,
  parseBudgetRow,
  parseCategoryRow,
  parseDebtRow,
  parseRecurringPaymentRow,
  parseSavingsRow,
  parseTransactionRow,
  periodMonthLength,
  previousReportMonth,
  recurringPaymentKey,
  reportPeriods,
  savingsKey,
  sortTransactions,
  transactionKey,
  transactionFromDebtPayment,
  transactionFromRecurringPayment,
  uniqueSorted,
} from "./finance";
import type { BudgetProgress, CategoryUsage, DebtOverview, ForecastData, HealthIssue, ReportComparison, ReportData, ReportPeriod, TransactionQuickPick } from "./finance";

type Section = "past" | "current" | "future" | "settings";
type CurrentSub = "overview" | "transactions" | "budgets" | "categories";
type SettingsSub = "savings" | "debts" | "backup" | "health" | "install";
type CsvKind = "transactions" | "savings" | "debts" | "recurring" | "budgets" | "categories";
type NavigateFn = (section: Section, sub?: CurrentSub | SettingsSub) => void;
type BackupMeta = {
  lastExportAt: string;
};
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const transactionTypes: TransactionType[] = ["Gasto", "Ingreso", "Ahorro"];
// New transactions are only income or expense; wallet moves are transfers we
// don't log. "Ahorro" stays in transactionTypes so historical rows still edit.
const transactionEntryTypes: TransactionType[] = ["Gasto", "Ingreso"];
// Golden chart family: gold anchor, then tonal steps + one neutral so
// multi-series charts stay readable without leaving the palette.
const chartColors = ["#FFC212", "#D99E0B", "#8C6A10", "#FFDD7A", "#9A9AA5", "#F0F0F3"];
const chartGold = "#FFC212";
const backupMetaKey = "lukmanage-backup-meta";

function colorForTransactionType(type: TransactionType) {
  if (type === "Ingreso") return "#57B981";
  if (type === "Ahorro") return "#7AA2E3";
  return "#FFC212";
}

function loadBackupMeta(): BackupMeta {
  if (typeof window === "undefined") return { lastExportAt: "" };
  try {
    return { lastExportAt: JSON.parse(window.localStorage.getItem(backupMetaKey) || "{}").lastExportAt || "" };
  } catch {
    return { lastExportAt: "" };
  }
}

function saveBackupMeta(meta: BackupMeta) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(backupMetaKey, JSON.stringify(meta));
  } catch {
    // Backup metadata is helpful, not required for the finance records.
  }
}

function setFormFieldValue(form: HTMLFormElement, name: string, value: string | number) {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return;
  field.value = String(value);
}

function focusFormField(form: HTMLFormElement, name: string, select = false) {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return;
  field.focus();
  if (select && field instanceof HTMLInputElement) field.select();
}

function isAppStandalone() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export function App() {
  const [activeSection, setActiveSection] = useState<Section>("current");
  const [currentSub, setCurrentSub] = useState<CurrentSub>("overview");
  const [settingsSub, setSettingsSub] = useState<SettingsSub>("savings");
  const [importSummary, setImportSummary] = useState("");
  const [reportMonth, setReportMonth] = useState(todayIso().slice(0, 7));
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("month");
  const [state, setState] = useState<FinanceState>(() => createEmptyState());
  const [backupMeta, setBackupMeta] = useState<BackupMeta>(() => loadBackupMeta());
  const [loaded, setLoaded] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(() => isAppStandalone());
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);

  const navigate: NavigateFn = (section, sub) => {
    setActiveSection(section);
    if (section === "current" && sub) setCurrentSub(sub as CurrentSub);
    if (section === "settings" && sub) setSettingsSub(sub as SettingsSub);
  };

  useEffect(() => {
    let cancelled = false;
    repository
      .load()
      .then((persisted) => {
        if (!cancelled) setState(persisted);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Don't persist until the initial load has populated state, or we'd
    // overwrite stored data with the empty bootstrap state.
    if (!loaded) return;
    void repository.save(state);
  }, [state, loaded]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setInstallPrompt(null);
    };
    const syncOnlineStatus = () => setIsOnline(navigator.onLine);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("online", syncOnlineStatus);
    window.addEventListener("offline", syncOnlineStatus);
    setIsStandalone(isAppStandalone());

    if ("serviceWorker" in navigator) {
      if (navigator.serviceWorker.controller) setServiceWorkerReady(true);
      void navigator.serviceWorker.ready.then(() => setServiceWorkerReady(true));
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("online", syncOnlineStatus);
      window.removeEventListener("offline", syncOnlineStatus);
    };
  }, []);

  const totals = useMemo(() => {
    const totalSavings = state.savingsAccounts.reduce((sum, account) => sum + account.balance, 0);
    const totalDebt = state.debts.reduce((sum, debt) => sum + effectiveDebtBalance(debt, state.transactions), 0);
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
    const categories = uniqueSorted([
      ...state.categories.map((category) => category.name),
      ...state.transactions.map((transaction) => transaction.categoria),
      ...state.budgets.map((budget) => budget.category),
      ...state.recurringPayments.map((payment) => payment.category),
    ]);
    const subcategories = uniqueSorted(state.transactions.map((transaction) => transaction.subcategoria));
    const descriptions = uniqueSorted(state.transactions.map((transaction) => transaction.descripcion));

    return { categories, descriptions, subcategories };
  }, [state.budgets, state.categories, state.recurringPayments, state.transactions]);

  const report = useMemo(
    () => buildReport(state.transactions, reportMonth, reportPeriod, state.categories),
    [reportMonth, reportPeriod, state.categories, state.transactions],
  );
  const previousReport = useMemo(
    () => buildReport(state.transactions, previousReportMonth(reportMonth, reportPeriod), reportPeriod, state.categories),
    [reportMonth, reportPeriod, state.categories, state.transactions],
  );
  const reportComparison = useMemo(
    () => buildReportComparison(report, previousReport, periodMonthLength(reportPeriod)),
    [previousReport, report, reportPeriod],
  );
  const currentMonthReport = useMemo(
    () => buildReport(state.transactions, todayIso().slice(0, 7), "month", state.categories),
    [state.categories, state.transactions],
  );
  const forecast = useMemo(() => buildForecast(state), [state]);
  const debtOverview = useMemo(() => buildDebtOverview(state.debts, state.transactions), [state.debts, state.transactions]);
  const budgetProgress = useMemo(
    () => buildBudgetProgress(state.transactions, state.budgets, todayIso().slice(0, 7)),
    [state.budgets, state.transactions],
  );
  const categoryUsage = useMemo(() => buildCategoryUsage(state), [state]);
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

    const asCreditCard = form.get("isCreditCard") === "on";

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
          ...(asCreditCard
            ? {
                isCreditCard: true,
                linkedCategory: normalizeLabel(form.get("linkedCategory")) || "TC",
                cutoffDay: clampDueDay(toNumber(form.get("cutoffDay"))),
                payments: [],
              }
            : {}),
        }),
      ],
    }));
    event.currentTarget.reset();
  }

  function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const fecha = String(form.get("fecha") || todayIso());
    const tipo = String(form.get("tipo") || "Gasto") as TransactionType;
    const categoria = normalizeLabel(form.get("categoria"));
    const subcategoria = normalizeLabel(form.get("subcategoria"));
    const descripcion = normalizeLabel(form.get("descripcion"));
    if (!categoria || !descripcion) return;

    setState((current) => {
      const transaction = createTransaction({
        fecha,
        gastoIngresoAhorro: tipo,
        categoria,
        subcategoria,
        descripcion,
        monto: toNumber(form.get("monto")),
      });

      return {
        ...current,
        savingsAccounts: applyTransactionToSavingsAccounts(current.savingsAccounts, transaction),
        transactions: [transaction, ...current.transactions],
      };
    });

    const keepFastFields = form.get("keepFastFields") === "on";
    formElement.reset();
    setFormFieldValue(formElement, "fecha", keepFastFields ? fecha : todayIso());
    if (keepFastFields) {
      setFormFieldValue(formElement, "tipo", tipo);
      setFormFieldValue(formElement, "categoria", categoria);
      setFormFieldValue(formElement, "subcategoria", subcategoria);
      focusFormField(formElement, "descripcion");
      return;
    }
    focusFormField(formElement, "categoria");
  }

  function addBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const category = normalizeLabel(form.get("category"));
    if (!category) return;

    setState((current) => {
      const nextBudget = createBudget({ category, monthlyLimit: toNumber(form.get("monthlyLimit")) });
      const existingKey = budgetKey(nextBudget);
      const budgets = current.budgets.some((budget) => budgetKey(budget) === existingKey)
        ? current.budgets.map((budget) => (budgetKey(budget) === existingKey ? { ...budget, ...nextBudget, id: budget.id } : budget))
        : [...current.budgets, nextBudget];

      return { ...current, budgets };
    });
    event.currentTarget.reset();
  }

  function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = normalizeLabel(form.get("name"));
    if (!name) return;

    setState((current) => {
      const nextCategory = createCategory({
        color: String(form.get("color") || "#D4AF37"),
        name,
        type: String(form.get("type") || "Gasto") as TransactionType,
      });
      const existingKey = categoryKey(nextCategory);
      const categories = current.categories.some((category) => categoryKey(category) === existingKey)
        ? current.categories.map((category) =>
            categoryKey(category) === existingKey ? { ...category, ...nextCategory, id: category.id } : category,
          )
        : [...current.categories, nextCategory];

      return { ...current, categories };
    });
    event.currentTarget.reset();
  }

  function addManagedCategory(name: string, type: TransactionType) {
    const normalizedName = normalizeLabel(name);
    if (!normalizedName) return;

    setState((current) => {
      const nextCategory = createCategory({
        color: colorForTransactionType(type),
        name: normalizedName,
        type,
      });
      const existingKey = categoryKey(nextCategory);
      if (current.categories.some((category) => categoryKey(category) === existingKey)) return current;

      return { ...current, categories: [...current.categories, nextCategory] };
    });
  }

  function addMissingCategories(missingCategories: CategoryUsage[]) {
    if (!missingCategories.length) return;

    setState((current) => {
      const existingKeys = new Set(current.categories.map(categoryKey));
      const categoriesToAdd = missingCategories
        .filter((category) => !existingKeys.has(category.key))
        .map((category) =>
          createCategory({
            color: colorForTransactionType(category.suggestedType),
            name: category.name,
            type: category.suggestedType,
          }),
        );

      if (!categoriesToAdd.length) return current;
      return { ...current, categories: [...current.categories, ...categoriesToAdd] };
    });
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

  function postDebtPayment(id: string) {
    const debt = state.debts.find((item) => item.id === id);
    if (!debt || debt.monthlyPayment <= 0 || debt.currentBalance <= 0) return;

    const transaction = transactionFromDebtPayment(debt, todayIso());
    const alreadyExists = state.transactions.some((item) => transactionKey(item) === transactionKey(transaction));
    if (alreadyExists && !window.confirm("This debt payment already exists as a transaction for today. Post another copy?")) return;

    setState((current) => ({
      ...current,
      debts: current.debts.map((item) => (item.id === id ? applyDebtPayment(item) : item)),
      transactions: [transaction, ...current.transactions],
    }));
    setActiveSection("current");
    setCurrentSub("transactions");
  }

  function payCreditCard(id: string, fromAccountId?: string) {
    const debt = state.debts.find((item) => item.id === id);
    if (!debt || !isCreditCard(debt)) return;

    const amount = creditCardBalance(debt, state.transactions);
    if (amount <= 0) {
      window.alert("This card has no balance to pay right now.");
      return;
    }

    const account = fromAccountId ? state.savingsAccounts.find((item) => item.id === fromAccountId) : undefined;
    const suffix = account ? ` from ${account.bankName}` : "";
    if (!window.confirm(`Pay ${formatCurrency(amount)} toward ${debt.name}${suffix}? This clears the card balance.`)) return;

    setState((current) => ({
      ...current,
      debts: current.debts.map((item) =>
        item.id === id ? applyCreditCardPayment(item, amount, todayIso(), fromAccountId).debt : item,
      ),
      savingsAccounts: account
        ? current.savingsAccounts.map((item) =>
            item.id === fromAccountId ? { ...item, balance: item.balance - amount } : item,
          )
        : current.savingsAccounts,
    }));
  }

  function removeTransaction(id: string) {
    setState((current) => ({
      ...current,
      transactions: current.transactions.filter((transaction) => transaction.id !== id),
    }));
  }

  function removeBudget(id: string) {
    setState((current) => ({
      ...current,
      budgets: current.budgets.filter((budget) => budget.id !== id),
    }));
  }

  function removeCategory(id: string) {
    setState((current) => ({
      ...current,
      categories: current.categories.filter((category) => category.id !== id),
    }));
  }

  function updateBudget(id: string, patch: Partial<Budget>) {
    setState((current) => ({
      ...current,
      budgets: current.budgets.map((budget) => (budget.id === id ? { ...budget, ...patch } : budget)),
    }));
  }

  function updateCategory(id: string, patch: Partial<Category>) {
    setState((current) => ({
      ...current,
      categories: current.categories.map((category) => (category.id === id ? { ...category, ...patch } : category)),
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

  function postRecurringPayment(id: string) {
    const payment = state.recurringPayments.find((item) => item.id === id);
    if (!payment) return;

    const transaction = transactionFromRecurringPayment(payment, todayIso());
    const alreadyExists = state.transactions.some((item) => transactionKey(item) === transactionKey(transaction));
    if (alreadyExists && !window.confirm("This recurring item already exists as a transaction for today. Post another copy?")) return;

    setState((current) => ({
      ...current,
      transactions: [transaction, ...current.transactions],
    }));
    setActiveSection("current");
    setCurrentSub("transactions");
  }

  function loadSampleData() {
    const hasData =
      state.savingsAccounts.length ||
      state.debts.length ||
      state.transactions.length ||
      state.budgets.length ||
      state.categories.length ||
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

  async function installApp() {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setIsStandalone(true);
  }

  function exportBackup() {
    const exportedAt = new Date().toISOString();
    const payload = JSON.stringify({ exportedAt, version: 1, state }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `money-manager-backup-${todayIso()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    const nextMeta = { lastExportAt: exportedAt };
    setBackupMeta(nextMeta);
    saveBackupMeta(nextMeta);
    setImportSummary(`Backup downloaded at ${formatDateTime(exportedAt)}.`);
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

    if (kind === "budgets") {
      downloadFile(
        `budgets-${todayIso()}.csv`,
        toCsv([
          ["category", "monthly_limit"],
          ...state.budgets.map((budget) => [budget.category, budget.monthlyLimit]),
        ]),
        "text/csv;charset=utf-8",
      );
      return;
    }

    if (kind === "categories") {
      downloadFile(
        `categories-${todayIso()}.csv`,
        toCsv([
          ["name", "type", "color"],
          ...state.categories.map((category) => [category.name, category.type, category.color]),
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

      if (kind === "budgets") {
        const parsed = body
          .map((row) => parseBudgetRow(header, row))
          .filter((budget): budget is Budget => Boolean(budget));
        const existingKeys = new Set(state.budgets.map(budgetKey));
        const imported = parsed.filter((budget) => {
          const key = budgetKey(budget);
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });

        setState((current) => ({ ...current, budgets: [...current.budgets, ...imported] }));
        setImportSummary(importMessage("budgets", imported.length, parsed.length - imported.length, body.length - parsed.length));
        return;
      }

      if (kind === "categories") {
        const parsed = body
          .map((row) => parseCategoryRow(header, row))
          .filter((category): category is Category => Boolean(category));
        const existingKeys = new Set(state.categories.map(categoryKey));
        const imported = parsed.filter((category) => {
          const key = categoryKey(category);
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });

        setState((current) => ({ ...current, categories: [...current.categories, ...imported] }));
        setImportSummary(importMessage("categories", imported.length, parsed.length - imported.length, body.length - parsed.length));
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
      const counts = financeRecordCounts(nextState);
      const message = `Restore this backup and replace current local data?\n\nBackup contains ${counts.transactions} transactions, ${counts.savingsAccounts} savings banks, ${counts.debts} debts, ${counts.budgets} budgets, ${counts.categories} categories, and ${counts.recurringPayments} recurring items.`;
      if (!window.confirm(message)) return;

      setState(nextState);
      setImportSummary(`Backup restored from ${file.name}.`);
    } catch {
      setImportSummary("The selected backup file could not be read.");
    } finally {
      event.target.value = "";
    }
  }

  if (!loaded) {
    return (
      <main className="app-shell">
        <div className="app-loading">Loading your data…</div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <nav className="tabs primary-tabs" aria-label="Primary">
          <TabButton icon={<CalendarRange size={18} />} label="Past" tab="past" active={activeSection} onClick={setActiveSection} />
          <TabButton icon={<LayoutDashboard size={18} />} label="Current Month" tab="current" active={activeSection} onClick={setActiveSection} />
          <TabButton icon={<Forward size={18} />} label="Future" tab="future" active={activeSection} onClick={setActiveSection} />
        </nav>
        <nav className="tabs settings-tab" aria-label="Settings">
          <TabButton
            icon={<Settings size={18} />}
            iconOnly
            label="Settings"
            tab="settings"
            active={activeSection}
            onClick={setActiveSection}
            badge={healthIssues.length}
          />
        </nav>
      </header>

      <section className="content">
        {activeSection === "current" && (
          <>
            <nav className="subnav" aria-label="Current month sections">
              <TabButton icon={<LayoutDashboard size={16} />} label="Overview" tab="overview" active={currentSub} onClick={setCurrentSub} />
              <TabButton icon={<ReceiptText size={16} />} label="Transactions" tab="transactions" active={currentSub} onClick={setCurrentSub} />
              <TabButton icon={<BarChart3 size={16} />} label="Budgets" tab="budgets" active={currentSub} onClick={setCurrentSub} />
              <TabButton icon={<Tags size={16} />} label="Categories" tab="categories" active={currentSub} onClick={setCurrentSub} />
            </nav>
            {currentSub === "overview" && (
              <Dashboard
                budgetProgress={budgetProgress}
                savingsAccounts={state.savingsAccounts}
                debts={state.debts}
                currentMonthReport={currentMonthReport}
                transactions={state.transactions}
                totals={totals}
                healthIssues={healthIssues}
                onNavigate={navigate}
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
            {currentSub === "budgets" && (
              <BudgetsView
                budgetProgress={budgetProgress}
                budgets={state.budgets}
                onAdd={addBudget}
                onRemove={removeBudget}
                onUpdate={updateBudget}
                suggestions={suggestions}
              />
            )}
            {currentSub === "categories" && (
              <CategoriesView
                categories={state.categories}
                categoryUsage={categoryUsage}
                onAdd={addCategory}
                onAddAllMissing={addMissingCategories}
                onAddMissing={addManagedCategory}
                onRemove={removeCategory}
                onUpdate={updateCategory}
              />
            )}
          </>
        )}

      {activeSection === "past" && (
        <ReportsView
          comparison={reportComparison}
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
            onPostDebt={postDebtPayment}
            onPost={postRecurringPayment}
            onRemove={removeRecurringPayment}
            onUpdate={updateRecurringPayment}
            recurringPayments={state.recurringPayments}
            suggestions={suggestions}
          />
        )}

        {activeSection === "settings" && (
          <>
            <nav className="subnav" aria-label="Settings sections">
              <TabButton icon={<Landmark size={16} />} label="Savings" tab="savings" active={settingsSub} onClick={setSettingsSub} />
              <TabButton icon={<Scale size={16} />} label="Debts" tab="debts" active={settingsSub} onClick={setSettingsSub} />
              <TabButton icon={<Download size={16} />} label="Backup" tab="backup" active={settingsSub} onClick={setSettingsSub} />
              <TabButton icon={<AlertTriangle size={16} />} label="Health" tab="health" active={settingsSub} onClick={setSettingsSub} badge={healthIssues.length} />
              <TabButton icon={<Smartphone size={16} />} label="Install" tab="install" active={settingsSub} onClick={setSettingsSub} />
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
              <DebtsView
                accounts={state.savingsAccounts}
                debtOverview={debtOverview}
                debts={state.debts}
                onAdd={addDebt}
                onPayCard={payCreditCard}
                onPostPayment={postDebtPayment}
                onRemove={removeDebt}
                onUpdate={updateDebt}
                transactions={state.transactions}
              />
            )}
            {settingsSub === "backup" && (
              <BackupView
                backupMeta={backupMeta}
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
            {settingsSub === "health" && <HealthView issues={healthIssues} onNavigate={navigate} state={state} />}
            {settingsSub === "install" && (
              <InstallView
                canInstall={Boolean(installPrompt)}
                isOnline={isOnline}
                isStandalone={isStandalone}
                onInstall={installApp}
                serviceWorkerReady={serviceWorkerReady}
              />
            )}
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
  iconOnly = false,
  label,
  onClick,
  tab,
}: {
  active: T;
  badge?: number;
  icon: React.ReactNode;
  iconOnly?: boolean;
  label: string;
  onClick: (tab: T) => void;
  tab: T;
}) {
  return (
    <button
      aria-label={iconOnly ? label : undefined}
      aria-pressed={active === tab}
      className={`${active === tab ? "tab active" : "tab"}${iconOnly ? " icon-only" : ""}`}
      onClick={() => onClick(tab)}
      type="button"
    >
      {icon}
      {!iconOnly ? <span>{label}</span> : null}
      {badge ? <span className="tab-badge">{badge}</span> : null}
    </button>
  );
}

function Dashboard({
  budgetProgress,
  currentMonthReport,
  debts,
  healthIssues,
  onNavigate,
  savingsAccounts,
  totals,
  transactions,
}: {
  budgetProgress: BudgetProgress[];
  currentMonthReport: ReportData;
  debts: Debt[];
  healthIssues: HealthIssue[];
  onNavigate: NavigateFn;
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
  const setupItems: SetupItem[] = [
    {
      cta: "Add a bank",
      done: savingsAccounts.length > 0,
      label: "Add your savings banks",
      section: "settings",
      sub: "savings",
      value: `${savingsAccounts.length} bank${savingsAccounts.length === 1 ? "" : "s"}`,
    },
    {
      cta: "Add a debt",
      done: debts.length > 0,
      label: "Add debts if you have any",
      section: "settings",
      sub: "debts",
      value: `${debts.length} debt${debts.length === 1 ? "" : "s"}`,
    },
    {
      cta: "Add or import",
      done: transactions.length > 0,
      label: "Add or import transactions",
      section: "current",
      sub: "transactions",
      value: `${transactions.length} row${transactions.length === 1 ? "" : "s"}`,
    },
  ];
  const setupComplete = setupItems.every((item) => item.done);
  const isFirstRun = savingsAccounts.length === 0 && debts.length === 0 && transactions.length === 0 && budgetProgress.length === 0;
  const overBudgetCount = budgetProgress.filter((item) => item.status === "over").length;
  const nearBudgetCount = budgetProgress.filter((item) => item.status === "near").length;
  const averageBudgetUsed = budgetProgress.length
    ? Math.round(budgetProgress.reduce((sum, item) => sum + item.percentUsed, 0) / budgetProgress.length)
    : 0;
  const debtsForChart = debts.map((debt) => ({ ...debt, currentBalance: effectiveDebtBalance(debt, transactions) }));

  if (isFirstRun) {
    return <Welcome onNavigate={onNavigate} />;
  }

  return (
    <div className="stack">
      <Header eyebrow={null} title="Dashboard" subtitle="Your current position and this month's movement." />
      {!setupComplete ? <SetupChecklist items={setupItems} onNavigate={onNavigate} /> : null}
      <div className="metric-grid">
        <Metric label="Total saved" value={formatCurrency(totals.totalSavings)} tone="positive" />
        <Metric label="Total debt" value={formatCurrency(totals.totalDebt)} tone="negative" />
        <Metric label="Net position" value={formatCurrency(totals.netPosition)} tone={totals.netPosition >= 0 ? "positive" : "negative"} />
        <Metric
          label="Budget pressure"
          value={budgetProgress.length ? `${averageBudgetUsed}% used` : "No budgets"}
          tone={overBudgetCount ? "negative" : nearBudgetCount ? "neutral" : "positive"}
        />
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

      <ChartPanel title="Debt by name" empty={debts.length === 0}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={debtsForChart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Bar dataKey="currentBalance" fill={chartGold} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <div className="chart-grid">
        <ChartPanel title="Current month flow" empty={currentMonthReport.filteredTransactions.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={currentMonthFlowData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="value" fill={chartGold} radius={[6, 6, 0, 0]} />
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
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {currentMonthReport.categoryExpenses.map((category) => (
                  <Cell key={category.name} fill={category.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <BudgetSummary progress={budgetProgress} onNavigate={onNavigate} />

      <ChartPanel title="Lifetime transaction totals" empty={transactions.length === 0}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={lifetimeFlowData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Bar dataKey="value" fill={chartGold} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}

function BudgetSummary({ onNavigate, progress }: { onNavigate: NavigateFn; progress: BudgetProgress[] }) {
  if (!progress.length) {
    return (
      <section className="panel action-panel">
        <div className="panel-title">
          <BarChart3 size={18} />
          <h3>Budgets</h3>
        </div>
        <p className="panel-copy">Set category limits to see how this month is tracking before expenses surprise you.</p>
        <button className="secondary-button" onClick={() => onNavigate("current", "budgets")} type="button">
          Create budgets
        </button>
      </section>
    );
  }

  return (
    <section className="panel action-panel">
      <div className="section-subtitle">
        <h3>Budget progress</h3>
        <button className="secondary-button" onClick={() => onNavigate("current", "budgets")} type="button">
          Manage
        </button>
      </div>
      <div className="budget-list">
        {progress.slice(0, 4).map((item) => (
          <BudgetProgressItem item={item} key={item.budget.id} />
        ))}
      </div>
    </section>
  );
}

function BudgetProgressItem({ item }: { item: BudgetProgress }) {
  const cappedPercent = Math.min(item.percentUsed, 100);
  return (
    <article className={`budget-item ${item.status}`}>
      <div className="budget-item-header">
        <strong>{item.budget.category}</strong>
        <span>{item.percentUsed}%</span>
      </div>
      <div className="budget-bar" aria-label={`${item.budget.category} budget progress`}>
        <span style={{ width: `${cappedPercent}%` }} />
      </div>
      <div className="budget-item-footer">
        <span>{formatCurrency(item.spent)} spent</span>
        <span>{item.remaining >= 0 ? `${formatCurrency(item.remaining)} left` : `${formatCurrency(Math.abs(item.remaining))} over`}</span>
      </div>
    </article>
  );
}

type SetupItem = {
  cta: string;
  done: boolean;
  label: string;
  section: Section;
  sub?: CurrentSub | SettingsSub;
  value: string;
};

function SetupChecklist({ items, onNavigate }: { items: SetupItem[]; onNavigate: NavigateFn }) {
  return (
    <section className="setup-panel">
      <div className="panel-title">
        <CheckCircle2 size={18} />
        <h3>Setup checklist</h3>
      </div>
      <div className="setup-list">
        {items.map((item) =>
          item.done ? (
            <div className="setup-item done" key={item.label}>
              <CheckCircle2 size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ) : (
            <button
              className="setup-item actionable"
              key={item.label}
              onClick={() => onNavigate(item.section, item.sub)}
              type="button"
            >
              <Circle size={18} />
              <span>{item.label}</span>
              <strong>
                {item.cta}
                <ArrowRight size={14} />
              </strong>
            </button>
          ),
        )}
      </div>
    </section>
  );
}

function Welcome({ onNavigate }: { onNavigate: NavigateFn }) {
  return (
    <div className="stack">
      <section className="welcome-panel">
        <div className="welcome-badge">
          <Sparkles size={20} />
        </div>
        <h2>Welcome to Money Manager</h2>
        <p>
          Track your savings, debts, and monthly cash flow — everything stays local on this device. Start with one of
          these:
        </p>
        <div className="welcome-actions">
          <button className="welcome-action primary" onClick={() => onNavigate("settings", "backup")} type="button">
            <Upload size={18} />
            <span>
              <strong>Import my data</strong>
              <small>Bring in a CSV or a JSON backup</small>
            </span>
            <ArrowRight size={16} />
          </button>
          <button className="welcome-action" onClick={() => onNavigate("settings", "savings")} type="button">
            <Landmark size={18} />
            <span>
              <strong>Add a savings bank</strong>
              <small>Record where your money is saved</small>
            </span>
            <ArrowRight size={16} />
          </button>
          <button className="welcome-action" onClick={() => onNavigate("current", "transactions")} type="button">
            <ReceiptText size={18} />
            <span>
              <strong>Add a transaction</strong>
              <small>Log an income, expense, or saving</small>
            </span>
            <ArrowRight size={16} />
          </button>
        </div>
        <p className="welcome-hint">
          Just exploring? Load sample data from <strong>Settings → Backup</strong> to see the app with numbers in it.
        </p>
      </section>
    </div>
  );
}

function BudgetsView({
  budgetProgress,
  budgets,
  onAdd,
  onRemove,
  onUpdate,
  suggestions,
}: {
  budgetProgress: BudgetProgress[];
  budgets: Budget[];
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Budget>) => void;
  suggestions: {
    categories: string[];
    descriptions: string[];
    subcategories: string[];
  };
}) {
  return (
    <div className="stack">
      <Header eyebrow="Phase 2" title="Budgets" subtitle="Set monthly category limits and watch current-month progress." />
      <form className="entry-form" onSubmit={onAdd}>
        <label>
          Category
          <input list="budget-category-options" name="category" placeholder="Personal" required />
        </label>
        <label>
          Monthly limit
          <input name="monthlyLimit" inputMode="decimal" placeholder="700000" required />
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          Save budget
        </button>
        <Datalist id="budget-category-options" options={suggestions.categories} />
      </form>

      <section className="panel action-panel">
        <div className="panel-title">
          <BarChart3 size={18} />
          <h3>This month</h3>
        </div>
        {budgetProgress.length ? (
          <div className="budget-list">
            {budgetProgress.map((item) => (
              <BudgetProgressItem item={item} key={item.budget.id} />
            ))}
          </div>
        ) : (
          <div className="empty-state">Create a budget to track spending against it.</div>
        )}
      </section>

      <BudgetsTable budgets={budgets} onRemove={onRemove} onUpdate={onUpdate} />
    </div>
  );
}

function CategoriesView({
  categories,
  categoryUsage,
  onAdd,
  onAddAllMissing,
  onAddMissing,
  onRemove,
  onUpdate,
}: {
  categories: Category[];
  categoryUsage: CategoryUsage[];
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onAddAllMissing: (categories: CategoryUsage[]) => void;
  onAddMissing: (name: string, type: TransactionType) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Category>) => void;
}) {
  const missingCategories = categoryUsage.filter((category) => !category.managed);
  const managedUsedCount = categoryUsage.filter((category) => category.managed).length;

  return (
    <div className="stack">
      <Header eyebrow="Phase 2" title="Categories" subtitle="The official category list for transactions, budgets, reports, and cards." />
      <form className="entry-form category-form" onSubmit={onAdd}>
        <label>
          Name
          <input name="name" placeholder="Personal" required />
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
          Color
          <span className="color-field">
            <input aria-label="Category color" className="color-input" defaultValue="#D4AF37" name="color" type="color" />
          </span>
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          Save category
        </button>
      </form>

      <section className="panel category-cleanup">
        <div className="panel-title">
          <Tags size={18} />
          <h3>Used categories</h3>
        </div>
        <div className="metric-grid compact-metrics">
          <Metric label="Managed" value={categories.length.toString()} tone="positive" />
          <Metric label="Used" value={categoryUsage.length.toString()} tone="neutral" />
          <Metric label="Matched" value={managedUsedCount.toString()} tone="positive" />
          <Metric label="Missing" value={missingCategories.length.toString()} tone={missingCategories.length ? "negative" : "positive"} />
        </div>
        {missingCategories.length ? (
          <>
            <div className="panel-actions">
              <button className="secondary-button" onClick={() => onAddAllMissing(missingCategories)} type="button">
                <Plus size={18} />
                Add all missing
              </button>
            </div>
            <div className="category-usage-list">
              {missingCategories.map((category) => (
                <article className="category-usage-item" key={category.key}>
                  <div>
                    <strong>{category.name}</strong>
                    <span>{categoryUsageText(category)}</span>
                  </div>
                  <em>{category.suggestedType}</em>
                  <button
                    className="secondary-button compact-action"
                    onClick={() => onAddMissing(category.name, category.suggestedType)}
                    type="button"
                  >
                    Add
                  </button>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            {categoryUsage.length ? "All used categories are managed." : "Add transactions to see category usage here."}
          </div>
        )}
      </section>

      <CategoriesTable categories={categories} onRemove={onRemove} onUpdate={onUpdate} />
    </div>
  );
}

function categoryUsageText(category: CategoryUsage) {
  return [
    category.transactionCount ? `${category.transactionCount} transaction${category.transactionCount === 1 ? "" : "s"}` : "",
    category.budgetCount ? `${category.budgetCount} budget${category.budgetCount === 1 ? "" : "s"}` : "",
    category.recurringCount ? `${category.recurringCount} recurring` : "",
    category.creditCardCount ? `${category.creditCardCount} card${category.creditCardCount === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
}

function formatPayoffMonths(months: number | null) {
  if (months == null) return "Set payment";
  if (months === 0) return "Paid";
  return `${months} mo`;
}

function formatSignedCurrency(value: number) {
  if (value === 0) return formatCurrency(0);
  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

function formatDateTime(value: string) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function financeRecordCounts(state: FinanceState) {
  return {
    budgets: state.budgets.length,
    categories: state.categories.length,
    debts: state.debts.length,
    recurringPayments: state.recurringPayments.length,
    savingsAccounts: state.savingsAccounts.length,
    transactions: state.transactions.length,
  };
}

function totalFinanceRecords(state: FinanceState) {
  const counts = financeRecordCounts(state);
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
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
  accounts,
  debtOverview,
  debts,
  onAdd,
  onPayCard,
  onPostPayment,
  onRemove,
  onUpdate,
  transactions,
}: {
  accounts: SavingsAccount[];
  debtOverview: DebtOverview;
  debts: Debt[];
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onPayCard: (id: string, fromAccountId?: string) => void;
  onPostPayment: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Debt>) => void;
  transactions: Transaction[];
}) {
  const [creditCardMode, setCreditCardMode] = useState(false);
  const creditCards = debts.filter((debt) => isCreditCard(debt));
  const regularDebts = debts.filter((debt) => !isCreditCard(debt));

  return (
    <div className="stack">
      <Header title="Debts" subtitle="Track what you owe, plus credit cards that float with spending." />
      <section className="panel debt-clarity">
        <div className="panel-title">
          <Scale size={18} />
          <h3>Debt picture</h3>
        </div>
        <div className="metric-grid">
          <Metric label="Regular debt" value={formatCurrency(debtOverview.regularDebtTotal)} tone={debtOverview.regularDebtTotal ? "negative" : "positive"} />
          <Metric label="Credit cards" value={formatCurrency(debtOverview.creditCardTotal)} tone={debtOverview.creditCardTotal ? "negative" : "positive"} />
          <Metric label="Next debt payments" value={formatCurrency(debtOverview.monthlyDebtPayments)} tone="neutral" />
          <Metric
            label="Longest payoff"
            value={debtOverview.estimatedPayoffMonths == null ? "Missing payment" : `${debtOverview.estimatedPayoffMonths} mo`}
            tone={debtOverview.estimatedPayoffMonths == null && debtOverview.regularDebtTotal ? "negative" : "neutral"}
          />
        </div>
        <p className="panel-copy">
          Credit card purchases increase the card balance through their linked category. Paying the card only clears that balance and does not add another expense.
        </p>
      </section>
      <form className="entry-form debt-form" onSubmit={onAdd}>
        <label>
          Debt name
          <input name="name" placeholder={creditCardMode ? "Credit card" : "Personal loan"} required />
        </label>
        {creditCardMode ? (
          <>
            <label>
              Linked category
              <input name="linkedCategory" defaultValue="TC" placeholder="TC" />
            </label>
            <label>
              Statement cutoff day
              <input name="cutoffDay" inputMode="numeric" defaultValue="5" placeholder="5" />
            </label>
          </>
        ) : (
          <>
            <label>
              Current balance
              <input name="currentBalance" inputMode="decimal" placeholder="1200000" />
            </label>
            <label>
              Monthly payment
              <input name="monthlyPayment" inputMode="decimal" placeholder="400000" />
            </label>
            <label>
              Due date
              <input name="dueDate" type="date" />
            </label>
          </>
        )}
        <label className="wide">
          Notes
          <input name="notes" placeholder="Optional" />
        </label>
        <label className="checkbox-label">
          <input
            checked={creditCardMode}
            name="isCreditCard"
            onChange={(event) => setCreditCardMode(event.currentTarget.checked)}
            type="checkbox"
          />
          This is a credit card (balance floats with linked-category spending)
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          Add {creditCardMode ? "credit card" : "debt"}
        </button>
      </form>

      {creditCards.map((debt) => (
        <CreditCardPanel
          accounts={accounts}
          debt={debt}
          key={debt.id}
          onPay={onPayCard}
          onRemove={onRemove}
          transactions={transactions}
        />
      ))}

      <DebtsTable debts={regularDebts} onPostPayment={onPostPayment} onRemove={onRemove} onUpdate={onUpdate} />
    </div>
  );
}

function CreditCardPanel({
  accounts,
  debt,
  onPay,
  onRemove,
  transactions,
}: {
  accounts: SavingsAccount[];
  debt: Debt;
  onPay: (id: string, fromAccountId?: string) => void;
  onRemove: (id: string) => void;
  transactions: Transaction[];
}) {
  const [fromAccountId, setFromAccountId] = useState("");
  const activity = buildCreditCardActivity(debt, transactions);
  const { balance, statement } = activity;

  return (
    <section className="panel credit-card-panel">
      <div className="panel-title">
        <CreditCard size={18} />
        <h3>{debt.name}</h3>
        <IconButton label="Delete card" onClick={() => onRemove(debt.id)} />
      </div>
      <div className="metric-grid">
        <Metric label="Current balance" value={formatCurrency(balance)} tone={balance > 0 ? "negative" : "positive"} />
        <Metric label="Charged to card" value={formatCurrency(activity.charged)} tone="negative" />
        <Metric label="Card payments" value={formatCurrency(activity.paid)} tone="positive" />
        <Metric
          label={statement.closed ? `Statement due (closed ${statement.cutoffDate})` : "Statement (cycle open)"}
          value={formatCurrency(statement.amountDue)}
          tone={statement.amountDue > 0 ? "negative" : "positive"}
        />
      </div>
      <p className="credit-card-hint">
        Every <strong>Gasto</strong> in category <strong>{debt.linkedCategory}</strong> adds here automatically. Paying the card reduces
        this card balance only; it is not posted as another expense.
      </p>
      <div className="card-activity-line">
        <span>{activity.chargeCount} charge{activity.chargeCount === 1 ? "" : "s"} linked</span>
        <span>Last charge: {activity.lastChargeDate || "None"}</span>
        <span>Cutoff day: {debt.cutoffDay || 1}</span>
      </div>
      <div className="credit-card-actions">
        <label>
          Pay from
          <select onChange={(event) => setFromAccountId(event.currentTarget.value)} value={fromAccountId}>
            <option value="">Don&apos;t deduct</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.bankName}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button"
          disabled={balance <= 0}
          onClick={() => onPay(debt.id, fromAccountId || undefined)}
          type="button"
        >
          <CheckCircle2 size={18} />
          Pay {formatCurrency(balance)}
        </button>
      </div>
    </section>
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [keyword, setKeyword] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const quickPicks = useMemo(() => buildTransactionQuickPicks(transactions), [transactions]);
  const filteredTransactions = useMemo(
    () => sortTransactions(filterTransactions(transactions, { dateFrom, dateTo, keyword }), "date-desc"),
    [dateFrom, dateTo, keyword, transactions],
  );
  const applyQuickPick = (pick: TransactionQuickPick) => {
    const form = formRef.current;
    if (!form) return;
    setFormFieldValue(form, "fecha", todayIso());
    setFormFieldValue(form, "tipo", pick.type);
    setFormFieldValue(form, "categoria", pick.category);
    setFormFieldValue(form, "subcategoria", pick.subcategory);
    setFormFieldValue(form, "descripcion", pick.description);
    setFormFieldValue(form, "monto", pick.amount);
    focusFormField(form, "monto", true);
  };

  return (
    <div className="stack">
      {quickPicks.length ? (
        <section className="quick-entry">
          <div className="panel-title">
            <ReceiptText size={18} />
            <h3>Recent</h3>
          </div>
          <div className="quick-pick-list">
            {quickPicks.map((pick) => (
              <button className="quick-pick" key={pick.id} onClick={() => applyQuickPick(pick)} type="button">
                <span>
                  <strong>{pick.description}</strong>
                  <small>
                    {pick.type} / {pick.category}
                    {pick.subcategory ? ` / ${pick.subcategory}` : ""}
                  </small>
                </span>
                <span className="quick-pick-meta">
                  <em>{formatCurrency(pick.amount)}</em>
                  {pick.count > 1 ? <small>{pick.count}x</small> : null}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <form className="entry-form transaction-form" onSubmit={onAdd} ref={formRef}>
        <label>
          Fecha
          <input defaultValue={todayIso()} name="fecha" type="date" required />
        </label>
        <label>
          Gasto/Ingreso
          <select name="tipo">
            {transactionEntryTypes.map((type) => (
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
        <label className="checkbox-label transaction-keep">
          <input defaultChecked name="keepFastFields" type="checkbox" />
          Keep date, type, category
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          Add row
        </button>
        <Datalist id="category-options" options={suggestions.categories} />
        <Datalist id="subcategory-options" options={suggestions.subcategories} />
        <Datalist id="description-options" options={suggestions.descriptions} />
      </form>

      <section className="transaction-list-panel">
        <form className="transaction-search">
          <div className="date-search">
            <label>
              From
              <input onChange={(event) => setDateFrom(event.currentTarget.value)} type="date" value={dateFrom} />
            </label>
            <label>
              To
              <input onChange={(event) => setDateTo(event.currentTarget.value)} type="date" value={dateTo} />
            </label>
          </div>
          <label>
            Keyword
            <input
              onChange={(event) => setKeyword(event.currentTarget.value)}
              placeholder="Subcategory or description"
              value={keyword}
            />
          </label>
          <div className="filter-count">
            {filteredTransactions.length} of {transactions.length}
          </div>
        </form>
      </section>
      <TransactionsTable transactions={filteredTransactions} onRemove={onRemove} onUpdate={onUpdate} />
    </div>
  );
}

function ReportsView({
  comparison,
  month,
  onMonthChange,
  onPeriodChange,
  period,
  report,
}: {
  comparison: ReportComparison;
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
      <Header eyebrow={null} title="Reports" />
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

      <section className="panel report-review">
        <div className="panel-title">
          <Scale size={18} />
          <h3>Period review</h3>
        </div>
        <div className="metric-grid compact-metrics">
          <Metric label="Transactions" value={comparison.transactionCount.toString()} tone="neutral" />
          <Metric label="Avg monthly expenses" value={formatCurrency(comparison.averageMonthlyExpenses)} tone="negative" />
          <Metric label="Debt payments" value={formatCurrency(comparison.debtPayments)} tone="neutral" />
          <Metric label="Savings rate" value={`${comparison.savingsRate}%`} tone={comparison.savingsRate > 0 ? "positive" : "neutral"} />
        </div>
        <div className="insight-grid">
          <ReportInsight label="Top expense" value={comparison.topExpenseCategory ? `${comparison.topExpenseCategory.name} / ${formatCurrency(comparison.topExpenseCategory.value)}` : "No expenses"} />
          <ReportInsight label="Expenses vs previous" value={formatSignedCurrency(comparison.expenseChange)} tone={comparison.expenseChange <= 0 ? "positive" : "negative"} />
          <ReportInsight label="Income vs previous" value={formatSignedCurrency(comparison.incomeChange)} tone={comparison.incomeChange >= 0 ? "positive" : "negative"} />
          <ReportInsight label="Savings vs previous" value={formatSignedCurrency(comparison.savingsChange)} tone={comparison.savingsChange >= 0 ? "positive" : "negative"} />
          <ReportInsight label="Net flow vs previous" value={formatSignedCurrency(comparison.netFlowChange)} tone={comparison.netFlowChange >= 0 ? "positive" : "negative"} />
          <ReportInsight label="Compared with" value={comparison.previousLabel} />
        </div>
      </section>

      <div className="chart-grid">
        <ChartPanel title="Monthly trend" empty={report.filteredTransactions.length === 0}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={report.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="income" fill={chartColors[1]} name="Income" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expenses" fill={chartColors[2]} name="Expenses" radius={[6, 6, 0, 0]} />
              <Bar dataKey="savings" fill={chartColors[3]} name="Savings" radius={[6, 6, 0, 0]} />
              <Bar dataKey="netFlow" fill={chartColors[0]} name="Net flow" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Flow totals" empty={report.filteredTransactions.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={flowData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="value" fill={chartGold} radius={[6, 6, 0, 0]} />
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
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {report.categoryExpenses.map((category) => (
                  <Cell key={category.name} fill={category.color} />
                ))}
              </Bar>
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
  onPostDebt,
  onPost,
  onRemove,
  onUpdate,
  recurringPayments,
  suggestions,
}: {
  forecast: ForecastData;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onPostDebt: (id: string) => void;
  onPost: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<RecurringPayment>) => void;
  recurringPayments: RecurringPayment[];
  suggestions: {
    categories: string[];
    descriptions: string[];
    subcategories: string[];
  };
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
      <Header eyebrow={null} title="Future" />
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

      <section className="panel">
        <div className="panel-title">
          <CalendarRange size={18} />
          <h3>This month's due list</h3>
        </div>
        <UpcomingPaymentsTable onPostDebt={onPostDebt} onPostRecurring={onPost} payments={forecast.upcomingPayments} />
      </section>

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
          <input list="recurring-category-options" name="category" placeholder="Fixed expense" required />
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
        <Datalist id="recurring-category-options" options={suggestions.categories} />
      </form>

      <ChartPanel title="Monthly forecast" empty={forecast.activePayments.length === 0 && forecast.debtPayments === 0}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={forecastData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Bar dataKey="value" fill={chartGold} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Projected balance" empty={forecast.monthlyProjection.length === 0}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={forecast.monthlyProjection}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Bar dataKey="projectedEndBalance" fill={chartColors[1]} name="Projected end" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <section className="panel">
        <div className="panel-title">
          <Forward size={18} />
          <h3>Projection by month</h3>
        </div>
        <ForecastProjectionTable projection={forecast.monthlyProjection} />
      </section>

      <RecurringPaymentsTable payments={recurringPayments} onPost={onPost} onRemove={onRemove} onUpdate={onUpdate} />
    </div>
  );
}

function HealthView({ issues, onNavigate, state }: { issues: HealthIssue[]; onNavigate: NavigateFn; state: FinanceState }) {
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const info = issues.filter((issue) => issue.severity === "info").length;
  const issueTarget = (issue: HealthIssue): [Section, CurrentSub | SettingsSub] => {
    if (issue.id.startsWith("transaction-")) return ["current", "transactions"];
    if (issue.id.startsWith("budget-")) return ["current", "budgets"];
    if (issue.id.startsWith("category-")) return ["current", "categories"];
    if (issue.id.startsWith("saving-")) return ["settings", "savings"];
    if (issue.id.startsWith("debt-")) return ["settings", "debts"];
    if (issue.id.startsWith("recurring-")) return ["future", "overview"];
    return ["settings", "health"];
  };

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
        <p className="panel-copy">
          Category checks compare records against Current Month &gt; Categories. They are cleanup notes, not balance errors.
        </p>
        {issues.length ? (
          <div className="health-list">
            {issues.map((issue) => (
              <article className={`health-item ${issue.severity}`} key={issue.id}>
                <AlertTriangle size={18} />
                <div>
                  <strong>{issue.title}</strong>
                  <span>{issue.detail}</span>
                </div>
                <button className="secondary-button compact-action" onClick={() => onNavigate(...issueTarget(issue))} type="button">
                  Review
                </button>
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

function InstallView({
  canInstall,
  isOnline,
  isStandalone,
  onInstall,
  serviceWorkerReady,
}: {
  canInstall: boolean;
  isOnline: boolean;
  isStandalone: boolean;
  onInstall: () => Promise<void>;
  serviceWorkerReady: boolean;
}) {
  return (
    <div className="stack">
      <Header eyebrow="Phase 2" title="Install" subtitle="Phone app status for this device." />
      <div className="metric-grid">
        <Metric label="App mode" value={isStandalone ? "Installed" : "Browser"} tone={isStandalone ? "positive" : "neutral"} />
        <Metric label="Network" value={isOnline ? "Online" : "Offline"} tone={isOnline ? "positive" : "neutral"} />
        <Metric label="Offline shell" value={serviceWorkerReady ? "Ready" : "Preparing"} tone={serviceWorkerReady ? "positive" : "neutral"} />
        <Metric label="Storage" value="Local" tone="positive" />
      </div>

      <section className="panel action-panel">
        <div className="panel-title">
          <Smartphone size={18} />
          <h3>Phone install</h3>
        </div>
        {canInstall && !isStandalone ? (
          <button className="primary-button" onClick={onInstall} type="button">
            <Smartphone size={18} />
            Install app
          </button>
        ) : (
          <button className="secondary-button" disabled type="button">
            <CheckCircle2 size={18} />
            {isStandalone ? "Installed" : "Install from browser menu"}
          </button>
        )}
      </section>
    </div>
  );
}

function BackupView({
  backupMeta,
  importSummary,
  onClearData,
  onCsvExport,
  onCsvImport,
  onExport,
  onImport,
  onLoadSampleData,
  state,
}: {
  backupMeta: BackupMeta;
  importSummary: string;
  onClearData: () => void;
  onCsvExport: (kind: CsvKind) => void;
  onCsvImport: (event: ChangeEvent<HTMLInputElement>, kind: CsvKind) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadSampleData: () => void;
  state: FinanceState;
}) {
  const recordTotal = totalFinanceRecords(state);
  const hasBackup = Boolean(backupMeta.lastExportAt);

  return (
    <div className="stack">
      <Header title="Backup" subtitle="Keep a local copy of the records you enter." />
      <section className="panel backup-confidence">
        <div className="panel-title">
          <CheckCircle2 size={18} />
          <h3>Backup confidence</h3>
        </div>
        <div className="metric-grid compact-metrics">
          <Metric label="Local records" value={recordTotal.toString()} tone={recordTotal ? "positive" : "neutral"} />
          <Metric label="Last JSON backup" value={formatDateTime(backupMeta.lastExportAt)} tone={hasBackup ? "positive" : "negative"} />
          <Metric label="Restore mode" value="Replace local data" tone="neutral" />
          <Metric label="CSV import" value="Append + skip duplicates" tone="positive" />
        </div>
        <div className="backup-checklist">
          <span className={hasBackup ? "complete" : "attention"}>
            {hasBackup ? "JSON backup downloaded on this device" : "Download a JSON backup before changing phone/browser data"}
          </span>
          <span>JSON restore asks before replacing current local data</span>
          <span>CSV imports append rows and skip duplicates where possible</span>
        </div>
      </section>
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
            <button className="secondary-button" onClick={() => onCsvExport("budgets")} type="button">
              Budgets CSV
            </button>
            <button className="secondary-button" onClick={() => onCsvExport("categories")} type="button">
              Categories CSV
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
              Budgets CSV
              <input accept=".csv,text/csv" onChange={(event) => onCsvImport(event, "budgets")} type="file" />
            </label>
            <label className="file-button compact">
              Categories CSV
              <input accept=".csv,text/csv" onChange={(event) => onCsvImport(event, "categories")} type="file" />
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
        <Metric label="Budgets" value={state.budgets.length.toString()} tone="neutral" />
        <Metric label="Categories" value={state.categories.length.toString()} tone="neutral" />
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

function Header({ eyebrow = null, subtitle, title }: { eyebrow?: string | null; subtitle?: string; title: string }) {
  return (
    <header className="section-header">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
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

function ReportInsight({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "positive" | "negative" | "neutral";
  value: string;
}) {
  return (
    <article className={`report-insight ${tone}`}>
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

function BudgetsTable({
  budgets,
  onRemove,
  onUpdate,
}: {
  budgets: Budget[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Budget>) => void;
}) {
  if (!budgets.length) return <EmptyTable message="No budgets yet." />;
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Category</th>
          <th>Monthly limit</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {budgets.map((budget) => (
          <tr key={budget.id}>
            <td>
              <input
                className="table-input"
                defaultValue={budget.category}
                onBlur={(event) => onUpdate(budget.id, { category: normalizeLabel(event.currentTarget.value) || budget.category })}
              />
            </td>
            <td>
              <input
                className="table-input number"
                defaultValue={budget.monthlyLimit}
                inputMode="decimal"
                onBlur={(event) => onUpdate(budget.id, { monthlyLimit: toNumber(event.currentTarget.value) })}
              />
            </td>
            <td>
              <IconButton label="Delete budget" onClick={() => onRemove(budget.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function CategoriesTable({
  categories,
  onRemove,
  onUpdate,
}: {
  categories: Category[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Category>) => void;
}) {
  if (!categories.length) return <EmptyTable message="No categories yet." />;
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Color</th>
          <th>Name</th>
          <th>Type</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {categories.map((category) => (
          <tr key={category.id}>
            <td>
              <span className="color-cell">
                <span className="color-swatch" style={{ backgroundColor: category.color }} />
                <input
                  aria-label={`${category.name} color`}
                  className="color-input table-color-input"
                  defaultValue={category.color}
                  onChange={(event) => onUpdate(category.id, { color: event.currentTarget.value })}
                  type="color"
                />
              </span>
            </td>
            <td>
              <input
                className="table-input"
                defaultValue={category.name}
                onBlur={(event) => onUpdate(category.id, { name: normalizeLabel(event.currentTarget.value) || category.name })}
              />
            </td>
            <td>
              <select
                className="table-input"
                defaultValue={category.type}
                onChange={(event) => onUpdate(category.id, { type: event.currentTarget.value as TransactionType })}
              >
                {transactionTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </td>
            <td>
              <IconButton label="Delete category" onClick={() => onRemove(category.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
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
  onPostPayment,
  onRemove,
  onUpdate,
}: {
  debts: Debt[];
  onPostPayment: (id: string) => void;
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
          <th>After next</th>
          <th>Months left</th>
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
            <td>{formatCurrency(Math.max(0, debt.currentBalance - Math.max(0, debt.monthlyPayment)))}</td>
            <td>{formatPayoffMonths(debtPayoffMonths(debt))}</td>
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
              <div className="table-actions">
                <PostButton disabled={debt.monthlyPayment <= 0 || debt.currentBalance <= 0} label="Post debt payment" onClick={() => onPostPayment(debt.id)} />
                <IconButton label="Delete debt" onClick={() => onRemove(debt.id)} />
              </div>
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

function ForecastProjectionTable({ projection }: { projection: ForecastData["monthlyProjection"] }) {
  if (!projection.length) return <EmptyTable message="No projection yet." />;

  return (
    <DataTable>
      <thead>
        <tr>
          <th>Month</th>
          <th>Start</th>
          <th>Income</th>
          <th>Outflow</th>
          <th>Projected end</th>
        </tr>
      </thead>
      <tbody>
        {projection.map((row) => (
          <tr key={row.month}>
            <td>{row.month}</td>
            <td>{formatCurrency(row.startingBalance)}</td>
            <td>{formatCurrency(row.income)}</td>
            <td>{formatCurrency(row.expenses + row.savings + row.debtPayments)}</td>
            <td>{formatCurrency(row.projectedEndBalance)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function UpcomingPaymentsTable({
  onPostDebt,
  onPostRecurring,
  payments,
}: {
  onPostDebt: (id: string) => void;
  onPostRecurring: (id: string) => void;
  payments: ForecastData["upcomingPayments"];
}) {
  if (!payments.length) return <EmptyTable message="No upcoming payments yet." />;

  return (
    <DataTable>
      <thead>
        <tr>
          <th>Due</th>
          <th>Name</th>
          <th>Type</th>
          <th>Category</th>
          <th>Amount</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {payments.map((payment) => (
          <tr key={payment.id}>
            <td>{payment.dueDate || "-"}</td>
            <td>{payment.name}</td>
            <td>{payment.type}</td>
            <td>{payment.category}</td>
            <td>{formatCurrency(payment.amount)}</td>
            <td>
              <PostButton
                label={payment.kind === "debt" ? "Post debt payment" : "Post recurring payment"}
                onClick={() => (payment.kind === "debt" ? onPostDebt(payment.sourceId) : onPostRecurring(payment.sourceId))}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function RecurringPaymentsTable({
  onPost,
  onRemove,
  onUpdate,
  payments,
}: {
  onPost: (id: string) => void;
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
              <div className="table-actions">
                <PostButton label="Post as transaction" onClick={() => onPost(payment.id)} />
                <IconButton label="Delete recurring payment" onClick={() => onRemove(payment.id)} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="table-shell">
      <div className="table-scroll-hint">Swipe table sideways</div>
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    </div>
  );
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

function PostButton({ disabled = false, label, onClick }: { disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className="icon-button post-button" disabled={disabled} onClick={onClick} title={label} type="button">
      <Plus size={16} />
    </button>
  );
}
