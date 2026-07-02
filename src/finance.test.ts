import { describe, expect, it } from "vitest";
import {
  applyCreditCardPayment,
  applyDebtPayment,
  buildBudgetProgress,
  creditCardBalance,
  creditCardCharges,
  creditCardStatement,
  effectiveDebtBalance,
  isCreditCard,
  buildForecast,
  buildHealthIssues,
  buildReport,
  buildTransactionTotals,
  buildUpcomingPayments,
  categoryKey,
  clampDueDay,
  coerceFinanceState,
  debtKey,
  filterTransactions,
  normalizeBoolean,
  normalizeColor,
  normalizeTransactionType,
  parseBudgetRow,
  parseCategoryRow,
  parseRecurringPaymentRow,
  parseTransactionRow,
  periodLabel,
  periodMonthLength,
  savingsKey,
  sortTransactions,
  transactionDateParts,
  transactionFromDebtPayment,
  transactionFromRecurringPayment,
  transactionKey,
  uniqueSorted,
} from "./finance";
import type { Category, Debt, FinanceState, RecurringPayment, SavingsAccount, Transaction } from "./types";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? "t1",
    fecha: overrides.fecha ?? "2026-03-10",
    gastoIngresoAhorro: overrides.gastoIngresoAhorro ?? "Gasto",
    categoria: overrides.categoria ?? "Personal",
    subcategoria: overrides.subcategoria ?? "Food",
    descripcion: overrides.descripcion ?? "Lunch",
    monto: overrides.monto ?? 1000,
  };
}

function state(overrides: Partial<FinanceState> = {}): FinanceState {
  return {
    budgets: overrides.budgets ?? [],
    categories: overrides.categories ?? [],
    recurringPayments: overrides.recurringPayments ?? [],
    savingsAccounts: overrides.savingsAccounts ?? [],
    debts: overrides.debts ?? [],
    transactions: overrides.transactions ?? [],
  };
}

describe("transactionDateParts", () => {
  it("parses ISO dates", () => {
    expect(transactionDateParts("2026-01-26")).toEqual({ year: 2026, month: 1, day: 26 });
  });

  it("parses day/month/year slash dates from the sheet", () => {
    expect(transactionDateParts("26/1/2026")).toEqual({ year: 2026, month: 1, day: 26 });
  });

  it("returns null for unparseable dates", () => {
    expect(transactionDateParts("not-a-date")).toBeNull();
    expect(transactionDateParts("")).toBeNull();
  });
});

describe("period helpers", () => {
  it("maps periods to month lengths", () => {
    expect(periodMonthLength("month")).toBe(1);
    expect(periodMonthLength("bimester")).toBe(2);
    expect(periodMonthLength("quarter")).toBe(3);
    expect(periodMonthLength("semester")).toBe(6);
    expect(periodMonthLength("year")).toBe(12);
  });

  it("labels known periods", () => {
    expect(periodLabel("semester")).toBe("Semester");
  });
});

