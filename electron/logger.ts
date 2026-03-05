type LogLevel = 'info' | 'warn' | 'error' | 'perf';

type LogEntry = {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
};

const RECENT_LOG_LIMIT = 200;
const recentLogs: LogEntry[] = [];
const REDACTED_KEYS = new Set([
  'text',
  'rawText',
  'transcript',
  'transcriptFinal',
  'finalText',
  'partialText',
  'extraPhrases',
  'canonicalTerms',
  'terms',
]);

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry));
  }
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = REDACTED_KEYS.has(key) ? '[redacted]' : sanitizeValue(entry);
  }
  return out;
}

function sanitizeContext(context?: Record<string, unknown>) {
  if (!context) return undefined;
  return sanitizeValue(context) as Record<string, unknown>;
}

function stringifyContext(context?: Record<string, unknown>) {
  if (!context || Object.keys(context).length === 0) return '';
  try {
    return ` ${JSON.stringify(context)}`;
  } catch {
    return ' {"context":"unserializable"}';
  }
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };
  recentLogs.push(entry);
  if (recentLogs.length > RECENT_LOG_LIMIT) {
    recentLogs.splice(0, recentLogs.length - RECENT_LOG_LIMIT);
  }

  const line = `[${level}] ${entry.timestamp} ${message}${stringifyContext(context)}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logInfo(message: string, context?: Record<string, unknown>) {
  write('info', message, context);
}

export function logWarn(message: string, context?: Record<string, unknown>) {
  write('warn', message, context);
}

export function logError(message: string, context?: Record<string, unknown>) {
  write('error', message, context);
}

export function logPerf(message: string, context?: Record<string, unknown>) {
  write('perf', message, context);
}

export function getRecentLogs(limit = 50): LogEntry[] {
  const clamped = Math.max(1, Math.min(200, Math.round(limit)));
  return recentLogs.slice(-clamped).map((entry) => ({
    ...entry,
    context: sanitizeContext(entry.context),
  }));
}

export type { LogEntry, LogLevel };
