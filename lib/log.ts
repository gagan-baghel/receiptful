/**
 * Lightweight structured logger. Emits one JSON object per line to stdout so
 * whatever the host (Docker, Vercel, systemd) pipes to is already log-shipper
 * ready. Levels are tuned to be cheap enough to leave in hot paths.
 *
 * Intentionally not a third-party dependency: pulling pino/winston is a
 * supply-chain risk for marginal value when all we need is a timestamped line.
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

type LogFields = Record<string, unknown>

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function activeLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined
  if (fromEnv && fromEnv in LEVEL_ORDER) return fromEnv
  return process.env.NODE_ENV === "production" ? "info" : "debug"
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel()]) return
  const record: LogFields = {
    t: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  }
  // Single-line output keeps log aggregators honest.
  const line = JSON.stringify(record, (_key, value) =>
    value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value,
  )
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n")
  } else {
    process.stdout.write(line + "\n")
  }
}

export const log = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
  child(bindings: LogFields) {
    return {
      debug: (message: string, fields?: LogFields) =>
        emit("debug", message, { ...bindings, ...fields }),
      info: (message: string, fields?: LogFields) =>
        emit("info", message, { ...bindings, ...fields }),
      warn: (message: string, fields?: LogFields) =>
        emit("warn", message, { ...bindings, ...fields }),
      error: (message: string, fields?: LogFields) =>
        emit("error", message, { ...bindings, ...fields }),
    }
  },
}
