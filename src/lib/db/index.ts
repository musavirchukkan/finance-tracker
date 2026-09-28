import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __financeDb?: Db;
  __financeSql?: ReturnType<typeof postgres>;
};

function createDb(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon/Postgres URL.",
    );
  }

  const client =
    globalForDb.__financeSql ??
    postgres(connectionString, { prepare: false, max: 10 });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__financeSql = client;
  }

  return drizzle(client, { schema });
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const instance = globalForDb.__financeDb ?? createDb();
    if (process.env.NODE_ENV !== "production") {
      globalForDb.__financeDb = instance;
    }
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
