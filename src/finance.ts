import { formatCurrency, normalizeLabel, toNumber, todayIso } from "./format";
import { createBudget, createCardPayment, createCategory, createDebt, createRecurringPayment, createSavingsAccount, createTransaction } from "./storage";
import type { Budget, CardPayment, Category, Debt, FinanceState, RecurringPayment, SavingsAccount, Transaction, TransactionType } from "./types";

export type HealthSeverity = "warning" | "info";
export type ReportPeriod = "month" | "bimester" | "trimester" | "quarter" | "semester" | "year";

export type ReportData = {
  categoryExpenses: Array<{ color: string; name: string; value: number }>;
  filteredTransactions: Transaction[];
  label: string;
  monthlyTrend: Array<{
    expenses: number;
    income: number;
    month: string;
    netFlow: number;
    savings: number;
  }>;
  totals: {
    expenses: number;
    income: number;
    netFlow: number;
    savings: number;
  };
};

export type ReportComparison = {
  averageMonthlyExpenses: number;
  debtPayments: number;
  expenseChange: number;
  incomeChange: number;
  netFlowChange: number;
  previousLabel: string;
  savingsChange: number;
  savingsRate: number;
  topExpenseCategory?: { name: string; value: number };
  transactionCount: number;
};

export type ForecastData = {
  activePayments: RecurringPayment[];
  debtPayments: number;
  monthlyProjection: Array<{
    debtPayments: number;
    expenses: number;
    income: number;
    month: string;
    projectedEndBalance: number;
    savings: number;
    startingBalance: number;
  }>;
  projectedEndBalance: number;
  recurringExpenses: number;
  recurringIncome: number;
  recurringSavings: number;
  startingSavings: number;
  upcomingPayments: UpcomingPayment[];
};

export type UpcomingPayment = {
  amount: number;
  category: string;
  dueDate: string;
  id: string;
  kind: "recurring" | "debt";
  name: string;
  sourceId: string;
  type: TransactionType | "Debt";
};

export type BudgetProgress = {
  budget: Budget;
  spent: number;
  remaining: number;
  percentUsed: number;
  status: "under" | "near" | "over";
};

export type CategoryUsage = {
  budgetCount: number;
  creditCardCount: number;
  key: string;
  lastDate: string;
  managed: boolean;
  name: string;
  recurringCount: number;
  suggestedType: TransactionType;
  totalAmount: number;
  transactionCount: number;
};

export type DebtOverview = {
  apartmentDebtTotal: number;
  creditCardCount: number;
  creditCardTotal: number;
  estimatedPayoffMonths: number | null;
  monthlyDebtPayments: number;
  regularDebtCount: number;
  regularDebtTotal: number;
  totalDebt: number;
};

export type CreditCardActivity = {
  balance: number;
  charged: number;
  chargeCount: number;
  lastChargeDate: string;
  paid: number;
  statement: CreditCardStatement;
};

export type TransactionFilters = {
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
};

export type TransactionSort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

export type TransactionTotals = {
  expenses: number;
  income: number;
  netFlow: number;
  savings: number;
};

export type TransactionQuickPick = {
  amount: number;
  category: string;
  count: number;
  description: string;
  id: string;
  lastDate: string;
  subcategory: string;
  type: TransactionType;
};

export type HealthIssue = {
  detail: string;
  id: string;
  severity: HealthSeverity;
  title: string;
};

export const reportPeriods: Array<{ label: string; value: ReportPeriod }> = [
  { label: "Month", value: "month" },
  { label: "Bimester", value: "bimester" },
  { label: "Trimester", value: "trimester" },
  { label: "Quarter", value: "quarter" },
  { label: "Semester", value: "semester" },
  { label: "Year", value: "year" },
];

export function coerceFinanceState(input: unknown): FinanceState {
  const candidate =
    isRecord(input) && isRecord(input.state) ? input.state : isRecord(input) ? input : {};

  return {
    budgets: Array.isArray(candidate.budgets) ? candidate.budgets : [],
    categories: Array.isArray(candidate.categories) ? candidate.categories : [],
    recurringPayments: Array.isArray(candidate.recurringPayments) ? candidate.recurringPayments : [],
    savingsAccounts: Array.isArray(candidate.savingsAccounts) ? candidate.savingsAccounts : [],
    debts: Array.isArray(candidate.debts) ? candidate.debts : [],
    transactions: Array.isArray(candidate.transactions) ? candidate.transactions : [],
  };
}

export function createEmptyState(): FinanceState {
  return {
    budgets: [],
    categories: [],
    recurringPayments: [],
    savingsAccounts: [],
    debts: [],
    transactions: [],
  };
}

