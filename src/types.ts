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

export type CardPayment = {
  id: string;
  date: string;
  amount: number;
  fromAccountId?: string;
};

export type Debt = {
  id: string;
  name: string;
  currentBalance: number;
  monthlyPayment: number;
  dueDate: string;
  notes: string;
  // Credit-card mode: when isCreditCard is true, the balance is DERIVED from
  // linked-category expenses minus payments (currentBalance is ignored for
  // display). Optional so existing debts and JSON backups stay valid.
  isCreditCard?: boolean;
  linkedCategory?: string;
  cutoffDay?: number;
  payments?: CardPayment[];
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

export type Budget = {
  id: string;
  category: string;
  monthlyLimit: number;
};

export type Category = {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
};

export type FinanceState = {
  budgets: Budget[];
  categories: Category[];
  recurringPayments: RecurringPayment[];
  savingsAccounts: SavingsAccount[];
  debts: Debt[];
  transactions: Transaction[];
};
