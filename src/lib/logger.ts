import "server-only";

type LogContext = Record<string, unknown>;

// Thin wrapper so we can swap in a real logger (pino, Sentry, etc.) later.
export const logger = {
  error(message: string, error: unknown, context: LogContext = {}): void {
    const detail = error instanceof Error ? { name: error.name, message: error.message } : { error };
    console.error(JSON.stringify({ level: "error", message, ...detail, ...context }));
  },
  warn(message: string, context: LogContext = {}): void {
    console.warn(JSON.stringify({ level: "warn", message, ...context }));
  },
};
