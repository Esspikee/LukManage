import type { Debt, RecurringPayment, SavingsAccount, Transaction } from "./types";

// Persistence (load/save) now lives in ./persistence behind the FinanceRepository
// interface. This module keeps the pure entity factories and id generation.

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
