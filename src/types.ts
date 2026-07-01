export type TransactionType = "Gasto" | "Ingreso" | "Ahorro";

export type Transaction = {
  id: string;
  fecha: string;
  gastoIngresoAhorro: TransactionType;
  categoria: string;
  subcategoria: string;
  descripcion: string;
  monto: number;
};

export type SavingsAccount = {
  id: string;
  bankName: string;
  balance: number;
};

export type Debt = {
  id: string;
  name: string;
  currentBalance: number;
  monthlyPayment: number;
  dueDate: string;
  notes: string;
};

export type RecurringPayment = {
  id: string;
  name: string;
  type: TransactionType;
  category: string;
  amount: number;
  dueDay: number;
  active: boolean;
};

export type FinanceState = {
  recurringPayments: RecurringPayment[];
  savingsAccounts: SavingsAccount[];
  debts: Debt[];
  transactions: Transaction[];
};
