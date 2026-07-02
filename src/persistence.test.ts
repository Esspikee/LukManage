import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, migrate } from "./persistence";
import type { FinanceState } from "./types";

function fullState(): FinanceState {
  return {
    budgets: [],
    categories: [],
    recurringPayments: [],
    savingsAccounts: [{ id: "s", bankName: "Lulo", balance: 100 }],
    debts: [],
    transactions: [],
  };
}

describe("migrate", () => {
  it("stamps the current schema version", () => {
    const result = migrate({ schemaVersion: CURRENT_SCHEMA_VERSION, state: fullState() });
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("preserves valid state through migration", () => {
    const state = fullState();
    expect(migrate({ schemaVersion: CURRENT_SCHEMA_VERSION, state }).state.savingsAccounts).toEqual(
      state.savingsAccounts,
    );
  });

  it("coerces a malformed persisted record into a safe full state", () => {
    // A record missing arrays (e.g. from a corrupted or partial write) must
    // not crash the app; every collection should default to [].
    const result = migrate({ schemaVersion: CURRENT_SCHEMA_VERSION, state: {} as FinanceState });
    expect(result.state).toEqual({
      budgets: [],
      categories: [],
      recurringPayments: [],
      savingsAccounts: [],
      debts: [],
      transactions: [],
    });
  });
});
