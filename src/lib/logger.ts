import "server-only";

type LogContext = Record<string, unknown>;

// Only code and message: Postgres error details/hints can echo row values
// ("Failing row contains ...") and leak customer PII into logs.
function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (typeof error === "object" && error !== null) {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return {
      code: typeof code === "string" ? code : undefined,
      message: typeof message === "string" ? message : undefined,
    };
  }
  return { error: String(error) };
}

// Thin wrapper so we can swap in a real logger (pino, Sentry, etc.) later.
export const logger = {
  error(message: string, error: unknown, context: LogContext = {}): void {
    const detail = describeError(error);
    console.error(JSON.stringify({ level: "error", message, ...detail, ...context }));
  },
  warn(message: string, context: LogContext = {}): void {
    console.warn(JSON.stringify({ level: "warn", message, ...context }));
  },
};