export function createSampleState(): FinanceState {
  const month = todayIso().slice(0, 7);
  const previousMonthDate = new Date();
  previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
  const previousMonth = previousMonthDate.toISOString().slice(0, 7);

  return {
    budgets: [
      createBudget({ category: "Personal", monthlyLimit: 700000 }),
      createBudget({ category: "Transport", monthlyLimit: 250000 }),
    ],
    categories: [
      createCategory({ color: "#D4AF37", name: "Salary", type: "Ingreso" }),
      createCategory({ color: "#B33030", name: "Personal", type: "Gasto" }),
      createCategory({ color: "#2A5699", name: "Transport", type: "Gasto" }),
      createCategory({ color: "#2E7D32", name: "Savings", type: "Ahorro" }),
      createCategory({ color: "#8C6A1A", name: "Rent", type: "Gasto" }),
    ],
    savingsAccounts: [
      createSavingsAccount({ bankName: "Lulo Bank", balance: 2800000 }),
      createSavingsAccount({ bankName: "Davivienda", balance: 1200000 }),
    ],
    debts: [
      createDebt({
        name: "Credit card",
        currentBalance: 950000,
        monthlyPayment: 300000,
        dueDate: `${month}-20`,
        notes: "Sample debt",
      }),
    ],
    recurringPayments: [
      createRecurringPayment({
        active: true,
        amount: 4200000,
        category: "Salary",
        dueDay: 30,
        name: "Salary",
        type: "Ingreso",
      }),
      createRecurringPayment({
        active: true,
        amount: 1100000,
        category: "Rent",
        dueDay: 1,
        name: "Rent",
        type: "Gasto",
      }),
      createRecurringPayment({
        active: true,
        amount: 500000,
        category: "Savings",
        dueDay: 5,
        name: "Apartment savings",
        type: "Ahorro",
      }),
    ],
    transactions: [
      createTransaction({
        categoria: "Salary",
        descripcion: "Monthly salary",
        fecha: `${month}-01`,
        gastoIngresoAhorro: "Ingreso",
        monto: 4200000,
        subcategoria: "Main",
      }),
      createTransaction({
        categoria: "Personal",
        descripcion: "Groceries",
        fecha: `${month}-03`,
        gastoIngresoAhorro: "Gasto",
        monto: 180000,
        subcategoria: "Food",
      }),
      createTransaction({
        categoria: "Transport",
        descripcion: "Gas",
        fecha: `${month}-06`,
        gastoIngresoAhorro: "Gasto",
        monto: 85000,
        subcategoria: "Moto",
      }),
      createTransaction({
        categoria: "Savings",
        descripcion: "Apartment fund",
        fecha: `${month}-07`,
        gastoIngresoAhorro: "Ahorro",
        monto: 500000,
        subcategoria: "Goal",
      }),
      createTransaction({
        categoria: "Personal",
        descripcion: "Dinner",
        fecha: `${previousMonth}-22`,
        gastoIngresoAhorro: "Gasto",
        monto: 95000,
        subcategoria: "Food",
      }),
    ],
  };
}