describe("buildReport", () => {
  const transactions: Transaction[] = [
    tx({ id: "a", fecha: "2026-01-10", gastoIngresoAhorro: "Ingreso", monto: 5000, categoria: "Salary" }),
    tx({ id: "b", fecha: "2026-01-15", gastoIngresoAhorro: "Gasto", monto: 1200, categoria: "Food" }),
    tx({ id: "c", fecha: "2026-02-05", gastoIngresoAhorro: "Gasto", monto: 800, categoria: "Food" }),
    tx({ id: "d", fecha: "2026-03-01", gastoIngresoAhorro: "Ahorro", monto: 400, categoria: "Goal" }),
    tx({ id: "e", fecha: "2025-01-20", gastoIngresoAhorro: "Gasto", monto: 999, categoria: "Food" }),
  ];

  it("filters to the selected month only", () => {
    const report = buildReport(transactions, "2026-01", "month");
    expect(report.filteredTransactions.map((t) => t.id)).toEqual(["a", "b"]);
    expect(report.totals).toEqual({ income: 5000, expenses: 1200, savings: 0, netFlow: 3800 });
  });

  it("groups a quarter and excludes other years", () => {
    const report = buildReport(transactions, "2026-02", "quarter");
    // Q1 2026 = Jan..Mar, so a,b,c,d but not the 2025 row
    expect(report.filteredTransactions.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(report.totals).toEqual({ income: 5000, expenses: 2000, savings: 400, netFlow: 2600 });
  });

  it("builds a zero-filled monthly trend for the selected period", () => {
    const report = buildReport(transactions, "2026-02", "quarter");
    expect(report.monthlyTrend).toEqual([
      { month: "2026-01", income: 5000, expenses: 1200, savings: 0, netFlow: 3800 },
      { month: "2026-02", income: 0, expenses: 800, savings: 0, netFlow: -800 },
      { month: "2026-03", income: 0, expenses: 0, savings: 400, netFlow: -400 },
    ]);
  });

  it("aggregates expenses by category, sorted descending", () => {
    const report = buildReport(transactions, "2026-06", "year");
    expect(report.categoryExpenses).toEqual([{ color: "#FFC212", name: "Food", value: 2000 }]);
  });

  it("uses managed category colors for expense categories", () => {
    const report = buildReport(transactions, "2026-06", "year", [
      { id: "c", name: " food ", type: "Gasto", color: "#2a5699" },
    ]);
    expect(report.categoryExpenses).toEqual([{ color: "#2A5699", name: "Food", value: 2000 }]);
  });
});

describe("filterTransactions", () => {
  const transactions: Transaction[] = [
    tx({ id: "a", fecha: "2026-01-10", gastoIngresoAhorro: "Ingreso", categoria: "Salary", descripcion: "Monthly salary", monto: 5000 }),
    tx({ id: "b", fecha: "2026-01-11", gastoIngresoAhorro: "Gasto", categoria: "Food", descripcion: "Lunch", monto: 1200 }),
    tx({ id: "c", fecha: "2026-01-12", gastoIngresoAhorro: "Ahorro", categoria: "Emergency fund", descripcion: "Savings", monto: 800 }),
  ];

  it("filters transactions by type and category", () => {
    expect(filterTransactions(transactions, { category: " food ", type: "Gasto" }).map((transaction) => transaction.id)).toEqual(["b"]);
  });

  it("searches across labels, date, type, and amount", () => {
    expect(filterTransactions(transactions, { search: "salary" }).map((transaction) => transaction.id)).toEqual(["a"]);
    expect(filterTransactions(transactions, { search: "800" }).map((transaction) => transaction.id)).toEqual(["c"]);
  });
});

describe("buildTransactionTotals", () => {
  it("totals income, expenses, savings, and net flow", () => {
    expect(
      buildTransactionTotals([
        tx({ id: "income", gastoIngresoAhorro: "Ingreso", monto: 5000 }),
        tx({ id: "expense", gastoIngresoAhorro: "Gasto", monto: 1200 }),
        tx({ id: "saving", gastoIngresoAhorro: "Ahorro", monto: 800 }),
      ]),
    ).toEqual({ income: 5000, expenses: 1200, savings: 800, netFlow: 3000 });
  });
});

describe("sortTransactions", () => {
  const transactions: Transaction[] = [
    tx({ id: "old-slash", fecha: "26/1/2026", monto: 500 }),
    tx({ id: "new-iso", fecha: "2026-03-10", monto: 200 }),
    tx({ id: "mid-iso", fecha: "2026-02-05", monto: 900 }),
  ];

  it("sorts by parsed transaction date", () => {
    expect(sortTransactions(transactions, "date-desc").map((transaction) => transaction.id)).toEqual([
      "new-iso",
      "mid-iso",
      "old-slash",
    ]);
    expect(sortTransactions(transactions, "date-asc").map((transaction) => transaction.id)).toEqual([
      "old-slash",
      "mid-iso",
      "new-iso",
    ]);
  });

  it("sorts by amount", () => {
    expect(sortTransactions(transactions, "amount-desc").map((transaction) => transaction.id)).toEqual([
      "mid-iso",
      "old-slash",
      "new-iso",
    ]);
    expect(sortTransactions(transactions, "amount-asc").map((transaction) => transaction.id)).toEqual([
      "new-iso",
      "old-slash",
      "mid-iso",
    ]);
  });
});

describe("dedup keys", () => {
  it("treats case and whitespace differences as duplicates", () => {
    const a = tx({ categoria: "  Food ", descripcion: "LUNCH" });
    const b = tx({ categoria: "food", descripcion: "lunch" });
    expect(transactionKey(a)).toBe(transactionKey(b));
  });

  it("distinguishes different amounts", () => {
    expect(transactionKey(tx({ monto: 1 }))).not.toBe(transactionKey(tx({ monto: 2 })));
  });

  it("normalizes savings and debt name keys", () => {
    expect(savingsKey({ id: "1", bankName: " Lulo Bank ", balance: 0 })).toBe("lulo bank");
    expect(debtKey({ id: "1", name: "Credit CARD", currentBalance: 0, monthlyPayment: 0, dueDate: "", notes: "" })).toBe(
      "credit card",
    );
  });

  it("normalizes category keys", () => {
    expect(categoryKey({ id: "c", name: " Personal ", type: "Gasto", color: "#D4AF37" })).toBe("personal");
  });
});

describe("buildBudgetProgress", () => {
  it("tracks current-month spending against category budgets", () => {
    const progress = buildBudgetProgress(
      [
        tx({ id: "a", fecha: "2026-03-01", categoria: "Food", monto: 800 }),
        tx({ id: "b", fecha: "2026-03-02", categoria: "Transport", monto: 1200 }),
        tx({ id: "c", fecha: "2026-02-02", categoria: "Food", monto: 9999 }),
      ],
      [
        { id: "bf", category: "Food", monthlyLimit: 1000 },
        { id: "bt", category: "Transport", monthlyLimit: 1000 },
      ],
      "2026-03",
    );

    expect(progress).toMatchObject([
      { budget: { category: "Transport" }, percentUsed: 120, remaining: -200, spent: 1200, status: "over" },
      { budget: { category: "Food" }, percentUsed: 80, remaining: 200, spent: 800, status: "near" },
    ]);
  });

  it("ignores invalid budgets", () => {
    expect(
      buildBudgetProgress([tx()], [{ id: "bad", category: "", monthlyLimit: 0 }], "2026-03"),
    ).toEqual([]);
  });
});

describe("buildForecast", () => {
  it("projects end balance from active recurring items and debt payments", () => {
    const forecast = buildForecast(
      state({
        savingsAccounts: [{ id: "s", bankName: "Lulo", balance: 1000 }],
        recurringPayments: [
          { id: "i", name: "Salary", type: "Ingreso", category: "Salary", amount: 5000, dueDay: 30, active: true },
          { id: "e", name: "Rent", type: "Gasto", category: "Rent", amount: 1500, dueDay: 1, active: true },
          { id: "a", name: "Goal", type: "Ahorro", category: "Goal", amount: 500, dueDay: 5, active: true },
          { id: "x", name: "Old", type: "Gasto", category: "Old", amount: 9999, dueDay: 1, active: false },
        ],
        debts: [
          { id: "d", name: "Card", currentBalance: 2000, monthlyPayment: 300, dueDate: "", notes: "" },
        ],
      }),
      "2026-03",
      3,
    );

    expect(forecast.recurringIncome).toBe(5000);
    expect(forecast.recurringExpenses).toBe(1500);
    expect(forecast.recurringSavings).toBe(500);
    expect(forecast.debtPayments).toBe(300);
    // 1000 + 5000 - 1500 - 500 - 300
    expect(forecast.projectedEndBalance).toBe(3700);
    expect(forecast.activePayments).toHaveLength(3);
    expect(forecast.monthlyProjection).toMatchObject([
      { month: "2026-03", startingBalance: 1000, projectedEndBalance: 3700 },
      { month: "2026-04", startingBalance: 3700, projectedEndBalance: 6400 },
      { month: "2026-05", startingBalance: 6400, projectedEndBalance: 9100 },
    ]);
    expect(forecast.upcomingPayments.map((payment) => payment.name)).toEqual(["Rent", "Goal", "Salary", "Card"]);
  });
});

describe("buildUpcomingPayments", () => {
  it("builds a sorted due list from active recurring items and debts", () => {
    const payments = buildUpcomingPayments(
      state({
        debts: [
          { id: "d", name: "Card", currentBalance: 200, monthlyPayment: 300, dueDate: "2026-01-20", notes: "" },
          { id: "n", name: "No date", currentBalance: 100, monthlyPayment: 50, dueDate: "", notes: "" },
        ],
        recurringPayments: [
          { id: "r", name: "Rent", type: "Gasto", category: "Home", amount: 1500, dueDay: 1, active: true },
          { id: "i", name: "Salary", type: "Ingreso", category: "Salary", amount: 5000, dueDay: 31, active: true },
          { id: "x", name: "Inactive", type: "Gasto", category: "Old", amount: 10, dueDay: 2, active: false },
        ],
      }),
      "2026-02",
    );

    expect(payments).toMatchObject([
      { name: "Rent", dueDate: "2026-02-01", kind: "recurring", sourceId: "r" },
      { name: "Card", dueDate: "2026-02-20", kind: "debt", amount: 200, sourceId: "d" },
      { name: "Salary", dueDate: "2026-02-28", kind: "recurring", sourceId: "i" },
      { name: "No date", dueDate: "", kind: "debt", sourceId: "n" },
    ]);
  });
});

describe("transactionFromRecurringPayment", () => {
  it("creates a transaction using the recurring payment fields", () => {
    const transaction = transactionFromRecurringPayment(
      { id: "r", name: " Rent ", type: "Gasto", category: " Home ", amount: 1500, dueDay: 1, active: true },
      "2026-03-05",
    );

    expect(transaction).toMatchObject({
      fecha: "2026-03-05",
      gastoIngresoAhorro: "Gasto",
      categoria: "Home",
      subcategoria: "Recurring",
      descripcion: "Rent",
      monto: 1500,
    });
    expect(transaction.id).toMatch(/^transaction_/);
  });
});

describe("debt payment helpers", () => {
  const debt: Debt = {
    id: "d",
    name: " Credit card ",
    currentBalance: 1000,
    monthlyPayment: 300,
    dueDate: "",
    notes: "",
  };

  it("creates an expense transaction from a debt payment", () => {
    const transaction = transactionFromDebtPayment(debt, "2026-03-05");
    expect(transaction).toMatchObject({
      fecha: "2026-03-05",
      gastoIngresoAhorro: "Gasto",
      categoria: "Debt payment",
      subcategoria: "Credit card",
      descripcion: "Credit card payment",
      monto: 300,
    });
  });

  it("reduces debt balance without going below zero", () => {
    expect(applyDebtPayment(debt).currentBalance).toBe(700);
    expect(applyDebtPayment({ ...debt, currentBalance: 100, monthlyPayment: 300 }).currentBalance).toBe(0);
  });
});

describe("buildHealthIssues", () => {
  it("flags invalid dates, non-positive amounts, and empty labels", () => {
    const issues = buildHealthIssues(
      state({
        transactions: [
          tx({ id: "bad", fecha: "nope", monto: 0, categoria: "", descripcion: "" }),
          tx({ id: "ok" }),
        ],
      }),
    );
    const titles = issues.map((i) => i.title);
    expect(titles).toContain("Transaction has an invalid date");
    expect(titles).toContain("Transaction amount is zero or negative");
    expect(titles).toContain("Transaction has no category");
    expect(titles).toContain("Transaction has no description");
  });

  it("flags a debt with a balance but no monthly payment", () => {
    const debts: Debt[] = [{ id: "d", name: "Card", currentBalance: 500, monthlyPayment: 0, dueDate: "", notes: "" }];
    const issues = buildHealthIssues(state({ debts }));
    expect(issues.map((i) => i.title)).toContain("Debt has no monthly payment");
  });

  it("flags duplicate transactions", () => {
    const issues = buildHealthIssues(
      state({
        transactions: [
          tx({ id: "first", categoria: "Food", descripcion: "Lunch" }),
          tx({ id: "duplicate", categoria: " food ", descripcion: "lunch" }),
        ],
      }),
    );
    expect(issues.map((i) => i.title)).toContain("Transaction appears more than once");
  });

  it("flags negative savings and inactive recurring items", () => {
    const savingsAccounts: SavingsAccount[] = [{ id: "s", bankName: "Lulo", balance: -10 }];
    const recurringPayments: RecurringPayment[] = [
      { id: "r", name: "Old", type: "Gasto", category: "Old", amount: 100, dueDay: 1, active: false },
    ];
    const titles = buildHealthIssues(state({ savingsAccounts, recurringPayments })).map((i) => i.title);
    expect(titles).toContain("Savings balance is negative");
    expect(titles).toContain("Recurring item is inactive");
  });

  it("flags incomplete budgets", () => {
    const titles = buildHealthIssues(
      state({ budgets: [{ id: "b", category: "", monthlyLimit: 0 }] }),
    ).map((i) => i.title);
    expect(titles).toContain("Budget has no category");
    expect(titles).toContain("Budget limit is zero or negative");
  });

  it("flags incomplete and duplicate categories", () => {
    const categories: Category[] = [
      { id: "c1", name: "", type: "Gasto", color: "#D4AF37" },
      { id: "c2", name: "Food", type: "Gasto", color: "#D4AF37" },
      { id: "c3", name: " food ", type: "Ingreso", color: "#2A5699" },
      { id: "c4", name: "Broken", type: "Otro" as Category["type"], color: "#B33030" },
    ];
    const titles = buildHealthIssues(state({ categories })).map((i) => i.title);
    expect(titles).toContain("Category has no name");
    expect(titles).toContain("Category appears more than once");
    expect(titles).toContain("Category has an invalid type");
  });

  it("flags unmanaged categories only after managed categories exist", () => {
    const unmanagedState = state({
      budgets: [{ id: "b", category: "Transport", monthlyLimit: 1000 }],
      categories: [{ id: "c", name: "Food", type: "Gasto", color: "#D4AF37" }],
      recurringPayments: [{ id: "r", name: "Rent", type: "Gasto", category: "Rent", amount: 1000, dueDay: 1, active: true }],
      transactions: [tx({ id: "t", categoria: "Transport" })],
    });
    const titles = buildHealthIssues(unmanagedState).map((i) => i.title);
    expect(titles).toContain("Transaction category is not managed");
    expect(titles).toContain("Budget category is not managed");
    expect(titles).toContain("Recurring category is not managed");

    const withoutManagedCategories = buildHealthIssues(state({ transactions: [tx({ id: "t", categoria: "Transport" })] })).map(
      (i) => i.title,
    );
    expect(withoutManagedCategories).not.toContain("Transaction category is not managed");
  });

  it("returns no issues for clean data", () => {
    expect(buildHealthIssues(state({ transactions: [tx({ id: "ok" })] }))).toEqual([]);
  });
});

describe("clampDueDay", () => {
  it("clamps into the 1..31 range and rounds", () => {
    expect(clampDueDay(0)).toBe(1);
    expect(clampDueDay(45)).toBe(31);
    expect(clampDueDay(15.6)).toBe(16);
  });

  it("falls back to 1 for non-finite values", () => {
    expect(clampDueDay(Number.NaN)).toBe(1);
  });
});

describe("uniqueSorted", () => {
  it("dedupes on whitespace-normalized value, drops blanks, and sorts", () => {
    // Case is intentionally preserved (these feed autocomplete suggestions),
    // so "Food" and "food" remain distinct; only the whitespace variant collapses.
    expect(uniqueSorted(["  Food ", "Food", "food", "Transport", ""])).toEqual(["food", "Food", "Transport"]);
  });
});

describe("CSV row parsers", () => {
  it("parses a transaction row using the Spanish sheet headers", () => {
    const header = ["Fecha", "Gasto/Ingreso/Ahorro", "Categoria", "Subcategoria", "Descripcion", "Monto"];
    const row = ["26/1/2026", "Ingreso", "Ahorro Lulo", "Liquidez", "Salario", " $  2,434,714.12 "];
    const parsed = parseTransactionRow(header, row);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      fecha: "26/1/2026",
      gastoIngresoAhorro: "Ingreso",
      categoria: "Ahorro Lulo",
      subcategoria: "Liquidez",
      descripcion: "Salario",
      monto: 2434714.12,
    });
    expect(parsed?.id).toMatch(/^transaction_/);
  });

  it("returns null when a required transaction field is missing", () => {
    const header = ["Fecha", "Gasto/Ingreso/Ahorro", "Categoria", "Descripcion", "Monto"];
    const row = ["", "Gasto", "Food", "Lunch", "1000"]; // empty fecha
    expect(parseTransactionRow(header, row)).toBeNull();
  });

  it("parses recurring payments with header aliases and boolean coercion", () => {
    const header = ["name", "type", "category", "amount", "due_day", "active"];
    const parsed = parseRecurringPaymentRow(header, ["Rent", "Gasto", "Home", "1500", "40", "no"]);
    expect(parsed).toMatchObject({ name: "Rent", type: "Gasto", amount: 1500, dueDay: 31, active: false });
  });

  it("parses budgets with Spanish header aliases", () => {
    const header = ["Categoria", "Presupuesto"];
    const parsed = parseBudgetRow(header, ["Food", "250000"]);
    expect(parsed).toMatchObject({ category: "Food", monthlyLimit: 250000 });
    expect(parsed?.id).toMatch(/^budget_/);
  });

  it("parses categories with Spanish header aliases", () => {
    const header = ["Nombre", "Tipo", "Color"];
    const parsed = parseCategoryRow(header, ["Food", "gasto", "#b33030"]);
    expect(parsed).toMatchObject({ name: "Food", type: "Gasto", color: "#B33030" });
    expect(parsed?.id).toMatch(/^category_/);
  });
});

