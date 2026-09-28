import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db =
  | ReturnType<typeof drizzleNeon<typeof schema>>
  | ReturnType<typeof drizzlePostgres<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __financeDb?: Db;
};

function isLocalPostgres(url: string) {
  return (
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("@db:") // docker compose service name
  );
}

function createDb(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local — use Neon pooled URL (or local Docker).",
    );
  }

  // Local Docker / self-hosted: node postgres driver
  if (isLocalPostgres(connectionString)) {
    const client = postgres(connectionString, { prepare: false, max: 10 });
    return drizzlePostgres(client, { schema });
  }

  // Neon / serverless: HTTP driver + pooled DATABASE_URL
  const sql = neon(connectionString);
  return drizzleNeon(sql, { schema });
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const instance = globalForDb.__financeDb ?? createDb();
    if (process.env.NODE_ENV !== "production") {
      globalForDb.__financeDb = instance;
    }
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(instance)
      : value;
  },
});
