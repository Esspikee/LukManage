import type { Debt, FinanceState, RecurringPayment, SavingsAccount, Transaction } from "./types";

const STORAGE_KEY = "personal-finance-local:v1";

const initialState: FinanceState = {
  recurringPayments: [],
  savingsAccounts: [],
  debts: [],
  transactions: [],
};

export function loadFinanceState(): FinanceState {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialState;

  try {
    const parsed = JSON.parse(raw) as FinanceState;
    return {
      recurringPayments: Array.isArray(parsed.recurringPayments) ? parsed.recurringPayments : [],
      savingsAccounts: Array.isArray(parsed.savingsAccounts) ? parsed.savingsAccounts : [],
      debts: Array.isArray(parsed.debts) ? parsed.debts : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    };
  } catch {
    return initialState;
  }
}

export function saveFinanceState(state: FinanceState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function newId(prefix: "saving" | "debt" | "transaction" | "recurring") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createSavingsAccount(input: Omit<SavingsAccount, "id">): SavingsAccount {
  return { id: newId("saving"), ...input };
}

export function createDebt(input: Omit<Debt, "id">): Debt {
  return { id: newId("debt"), ...input };
}

export function createTransaction(input: Omit<Transaction, "id">): Transaction {
  return { id: newId("transaction"), ...input };
}

export function createRecurringPayment(input: Omit<RecurringPayment, "id">): RecurringPayment {
  return { id: newId("recurring"), ...input };
}
