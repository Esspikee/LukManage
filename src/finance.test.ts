import { describe, expect, it } from "vitest";
import {
  buildForecast,
  buildHealthIssues,
  buildReport,
  clampDueDay,
  coerceFinanceState,
  debtKey,
  normalizeBoolean,
  normalizeTransactionType,
  parseRecurringPaymentRow,
  parseTransactionRow,
  periodLabel,
  periodMonthLength,
  savingsKey,
  transactionDateParts,
  transactionKey,
  uniqueSorted,
} from "./finance";
import type { Debt, FinanceState, RecurringPayment, SavingsAccount, Transaction } from "./types";

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

  it("aggregates expenses by category, sorted descending", () => {
    const report = buildReport(transactions, "2026-06", "year");
    expect(report.categoryExpenses).toEqual([{ name: "Food", value: 2000 }]);
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
    );

    expect(forecast.recurringIncome).toBe(5000);
    expect(forecast.recurringExpenses).toBe(1500);
    expect(forecast.recurringSavings).toBe(500);
    expect(forecast.debtPayments).toBe(300);
    // 1000 + 5000 - 1500 - 500 - 300
    expect(forecast.projectedEndBalance).toBe(3700);
    expect(forecast.activePayments).toHaveLength(3);
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

  it("flags negative savings and inactive recurring items", () => {
    const savingsAccounts: SavingsAccount[] = [{ id: "s", bankName: "Lulo", balance: -10 }];
    const recurringPayments: RecurringPayment[] = [
      { id: "r", name: "Old", type: "Gasto", category: "Old", amount: 100, dueDay: 1, active: false },
    ];
    const titles = buildHealthIssues(state({ savingsAccounts, recurringPayments })).map((i) => i.title);
    expect(titles).toContain("Savings balance is negative");
    expect(titles).toContain("Recurring item is inactive");
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
});

describe("coerceFinanceState", () => {
  it("unwraps a backup envelope and defaults missing arrays", () => {
    const result = coerceFinanceState({ version: 1, state: { transactions: [tx()] } });
    expect(result.transactions).toHaveLength(1);
    expect(result.savingsAccounts).toEqual([]);
    expect(result.debts).toEqual([]);
    expect(result.recurringPayments).toEqual([]);
  });

  it("accepts a bare state object and rejects garbage", () => {
    expect(coerceFinanceState({ debts: [{ id: "d" }] }).debts).toHaveLength(1);
    expect(coerceFinanceState("nonsense")).toEqual({
      recurringPayments: [],
      savingsAccounts: [],
      debts: [],
      transactions: [],
    });
  });
});
