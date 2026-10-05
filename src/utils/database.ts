import "dotenv/config";
import { Pool, QueryConfig, QueryResultRow } from "pg";
import migrate from "node-pg-migrate";
import path from "path";
import { WithdrawalStore } from "../models/withdrawal";

const isExternalRenderHost =
  process.env.PGHOST?.includes("runsite.app") ||
  process.env.PGHOST?.includes("render.com");

const isRenderHost =
  isExternalRenderHost || Boolean(process.env.PGHOST?.startsWith("dpg-"));

const sslConfig =
  process.env.PGSSLMODE === "no-verify" ||
  process.env.PGSSLMODE === "require" ||
  isExternalRenderHost
    ? { rejectUnauthorized: false }
    : undefined;

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl:
          process.env.DATABASE_URL.includes("sslmode=no-verify") ||
          process.env.DATABASE_URL.includes("sslmode=require") ||
          isRenderHost
            ? { rejectUnauthorized: false }
            : undefined,
      }
    : sslConfig
    ? { ssl: sslConfig }
    : undefined,
);

export function setupStore() {
  return WithdrawalStore.getInstance(pool);
}

export async function setupDatabase(retries = 5, delayMs = 2000) {
  let host = process.env.PGHOST || "";
  let port = process.env.PGPORT || 5432;
  if (host.includes(":")) {
    const parts = host.split(":");
    host = parts[0];
    if (parts[1]) {
      port = parts[1];
    }
  }
  const sslParam =
    process.env.PGSSLMODE
      ? `?sslmode=${process.env.PGSSLMODE}`
      : isExternalRenderHost
      ? "?sslmode=no-verify"
      : "";

  if (
    !process.env.DATABASE_URL &&
    (!process.env.PGUSER || !host || !process.env.PGDATABASE)
  ) {
    throw new Error(
      "Missing PostgreSQL configuration. Please ensure PGUSER, PGPASSWORD, PGHOST, and PGDATABASE (or DATABASE_URL) are set in your environment.",
    );
  }

  let databaseUrl =
    process.env.DATABASE_URL ||
    `postgres://${process.env.PGUSER}:${encodeURIComponent(
      process.env.PGPASSWORD || "",
    )}@${host}:${port}/${process.env.PGDATABASE}${sslParam}`;

  if (databaseUrl.includes("runsite.app") && !databaseUrl.includes("sslmode=")) {
    const separator = databaseUrl.includes("?") ? "&" : "?";
    databaseUrl = `${databaseUrl}${separator}sslmode=no-verify`;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await migrate({
        databaseUrl,
        dir: "migrations",
        direction: "up",
        migrationsTable: "pgmigrations",
        count: Infinity,
        log: console.log,
      });
      return;
    } catch (err) {
      if (attempt === retries) {
        throw err;
      }
      console.warn(
        `Database connection/migration failed (attempt ${attempt}/${retries}). Retrying in ${delayMs / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 1.5, 10000);
    }
  }
}

export async function getDbClient() {
  return await pool.connect();
}

export function queryWrapper<T extends QueryResultRow>(
  query: string | QueryConfig<any[]>,
  values: any[],
) {
  return pool.query<T>(query, values);
}

export function createBulkInsertPayload(
  columnArray: string[],
  nestedValueArray: any[][],
) {
  let counter = 1;
  const sanitizedValueArray: string[] = [];
  nestedValueArray.forEach((innerArray) => {
    if (columnArray.length !== innerArray.length) {
      throw new Error("Value-Column mismatch");
    }
    const innerSanitizedValueArray: string[] = [];
    for (let i = 0; i < innerArray.length; i++) {
      innerSanitizedValueArray.push(`$${counter}`);
      counter++;
    }
    sanitizedValueArray.push(innerSanitizedValueArray.join(","));
  });
  const valueStrings = sanitizedValueArray
    .map((innerValue) => `(${innerValue})`)
    .join(",");
  return { valueString: valueStrings, flatValues: nestedValueArray.flat() };
}

export function createBulkInsertQuery<T extends QueryResultRow>(
  tableName: string,
  columnArray: string[],
  nestedValueArray: any[][],
) {
  const payload = createBulkInsertPayload(columnArray, nestedValueArray);
  const query = `INSERT INTO ${tableName} (${columnArray.join(",")}) VALUES ${
    payload.valueString
  };`;
  return pool.query<T>(query, payload.flatValues);
}

export function createSanitizedValueString(n) {
  return `(${Array.from({ length: n }, (_, i) => `$${i + 1}`).join(", ")})`;
}