describe("normalizers", () => {
  it("normalizes transaction types and rejects unknown", () => {
    expect(normalizeTransactionType("ingreso")).toBe("Ingreso");
    expect(normalizeTransactionType("GASTO")).toBe("Gasto");
    expect(normalizeTransactionType("weird")).toBeNull();
  });

  it("treats explicit falsey words as false, everything else true", () => {
    expect(normalizeBoolean("no")).toBe(false);
    expect(normalizeBoolean("inactivo")).toBe(false);
    expect(normalizeBoolean("0")).toBe(false);
    expect(normalizeBoolean("yes")).toBe(true);
    expect(normalizeBoolean("")).toBe(true);
  });

  it("normalizes valid hex colors and rejects invalid colors", () => {
    expect(normalizeColor("#b33030")).toBe("#B33030");
    expect(normalizeColor("red")).toBe("");
  });
});

describe("coerceFinanceState", () => {
  it("unwraps a backup envelope and defaults missing arrays", () => {
    const result = coerceFinanceState({ version: 1, state: { transactions: [tx()] } });
    expect(result.transactions).toHaveLength(1);
    expect(result.savingsAccounts).toEqual([]);
    expect(result.debts).toEqual([]);
    expect(result.recurringPayments).toEqual([]);
    expect(result.budgets).toEqual([]);
    expect(result.categories).toEqual([]);
  });

  it("accepts a bare state object and rejects garbage", () => {
    expect(coerceFinanceState({ debts: [{ id: "d" }] }).debts).toHaveLength(1);
    expect(coerceFinanceState("nonsense")).toEqual({
      budgets: [],
      categories: [],
      recurringPayments: [],
      savingsAccounts: [],
      debts: [],
      transactions: [],
    });
  });
});

