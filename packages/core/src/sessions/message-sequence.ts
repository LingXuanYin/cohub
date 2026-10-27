import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sessionMessages } from "@cohub/db";

type Database = Pick<PostgresJsDatabase<Record<string, unknown>>, "select">;

const SEQUENCE_CONSTRAINT = "v2_uq_session_messages_session_sequence";
const MAX_ATTEMPTS = 4;

function isSequenceConflict(error: unknown): boolean {
  for (let current = error, depth = 0; current && typeof current === "object" && depth < 5; depth += 1) {
    const record = current as { code?: unknown; constraint?: unknown; constraint_name?: unknown; cause?: unknown };
    if (record.code === "23505") return (record.constraint_name ?? record.constraint) === SEQUENCE_CONSTRAINT;
    current = record.cause;
  }
  return false;
}

/** Writers share no lock, so a concurrent append can take the same `max + 1`; retry then. */
export async function withNextSessionMessageSequence<T>(db: Database, sessionId: string, insert: (sequence: number) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const [row] = await db.select({ max: sql<number>`coalesce(max(${sessionMessages.sequence}), 0)::int` })
      .from(sessionMessages).where(eq(sessionMessages.sessionId, sessionId));
    try {
      return await insert((row?.max ?? 0) + 1);
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isSequenceConflict(error)) throw error;
    }
  }
}
