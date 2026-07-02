import type { Budget, Category, Debt, RecurringPayment, SavingsAccount, Transaction } from "./types";

// Persistence (load/save) now lives in ./persistence behind the FinanceRepository
// interface. This module keeps the pure entity factories and id generation.

export function newId(prefix: "saving" | "debt" | "transaction" | "recurring" | "budget" | "category") {
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

export function createBudget(input: Omit<Budget, "id">): Budget {
  return { id: newId("budget"), ...input };
}

export function createCategory(input: Omit<Category, "id">): Category {
  return { id: newId("category"), ...input };
}