describe("credit card", () => {
  const card: Debt = {
    id: "cc",
    name: "Credit Card",
    currentBalance: 0,
    monthlyPayment: 0,
    dueDate: "",
    notes: "",
    isCreditCard: true,
    linkedCategory: "TC",
    cutoffDay: 5,
    payments: [],
  };

  const charges: Transaction[] = [
    tx({ id: "c1", fecha: "2026-03-02", gastoIngresoAhorro: "Gasto", categoria: "TC", monto: 100000 }),
    tx({ id: "c2", fecha: "2026-03-04", gastoIngresoAhorro: "Gasto", categoria: " tc ", monto: 50000 }),
    tx({ id: "c3", fecha: "2026-03-10", gastoIngresoAhorro: "Gasto", categoria: "TC", monto: 30000 }),
    tx({ id: "other", fecha: "2026-03-03", gastoIngresoAhorro: "Gasto", categoria: "Food", monto: 9999 }),
    tx({ id: "income", fecha: "2026-03-03", gastoIngresoAhorro: "Ingreso", categoria: "TC", monto: 7777 }),
  ];

  it("collects only linked-category Gasto rows (case/space-insensitive)", () => {
    expect(creditCardCharges(card, charges).map((t) => t.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("derives the live balance as charges minus payments, floored at 0", () => {
    expect(creditCardBalance(card, charges)).toBe(180000);
    const paid = { ...card, payments: [{ id: "p", date: "2026-03-06", amount: 150000 }] };
    expect(creditCardBalance(paid, charges)).toBe(30000);
    const overpaid = { ...card, payments: [{ id: "p", date: "2026-03-06", amount: 999999 }] };
    expect(creditCardBalance(overpaid, charges)).toBe(0);
  });

  it("freezes the statement at the cutoff day and flags closed", () => {
    // On the 6th the cycle has closed; charges on/before the 5th (c1+c2) are due.
    const statement = creditCardStatement(card, charges, "2026-03-06");
    expect(statement.closed).toBe(true);
    expect(statement.cutoffDate).toBe("2026-03-05");
    expect(statement.amountDue).toBe(150000);
  });

  it("uses last month's cutoff before this month's cutoff day", () => {
    const statement = creditCardStatement(card, charges, "2026-03-03");
    expect(statement.closed).toBe(false);
    expect(statement.cutoffDate).toBe("2026-02-05");
    expect(statement.amountDue).toBe(0);
  });

  it("records a payment without creating an expense", () => {
    const { debt, payment } = applyCreditCardPayment(card, 180000, "2026-03-06", "saving_1");
    expect(debt.payments).toHaveLength(1);
    expect(payment).toMatchObject({ amount: 180000, date: "2026-03-06", fromAccountId: "saving_1" });
    expect(creditCardBalance(debt, charges)).toBe(0);
  });

  it("effectiveDebtBalance derives for cards and passes through for plain debts", () => {
    expect(effectiveDebtBalance(card, charges)).toBe(180000);
    const loan: Debt = { id: "l", name: "Loan", currentBalance: 500000, monthlyPayment: 100000, dueDate: "", notes: "" };
    expect(effectiveDebtBalance(loan, charges)).toBe(500000);
  });

  it("isCreditCard requires the flag and a linked category", () => {
    expect(isCreditCard(card)).toBe(true);
    expect(isCreditCard({ ...card, linkedCategory: "" })).toBe(false);
    expect(isCreditCard({ ...card, isCreditCard: false })).toBe(false);
  });
});
