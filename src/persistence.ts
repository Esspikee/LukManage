import { openDB, type IDBPDatabase } from "idb";
import { coerceFinanceState } from "./finance";
import type { FinanceState } from "./types";

/**
 * Persistence layer for the finance state.
 *
 * The app talks to a `FinanceRepository` interface, not to a concrete store,
 * so the backend (IndexedDB today, potentially something else later) can be
 * swapped without touching feature code.
 *
 * Stored data is wrapped in a `PersistedRecord` carrying a `schemaVersion`.
 * When the data model changes (e.g. money to integer cents, managed
 * categories), bump CURRENT_SCHEMA_VERSION and append a migration; `migrate`
 * walks a record up to the current version on load. This lets us evolve the
 * model with one migration per change instead of ad-hoc reshaping.
 */

export const CURRENT_SCHEMA_VERSION = 1;

const DB_NAME = "money-manager";
const DB_VERSION = 1;
const STORE = "app";
const STATE_KEY = "financeState";
const LEGACY_LOCALSTORAGE_KEY = "personal-finance-local:v1";

export type PersistedRecord = {
  schemaVersion: number;
  state: FinanceState;
};

export interface FinanceRepository {
  load(): Promise<FinanceState>;
  save(state: FinanceState): Promise<void>;
}

/**
 * Migrations from schema version N to N+1. `migrations[i]` upgrades a state
 * from version (i + 1) to (i + 2). Empty for now — v1 is the initial model.
 */
const migrations: Array<(state: FinanceState) => FinanceState> = [];

export function migrate(record: PersistedRecord): PersistedRecord {
  let version = record.schemaVersion;
  let state = record.state;

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = migrations[version - 1];
    if (step) state = step(state);
    version += 1;
  }

  return { schemaVersion: CURRENT_SCHEMA_VERSION, state: coerceFinanceState(state) };
}

/** Reads the pre-IndexedDB localStorage blob, if it exists. */
export function readLegacyState(): FinanceState | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  if (!raw) return null;
  try {
    return coerceFinanceState(JSON.parse(raw));
  } catch {
    return null;
  }
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

export function createIndexedDbRepository(): FinanceRepository {
  return {
    async load() {
      const db = await getDb();
      const record = (await db.get(STORE, STATE_KEY)) as PersistedRecord | undefined;
      if (record) return migrate(record).state;

      // First run on IndexedDB: import the old localStorage data once, if any.
      const legacy = readLegacyState();
      if (legacy) {
        const migrated = migrate({ schemaVersion: CURRENT_SCHEMA_VERSION, state: legacy });
        await db.put(STORE, migrated, STATE_KEY);
        return migrated.state;
      }

      return coerceFinanceState({});
    },
    async save(state) {
      const db = await getDb();
      await db.put(STORE, { schemaVersion: CURRENT_SCHEMA_VERSION, state }, STATE_KEY);
    },
  };
}

export const repository: FinanceRepository = createIndexedDbRepository();