export function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeLabel(value)).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function filterTransactions(transactions: Transaction[], filters: TransactionFilters) {
  const keyword = normalizeLabel(filters.keyword ?? "").toLowerCase();
  const dateFrom = normalizeLabel(filters.dateFrom ?? "");
  const dateTo = normalizeLabel(filters.dateTo ?? "");

  return transactions.filter((transaction) => {
    const transactionDate = comparableTransactionDate(transaction.fecha);
    if (dateFrom && transactionDate < dateFrom) return false;
    if (dateTo && transactionDate > dateTo) return false;
    if (!keyword) return true;

    return [
      transaction.subcategoria,
      transaction.descripcion,
    ]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
}

export function buildTransactionTotals(transactions: Transaction[]): TransactionTotals {
  return transactions.reduce(
    (acc, transaction) => {
      if (transaction.gastoIngresoAhorro === "Ingreso") acc.income += transaction.monto;
      if (transaction.gastoIngresoAhorro === "Gasto") acc.expenses += transaction.monto;
      if (transaction.gastoIngresoAhorro === "Ahorro") acc.savings += transaction.monto;
      acc.netFlow = acc.income - acc.expenses - acc.savings;
      return acc;
    },
    { expenses: 0, income: 0, netFlow: 0, savings: 0 },
  );
}

export function sortTransactions(transactions: Transaction[], sort: TransactionSort) {
  return [...transactions].sort((a, b) => {
    if (sort === "amount-desc") return b.monto - a.monto;
    if (sort === "amount-asc") return a.monto - b.monto;

    const dateComparison = comparableTransactionDate(a.fecha).localeCompare(comparableTransactionDate(b.fecha));
    return sort === "date-asc" ? dateComparison : -dateComparison;
  });
}

export function buildTransactionQuickPicks(transactions: Transaction[], limit = 6): TransactionQuickPick[] {
  const picks = new Map<string, TransactionQuickPick>();

  sortTransactions(transactions, "date-desc").forEach((transaction) => {
    const category = normalizeLabel(transaction.categoria);
    const description = normalizeLabel(transaction.descripcion);
    if (!category || !description || transaction.monto <= 0) return;

    const type = transaction.gastoIngresoAhorro;
    const subcategory = normalizeLabel(transaction.subcategoria);
    const key = [type, category, subcategory, description].map((value) => value.toLowerCase()).join("|");
    const existing = picks.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }

    picks.set(key, {
      amount: transaction.monto,
      category,
      count: 1,
      description,
      id: key,
      lastDate: transaction.fecha,
      subcategory,
      type,
    });
  });

  return Array.from(picks.values()).slice(0, limit);
}

function comparableTransactionDate(value: string) {
  const parsed = transactionDateParts(value);
  if (!parsed) return normalizeLabel(value);
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

export function buildReport(
  transactions: Transaction[],
  selectedMonth: string,
  period: ReportPeriod,
  categories: Category[] = [],
): ReportData {
  const [year, month] = selectedMonth.split("-").map(Number);
  const length = periodMonthLength(period);
  const startMonth = period === "year" ? 1 : Math.floor(((month || 1) - 1) / length) * length + 1;
  const endMonth = period === "year" ? 12 : startMonth + length - 1;

  const filteredTransactions = transactions
    .filter((transaction) => {
      const parsed = transactionDateParts(transaction.fecha);
      return Boolean(parsed && parsed.year === year && parsed.month >= startMonth && parsed.month <= endMonth);
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const totals = buildTransactionTotals(filteredTransactions);

  const expenseByCategory = new Map<string, number>();
  filteredTransactions
    .filter((transaction) => transaction.gastoIngresoAhorro === "Gasto")
    .forEach((transaction) => {
      const category = normalizeLabel(transaction.categoria) || "Uncategorized";
      expenseByCategory.set(category, (expenseByCategory.get(category) || 0) + transaction.monto);
    });

  const categoryColors = buildCategoryColorMap(categories);
  const categoryExpenses = Array.from(expenseByCategory, ([name, value]) => ({
    color: categoryColors.get(normalizeLabel(name).toLowerCase()) || "#FFC212",
    name,
    value,
  })).sort(
    (a, b) => b.value - a.value,
  );
  const monthlyTrend = buildMonthlyTrend(filteredTransactions, year, startMonth, endMonth);

  return {
    categoryExpenses,
    filteredTransactions,
    label: `${periodLabel(period)} ${year}-${String(startMonth).padStart(2, "0")} to ${year}-${String(endMonth).padStart(2, "0")}`,
    monthlyTrend,
    totals,
  };
}

export function previousReportMonth(selectedMonth: string, period: ReportPeriod) {
  return addMonths(selectedMonth, -periodMonthLength(period));
}

export function buildReportComparison(current: ReportData, previous: ReportData, monthCount: number): ReportComparison {
  const debtPayments = current.filteredTransactions
    .filter((transaction) => isDebtPaymentCategory(transaction.categoria))
    .reduce((sum, transaction) => sum + transaction.monto, 0);
  const topExpenseCategory = current.categoryExpenses[0]
    ? { name: current.categoryExpenses[0].name, value: current.categoryExpenses[0].value }
    : undefined;
  const savingsRate = current.totals.income > 0 ? Math.round((current.totals.savings / current.totals.income) * 100) : 0;

  return {
    averageMonthlyExpenses: monthCount > 0 ? Math.round(current.totals.expenses / monthCount) : current.totals.expenses,
    debtPayments,
    expenseChange: current.totals.expenses - previous.totals.expenses,
    incomeChange: current.totals.income - previous.totals.income,
    netFlowChange: current.totals.netFlow - previous.totals.netFlow,
    previousLabel: previous.label,
    savingsChange: current.totals.savings - previous.totals.savings,
    savingsRate,
    topExpenseCategory,
    transactionCount: current.filteredTransactions.length,
  };
}

function buildCategoryColorMap(categories: Category[]) {
  const colors = new Map<string, string>();
  categories.forEach((category) => {
    const key = categoryKey(category);
    const color = normalizeColor(category.color);
    if (key && color) colors.set(key, color);
  });
  return colors;
}

function buildMonthlyTrend(transactions: Transaction[], year: number, startMonth: number, endMonth: number) {
  const rows = new Map(
    Array.from({ length: endMonth - startMonth + 1 }, (_, index) => {
      const monthNumber = startMonth + index;
      const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
      return [month, { expenses: 0, income: 0, month, netFlow: 0, savings: 0 }];
    }),
  );

  transactions.forEach((transaction) => {
    const parsed = transactionDateParts(transaction.fecha);
    if (!parsed) return;

    const month = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
    const row = rows.get(month);
    if (!row) return;

    if (transaction.gastoIngresoAhorro === "Ingreso") row.income += transaction.monto;
    if (transaction.gastoIngresoAhorro === "Gasto") row.expenses += transaction.monto;
    if (transaction.gastoIngresoAhorro === "Ahorro") row.savings += transaction.monto;
    row.netFlow = row.income - row.expenses - row.savings;
  });

  return Array.from(rows.values());
}

export function periodMonthLength(period: ReportPeriod) {
  if (period === "bimester") return 2;
  if (period === "trimester" || period === "quarter") return 3;
  if (period === "semester") return 6;
  if (period === "year") return 12;
  return 1;
}

export function periodLabel(period: ReportPeriod) {
  return reportPeriods.find((item) => item.value === period)?.label || "Period";
}

export function transactionDateParts(value: string) {
  const text = normalizeLabel(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return { year: Number(slash[3]), month: Number(slash[2]), day: Number(slash[1]) };

  return null;
}

export function importMessage(label: string, imported: number, duplicates: number, invalid: number) {
  const parts = [`Imported ${imported} ${label} rows`];
  if (duplicates) parts.push(`skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}`);
  if (invalid) parts.push(`ignored ${invalid} invalid row${invalid === 1 ? "" : "s"}`);
  return `${parts.join(", ")}.`;
}

export function transactionKey(transaction: Transaction) {
  return [
    transaction.fecha,
    transaction.gastoIngresoAhorro,
    normalizeLabel(transaction.categoria).toLowerCase(),
    normalizeLabel(transaction.subcategoria).toLowerCase(),
    normalizeLabel(transaction.descripcion).toLowerCase(),
    transaction.monto,
  ].join("|");
}

export function applyTransactionToSavingsAccounts(accounts: SavingsAccount[], transaction: Transaction): SavingsAccount[] {
  if (transaction.gastoIngresoAhorro !== "Ingreso" || transaction.monto <= 0) return accounts;

  const categoryKey = normalizeLabel(transaction.categoria).toLowerCase();
  if (!categoryKey) return accounts;

  let changed = false;
  const nextAccounts = accounts.map((account) => {
    if (normalizeLabel(account.bankName).toLowerCase() !== categoryKey) return account;
    changed = true;
    return { ...account, balance: account.balance + transaction.monto };
  });

  return changed ? nextAccounts : accounts;
}

export function applyTransactionToDebts(debts: Debt[], transaction: Transaction): Debt[] {
  if (transaction.gastoIngresoAhorro !== "Gasto" || transaction.monto <= 0) return debts;

  const debtNameKey = normalizeLabel(transaction.subcategoria).toLowerCase();
  if (!isDebtPaymentCategory(transaction.categoria) || !debtNameKey) return debts;

  let changed = false;
  const nextDebts = debts.map((debt) => {
    if (isCreditCard(debt) || normalizeLabel(debt.name).toLowerCase() !== debtNameKey) return debt;
    changed = true;
    return { ...debt, currentBalance: Math.max(0, debt.currentBalance - transaction.monto) };
  });

  return changed ? nextDebts : debts;
}

function isDebtPaymentCategory(category: string) {
  return new Set(["deuda", "debt", "debts", "debt payment"]).has(normalizeLabel(category).toLowerCase());
}

export function savingsKey(account: SavingsAccount) {
  return normalizeLabel(account.bankName).toLowerCase();
}

export function debtKey(debt: Debt) {
  return normalizeLabel(debt.name).toLowerCase();
}

export function recurringPaymentKey(payment: RecurringPayment) {
  return normalizeLabel(payment.name).toLowerCase();
}

export function budgetKey(budget: Budget) {
  return normalizeLabel(budget.category).toLowerCase();
}

export function categoryKey(category: Category) {
  return normalizeLabel(category.name).toLowerCase();
}

export function buildCategoryUsage(state: FinanceState): CategoryUsage[] {
  const managedKeys = new Set(state.categories.map(categoryKey).filter(Boolean));
  const usage = new Map<string, CategoryUsage & { typeCounts: Record<TransactionType, number> }>();

  const ensureUsage = (name: string, suggestedType: TransactionType) => {
    const normalized = normalizeLabel(name);
    const key = normalized.toLowerCase();
    if (!key) return null;

    const existing = usage.get(key);
    if (existing) return existing;

    const next = {
      budgetCount: 0,
      creditCardCount: 0,
      key,
      lastDate: "",
      managed: managedKeys.has(key),
      name: normalized,
      recurringCount: 0,
      suggestedType,
      totalAmount: 0,
      transactionCount: 0,
      typeCounts: { Ahorro: 0, Gasto: 0, Ingreso: 0 },
    };
    usage.set(key, next);
    return next;
  };

  state.transactions.forEach((transaction) => {
    const item = ensureUsage(transaction.categoria, transaction.gastoIngresoAhorro);
    if (!item) return;
    item.transactionCount += 1;
    item.totalAmount += transaction.monto;
    item.typeCounts[transaction.gastoIngresoAhorro] += 1;
    if (comparableTransactionDate(transaction.fecha) > comparableTransactionDate(item.lastDate)) item.lastDate = transaction.fecha;
  });

  state.budgets.forEach((budget) => {
    const item = ensureUsage(budget.category, "Gasto");
    if (item) item.budgetCount += 1;
  });

  state.recurringPayments.forEach((payment) => {
    const item = ensureUsage(payment.category, payment.type);
    if (!item) return;
    item.recurringCount += 1;
    item.typeCounts[payment.type] += 1;
  });

  state.debts.forEach((debt) => {
    if (!isCreditCard(debt)) return;
    const item = ensureUsage(debt.linkedCategory || "", "Gasto");
    if (item) item.creditCardCount += 1;
  });

  return Array.from(usage.values())
    .map(({ typeCounts, ...item }) => {
      const [type, count] = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0] || [];
      return {
        ...item,
        suggestedType: count ? (type as TransactionType) : item.suggestedType,
      };
    })
    .sort((a, b) => {
      if (a.managed !== b.managed) return a.managed ? 1 : -1;
      const activityA = a.transactionCount + a.budgetCount + a.recurringCount + a.creditCardCount;
      const activityB = b.transactionCount + b.budgetCount + b.recurringCount + b.creditCardCount;
      if (activityA !== activityB) return activityB - activityA;
      return a.name.localeCompare(b.name);
    });
}

export function buildForecast(state: FinanceState, startMonth = todayIso().slice(0, 7), monthCount = 6): ForecastData {
  const startingSavings = state.savingsAccounts.reduce((sum, account) => sum + account.balance, 0);
  const activePayments = state.recurringPayments.filter((payment) => payment.active);
  const recurringIncome = activePayments
    .filter((payment) => payment.type === "Ingreso")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const recurringExpenses = activePayments
    .filter((payment) => payment.type === "Gasto")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const recurringSavings = activePayments
    .filter((payment) => payment.type === "Ahorro")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const debtPayments = state.debts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);
  const monthlyProjection = buildMonthlyProjection({
    debtPayments,
    monthCount,
    recurringExpenses,
    recurringIncome,
    recurringSavings,
    startMonth,
    startingSavings,
  });
  const upcomingPayments = buildUpcomingPayments(state, startMonth);

  return {
    activePayments,
    debtPayments,
    monthlyProjection,
    projectedEndBalance: monthlyProjection[0]?.projectedEndBalance ?? startingSavings,
    recurringExpenses,
    recurringIncome,
    recurringSavings,
    startingSavings,
    upcomingPayments,
  };
}

export function buildUpcomingPayments(state: FinanceState, selectedMonth = todayIso().slice(0, 7)): UpcomingPayment[] {
  const [year, month] = selectedMonth.split("-").map(Number);
  const maxDay = daysInMonth(year || new Date().getFullYear(), month || 1);

  const recurring = state.recurringPayments
    .filter((payment) => payment.active && payment.amount > 0)
    .map((payment) => {
      const day = Math.min(clampDueDay(payment.dueDay), maxDay);
      return {
        amount: payment.amount,
        category: payment.category,
        dueDate: `${selectedMonth}-${String(day).padStart(2, "0")}`,
        id: `recurring-${payment.id}`,
        kind: "recurring" as const,
        name: payment.name,
        sourceId: payment.id,
        type: payment.type,
      };
    });

  const debts = state.debts
    .filter((debt) => debt.currentBalance > 0 && debt.monthlyPayment > 0)
    .map((debt) => {
      const parsed = transactionDateParts(debt.dueDate);
      const day = parsed ? Math.min(Math.max(1, parsed.day), maxDay) : 0;
      return {
        amount: Math.min(debt.monthlyPayment, debt.currentBalance),
        category: "Debt payment",
        dueDate: day ? `${selectedMonth}-${String(day).padStart(2, "0")}` : "",
        id: `debt-${debt.id}`,
        kind: "debt" as const,
        name: debt.name,
        sourceId: debt.id,
        type: "Debt" as const,
      };
    });

  return [...recurring, ...debts].sort((a, b) => {
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && !b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name);
  });
}

function buildMonthlyProjection({
  debtPayments,
  monthCount,
  recurringExpenses,
  recurringIncome,
  recurringSavings,
  startMonth,
  startingSavings,
}: {
  debtPayments: number;
  monthCount: number;
  recurringExpenses: number;
  recurringIncome: number;
  recurringSavings: number;
  startMonth: string;
  startingSavings: number;
}) {
  const count = Math.max(1, Math.round(monthCount));
  let balance = startingSavings;

  return Array.from({ length: count }, (_, index) => {
    const month = addMonths(startMonth, index);
    const startingBalance = balance;
    const projectedEndBalance = startingBalance + recurringIncome - recurringExpenses - recurringSavings - debtPayments;
    balance = projectedEndBalance;

    return {
      debtPayments,
      expenses: recurringExpenses,
      income: recurringIncome,
      month,
      projectedEndBalance,
      savings: recurringSavings,
      startingBalance,
    };
  });
}

function addMonths(month: string, offset: number) {
  const [year = new Date().getFullYear(), monthNumber = 1] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildBudgetProgress(transactions: Transaction[], budgets: Budget[], selectedMonth: string): BudgetProgress[] {
  const report = buildReport(transactions, selectedMonth, "month");
  const expenses = new Map(report.categoryExpenses.map((item) => [normalizeLabel(item.name).toLowerCase(), item.value]));

  return budgets
    .filter((budget) => normalizeLabel(budget.category) && budget.monthlyLimit > 0)
    .map((budget) => {
      const spent = expenses.get(normalizeLabel(budget.category).toLowerCase()) || 0;
      const remaining = budget.monthlyLimit - spent;
      const percentUsed = Math.round((spent / budget.monthlyLimit) * 100);
      const status: BudgetProgress["status"] = spent > budget.monthlyLimit ? "over" : percentUsed >= 80 ? "near" : "under";

      return { budget, percentUsed, remaining, spent, status };
    })
    .sort((a, b) => b.percentUsed - a.percentUsed);
}

export function buildHealthIssues(state: FinanceState): HealthIssue[] {
  const issues: HealthIssue[] = [];

  state.transactions.forEach((transaction) => {
    const label = `${transaction.fecha || "No date"} - ${transaction.descripcion || "No description"}`;
    if (!transactionDateParts(transaction.fecha)) {
      issues.push({
        detail: label,
        id: `transaction-date-${transaction.id}`,
        severity: "warning",
        title: "Transaction has an invalid date",
      });
    }
    if (!normalizeLabel(transaction.categoria)) {
      issues.push({
        detail: label,
        id: `transaction-category-${transaction.id}`,
        severity: "warning",
        title: "Transaction has no category",
      });
    }
    if (!normalizeLabel(transaction.descripcion)) {
      issues.push({
        detail: label,
        id: `transaction-description-${transaction.id}`,
        severity: "warning",
        title: "Transaction has no description",
      });
    }
    if (transaction.monto <= 0) {
      issues.push({
        detail: label,
        id: `transaction-amount-${transaction.id}`,
        severity: "warning",
        title: "Transaction amount is zero or negative",
      });
    }
  });

  const seenTransactions = new Map<string, string>();
  state.transactions.forEach((transaction) => {
    const key = transactionKey(transaction);
    const firstId = seenTransactions.get(key);
    if (firstId && firstId !== transaction.id) {
      issues.push({
        detail: `${transaction.fecha || "No date"} - ${transaction.descripcion || "No description"}`,
        id: `transaction-duplicate-${transaction.id}`,
        severity: "warning",
        title: "Transaction appears more than once",
      });
      return;
    }
    seenTransactions.set(key, transaction.id);
  });

  state.budgets.forEach((budget) => {
    if (!normalizeLabel(budget.category)) {
      issues.push({
        detail: `Limit: ${formatCurrency(budget.monthlyLimit)}`,
        id: `budget-category-${budget.id}`,
        severity: "warning",
        title: "Budget has no category",
      });
    }
    if (budget.monthlyLimit <= 0) {
      issues.push({
        detail: normalizeLabel(budget.category) || "Unnamed budget",
        id: `budget-limit-${budget.id}`,
        severity: "warning",
        title: "Budget limit is zero or negative",
      });
    }
  });

  state.categories.forEach((category) => {
    if (!normalizeLabel(category.name)) {
      issues.push({
        detail: category.type,
        id: `category-name-${category.id}`,
        severity: "warning",
        title: "Category has no name",
      });
    }
    if (!normalizeTransactionType(category.type)) {
      issues.push({
        detail: normalizeLabel(category.name) || "Unnamed category",
        id: `category-type-${category.id}`,
        severity: "warning",
        title: "Category has an invalid type",
      });
    }
  });

  const seenCategories = new Map<string, string>();
  state.categories.forEach((category) => {
    const key = categoryKey(category);
    if (!key) return;
    const firstId = seenCategories.get(key);
    if (firstId && firstId !== category.id) {
      issues.push({
        detail: category.name,
        id: `category-duplicate-${category.id}`,
        severity: "warning",
        title: "Category appears more than once",
      });
      return;
    }
    seenCategories.set(key, category.id);
  });

  if (state.categories.some((category) => categoryKey(category))) {
    buildCategoryUsage(state)
      .filter((category) => !category.managed)
      .forEach((category) => {
        const usedIn = [
          category.transactionCount ? `${category.transactionCount} transaction${category.transactionCount === 1 ? "" : "s"}` : "",
          category.budgetCount ? `${category.budgetCount} budget${category.budgetCount === 1 ? "" : "s"}` : "",
          category.recurringCount ? `${category.recurringCount} recurring` : "",
          category.creditCardCount ? `${category.creditCardCount} credit card${category.creditCardCount === 1 ? "" : "s"}` : "",
        ]
          .filter(Boolean)
          .join(", ");

        issues.push({
          detail: `${category.name} is used in ${usedIn}. Add it to Categories or rename the records using it.`,
          id: `category-unmanaged-${category.key}`,
          severity: "info",
          title: "Category is used but not managed",
        });
      });
  }

  state.savingsAccounts.forEach((account) => {
    if (!normalizeLabel(account.bankName)) {
      issues.push({
        detail: `Balance: ${formatCurrency(account.balance)}`,
        id: `saving-name-${account.id}`,
        severity: "warning",
        title: "Savings account has no bank name",
      });
    }
    if (account.balance < 0) {
      issues.push({
        detail: normalizeLabel(account.bankName) || "Unnamed savings account",
        id: `saving-balance-${account.id}`,
        severity: "warning",
        title: "Savings balance is negative",
      });
    }
  });

  state.debts.forEach((debt) => {
    if (!normalizeLabel(debt.name)) {
      issues.push({
        detail: `Debt balance: ${formatCurrency(debt.currentBalance)}`,
        id: `debt-name-${debt.id}`,
        severity: "warning",
        title: "Debt has no name",
      });
    }
    if (debt.currentBalance > 0 && debt.monthlyPayment <= 0) {
      issues.push({
        detail: normalizeLabel(debt.name) || "Unnamed debt",
        id: `debt-payment-${debt.id}`,
        severity: "warning",
        title: "Debt has no monthly payment",
      });
    }
  });

  state.recurringPayments.forEach((payment) => {
    if (!payment.active) {
      issues.push({
        detail: normalizeLabel(payment.name) || "Unnamed recurring payment",
        id: `recurring-inactive-${payment.id}`,
        severity: "info",
        title: "Recurring item is inactive",
      });
    }
    if (payment.active && payment.amount <= 0) {
      issues.push({
        detail: normalizeLabel(payment.name) || "Unnamed recurring payment",
        id: `recurring-amount-${payment.id}`,
        severity: "warning",
        title: "Active recurring item has zero amount",
      });
    }
    if (!normalizeLabel(payment.category)) {
      issues.push({
        detail: normalizeLabel(payment.name) || "Unnamed recurring payment",
        id: `recurring-category-${payment.id}`,
        severity: "warning",
        title: "Recurring item has no category",
      });
    }
  });

  return issues;
}

export function clampDueDay(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(31, Math.max(1, Math.round(value)));
}

export function transactionFromRecurringPayment(payment: RecurringPayment, fecha = todayIso()): Transaction {
  return createTransaction({
    fecha,
    gastoIngresoAhorro: payment.type,
    categoria: normalizeLabel(payment.category),
    subcategoria: "Recurring",
    descripcion: normalizeLabel(payment.name),
    monto: payment.amount,
  });
}

export function transactionFromDebtPayment(debt: Debt, fecha = todayIso()): Transaction {
  return createTransaction({
    fecha,
    gastoIngresoAhorro: "Gasto",
    categoria: "Debt payment",
    subcategoria: normalizeLabel(debt.name),
    descripcion: `${normalizeLabel(debt.name)} payment`,
    monto: Math.min(Math.max(0, debt.monthlyPayment), Math.max(0, debt.currentBalance)),
  });
}

export function applyDebtPayment(debt: Debt): Debt {
  const paymentAmount = Math.min(Math.max(0, debt.monthlyPayment), Math.max(0, debt.currentBalance));
  return { ...debt, currentBalance: Math.max(0, debt.currentBalance - paymentAmount) };
}

export function debtPayoffMonths(debt: Debt) {
  if (debt.currentBalance <= 0) return 0;
  if (debt.monthlyPayment <= 0) return null;
  return Math.ceil(debt.currentBalance / debt.monthlyPayment);
}

export function buildDebtOverview(debts: Debt[], transactions: Transaction[]): DebtOverview {
  const regularDebts = debts.filter((debt) => !isCreditCard(debt));
  const creditCards = debts.filter((debt) => isCreditCard(debt));
  const apartmentDebtTotal = regularDebts
    .filter((debt) => ["apartamento", "apartment"].includes(normalizeLabel(debt.name).toLowerCase()))
    .reduce((sum, debt) => sum + Math.max(0, debt.currentBalance), 0);
  const regularDebtTotal = regularDebts.reduce((sum, debt) => sum + Math.max(0, debt.currentBalance), 0);
  const creditCardTotal = creditCards.reduce((sum, debt) => sum + creditCardBalance(debt, transactions), 0);
  const monthlyDebtPayments = regularDebts.reduce((sum, debt) => sum + Math.max(0, Math.min(debt.monthlyPayment, debt.currentBalance)), 0);
  const payableDebts = regularDebts.filter((debt) => debt.currentBalance > 0);
  const estimatedPayoffMonths =
    payableDebts.length && payableDebts.every((debt) => debt.monthlyPayment > 0)
      ? Math.max(...payableDebts.map((debt) => debtPayoffMonths(debt) || 0))
      : null;

  return {
    apartmentDebtTotal,
    creditCardCount: creditCards.length,
    creditCardTotal,
    estimatedPayoffMonths,
    monthlyDebtPayments,
    regularDebtCount: regularDebts.length,
    regularDebtTotal,
    totalDebt: regularDebtTotal + creditCardTotal,
  };
}

// ---- Credit-card mode --------------------------------------------------------
// A credit-card debt tracks a floating balance: linked-category expenses accrue
// onto it and payments pay it down. The balance is DERIVED from transactions +
// payments (never hand-edited), so it can't drift out of sync.

export type CreditCardStatement = {
  amountDue: number;
  closed: boolean;
  cutoffDate: string;
};

export function isCreditCard(debt: Debt): debt is Debt & { linkedCategory: string } {
  return Boolean(debt.isCreditCard && normalizeLabel(debt.linkedCategory ?? ""));
}

/** Expenses charged to this card: Gasto transactions in the card's linked category. */
export function creditCardCharges(debt: Debt, transactions: Transaction[]): Transaction[] {
  const linked = normalizeLabel(debt.linkedCategory ?? "").toLowerCase();
  if (!linked) return [];
  return transactions.filter(
    (transaction) =>
      transaction.gastoIngresoAhorro === "Gasto" &&
      normalizeLabel(transaction.categoria).toLowerCase() === linked,
  );
}

function sumCardPayments(debt: Debt): number {
  return (debt.payments ?? []).reduce((sum, payment) => sum + Math.max(0, payment.amount), 0);
}

/** Live balance owed on the card = charges to date minus payments, floored at 0. */
export function creditCardBalance(debt: Debt, transactions: Transaction[]): number {
  const charged = creditCardCharges(debt, transactions).reduce((sum, transaction) => sum + transaction.monto, 0);
  return Math.max(0, charged - sumCardPayments(debt));
}

/**
 * The statement for the most recent cutoff (e.g. the 5th): what accrued on or
 * before the cutoff, less payments made so far (payments pay the oldest balance
 * first). `closed` is true once today is past this month's cutoff day.
 */
export function creditCardStatement(debt: Debt, transactions: Transaction[], today = todayIso()): CreditCardStatement {
  const cutoffDay = clampDueDay(debt.cutoffDay ?? 1);
  const [year, month, day] = today.split("-").map(Number);
  const closed = (day || 1) >= cutoffDay;
  const cutoffMonth = closed
    ? `${year}-${String(month).padStart(2, "0")}`
    : addMonths(`${year}-${String(month).padStart(2, "0")}`, -1);
  const cutoffDate = `${cutoffMonth}-${String(cutoffDay).padStart(2, "0")}`;

  const chargedThroughCutoff = creditCardCharges(debt, transactions)
    .filter((transaction) => comparableTransactionDate(transaction.fecha) <= cutoffDate)
    .reduce((sum, transaction) => sum + transaction.monto, 0);

  return { amountDue: Math.max(0, chargedThroughCutoff - sumCardPayments(debt)), closed, cutoffDate };
}

/** Records a card payment (pure). Does not create an expense — it clears liability. */
export function buildCreditCardActivity(debt: Debt, transactions: Transaction[], today = todayIso()): CreditCardActivity {
  const charges = creditCardCharges(debt, transactions);
  const charged = charges.reduce((sum, transaction) => sum + transaction.monto, 0);
  const sortedCharges = sortTransactions(charges, "date-desc");

  return {
    balance: creditCardBalance(debt, transactions),
    charged,
    chargeCount: charges.length,
    lastChargeDate: sortedCharges[0]?.fecha || "",
    paid: sumCardPayments(debt),
    statement: creditCardStatement(debt, transactions, today),
  };
}

export function applyCreditCardPayment(
  debt: Debt,
  amount: number,
  date = todayIso(),
  fromAccountId?: string,
): { debt: Debt; payment: CardPayment } {
  const payment = createCardPayment({ amount: Math.max(0, amount), date, fromAccountId });
  return { debt: { ...debt, payments: [...(debt.payments ?? []), payment] }, payment };
}

/** Balance to use in net-position/charts: derived for cards, stored otherwise. */
export function effectiveDebtBalance(debt: Debt, transactions: Transaction[]): number {
  return isCreditCard(debt) ? creditCardBalance(debt, transactions) : debt.currentBalance;
}

export function parseTransactionRow(header: string[], row: string[]): Transaction | null {
  const fecha = csvValue(header, row, ["fecha", "date"]);
  const tipo = normalizeTransactionType(csvValue(header, row, ["gasto/ingreso/ahorro", "tipo", "type"]));
  const categoria = normalizeLabel(csvValue(header, row, ["categoria", "category"]));
  const subcategoria = normalizeLabel(csvValue(header, row, ["subcategoria", "subcategory"]));
  const descripcion = normalizeLabel(csvValue(header, row, ["descripcion", "description"]));
  const monto = toNumber(csvValue(header, row, ["monto", "amount"]));

  if (!fecha || !tipo || !categoria || !descripcion || !Number.isFinite(monto)) return null;

  return createTransaction({
    fecha,
    gastoIngresoAhorro: tipo,
    categoria,
    subcategoria,
    descripcion,
    monto,
  });
}

export function parseSavingsRow(header: string[], row: string[]): SavingsAccount | null {
  const bankName = normalizeLabel(csvValue(header, row, ["bank_name", "bank", "banco", "bankname"]));
  const balance = toNumber(csvValue(header, row, ["balance", "saldo"]));

  if (!bankName || !Number.isFinite(balance)) return null;

  return createSavingsAccount({ bankName, balance });
}

export function parseDebtRow(header: string[], row: string[]): Debt | null {
  const name = normalizeLabel(csvValue(header, row, ["name", "debt", "debt_name", "categoria", "nombre"]));
  const currentBalance = toNumber(csvValue(header, row, ["current_balance", "balance", "valor", "monto"]));
  const monthlyPayment = toNumber(csvValue(header, row, ["monthly_payment", "payment", "monthly", "pago_mensual"]));
  const dueDate = csvValue(header, row, ["due_date", "due", "fecha"]);
  const notes = normalizeLabel(csvValue(header, row, ["notes", "note", "notas"]));

  if (!name || !Number.isFinite(currentBalance)) return null;

  return createDebt({ name, currentBalance, monthlyPayment, dueDate, notes });
}

export function parseRecurringPaymentRow(header: string[], row: string[]): RecurringPayment | null {
  const name = normalizeLabel(csvValue(header, row, ["name", "nombre"]));
  const type = normalizeTransactionType(csvValue(header, row, ["type", "tipo", "gasto/ingreso/ahorro"]));
  const category = normalizeLabel(csvValue(header, row, ["category", "categoria"]));
  const amount = toNumber(csvValue(header, row, ["amount", "monto"]));
  const dueDay = clampDueDay(toNumber(csvValue(header, row, ["due_day", "due", "day", "dia"])));
  const active = normalizeBoolean(csvValue(header, row, ["active", "activo"]));

  if (!name || !type || !category || !Number.isFinite(amount)) return null;

  return createRecurringPayment({ name, type, category, amount, dueDay, active });
}

export function parseBudgetRow(header: string[], row: string[]): Budget | null {
  const category = normalizeLabel(csvValue(header, row, ["category", "categoria"]));
  const monthlyLimit = toNumber(csvValue(header, row, ["monthly_limit", "limit", "budget", "presupuesto", "monto"]));

  if (!category || !Number.isFinite(monthlyLimit)) return null;

  return createBudget({ category, monthlyLimit });
}

export function parseCategoryRow(header: string[], row: string[]): Category | null {
  const name = normalizeLabel(csvValue(header, row, ["name", "category", "categoria", "nombre"]));
  const type = normalizeTransactionType(csvValue(header, row, ["type", "tipo", "gasto/ingreso/ahorro"]));
  const color = normalizeColor(csvValue(header, row, ["color", "colour"])) || "#FFC212";

  if (!name || !type) return null;

  return createCategory({ name, type, color });
}

export function normalizeColor(value: string) {
  const color = normalizeLabel(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : "";
}

export function csvValue(header: string[], row: string[], aliases: string[]) {
  const normalizedHeader = header.map((value) => normalizeCsvHeader(value));
  const index = aliases.map((alias) => normalizedHeader.indexOf(normalizeCsvHeader(alias))).find((item) => item >= 0);
  return index === undefined ? "" : row[index] ?? "";
}

export function normalizeCsvHeader(value: string) {
  return normalizeLabel(value).toLowerCase().replace(/\s+/g, "_");
}

export function normalizeTransactionType(value: string): TransactionType | null {
  const normalized = normalizeLabel(value).toLowerCase();
  if (normalized === "gasto") return "Gasto";
  if (normalized === "ingreso") return "Ingreso";
  if (normalized === "ahorro") return "Ahorro";
  return null;
}

export function normalizeBoolean(value: string) {
  const normalized = normalizeLabel(value).toLowerCase();
  if (["false", "0", "no", "inactive", "inactivo"].includes(normalized)) return false;
  return true;
}

export function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
