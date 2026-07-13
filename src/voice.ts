import { normalizeLabel } from "./format";
import type { TransactionType } from "./types";

export type VoiceTransactionDraft = {
  categoria: string;
  descripcion: string;
  gastoIngresoAhorro: TransactionType;
  monto: number;
  subcategoria: string;
  transcript: string;
};

const numberWords: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};

function normalizedWords(value: string) {
  return normalizeLabel(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d)[,.](\d{3}\b)/g, "$1$2")
    .replace(/([a-z])(mil|millon|millones)\b/g, "$1 $2")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isAmountWord(word: string) {
  return word === "y" || word === "mil" || word === "millon" || word === "millones" || /^\d+$/.test(word) || word in numberWords;
}

export function parseSpanishAmount(words: string[]) {
  let total = 0;
  let current = 0;
  for (const word of words) {
    if (word === "y") continue;
    if (/^\d+$/.test(word)) {
      current += Number(word);
    } else if (word in numberWords) {
      current += numberWords[word];
    } else if (word === "mil") {
      total += (current || 1) * 1000;
      current = 0;
    } else if (word === "millon" || word === "millones") {
      total += (current || 1) * 1000000;
      current = 0;
    } else {
      return 0;
    }
  }
  return total + current;
}

function matchPrefix(words: string[], options: string[]) {
  const normalizedOptions = options
    .map((option) => ({ option, words: normalizedWords(option) }))
    .filter((item) => item.words.length)
    .sort((a, b) => b.words.length - a.words.length);
  return normalizedOptions.find((item) => item.words.every((word, index) => words[index] === word));
}

export function parseVoiceTransaction(transcript: string, categories: string[], subcategories: string[]): VoiceTransactionDraft | { error: string } {
  const words = normalizedWords(transcript);
  const typeWord = words.shift();
  const gastoIngresoAhorro = typeWord === "gasto" ? "Gasto" : typeWord === "ingreso" ? "Ingreso" : null;
  if (!gastoIngresoAhorro) return { error: "Start with Gasto or Ingreso." };

  let amountStart = words.length;
  while (amountStart > 0 && isAmountWord(words[amountStart - 1])) amountStart -= 1;
  const monto = parseSpanishAmount(words.slice(amountStart));
  if (!monto) return { error: "Say an amount last, for example treinta mil." };

  const category = matchPrefix(words, categories) || (words[0] ? { option: words[0], words: [words[0]] } : null);
  if (!category) return { error: "Say a category after Gasto or Ingreso." };
  const afterCategory = words.slice(category.words.length);
  const subcategory = matchPrefix(afterCategory, subcategories) || (afterCategory[0] ? { option: afterCategory[0], words: [afterCategory[0]] } : null);
  if (!subcategory) return { error: "Say a subcategory after the category." };
  const description = afterCategory.slice(subcategory.words.length, amountStart - category.words.length).join(" ");
  if (!description) return { error: "Say a description before the amount." };

  return {
    gastoIngresoAhorro,
    categoria: category.option.toLowerCase() === "tc" ? "TC" : category.option,
    subcategoria: subcategory.option,
    descripcion: description.replace(/\b\w/g, (letter) => letter.toUpperCase()),
    monto,
    transcript,
  };
}
