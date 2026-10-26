const LEVELS = { log: 'info', info: 'info', warn: 'warn', error: 'error', debug: 'debug', trace: 'trace', dir: 'debug' };

/** Serialize diagnostic values, including non-enumerable exception details.
 * @param {unknown} value
 * @param {Set<object>} ancestors
 * @returns {unknown}
 */
function serialize(value, ancestors = new Set()) {
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function') return '[Function]';
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) return '[Circular]';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (ancestors.size >= 32) return '[Max depth]';
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map(item => serialize(item, ancestors));
  } else {
    const keys = value instanceof Error
      ? [...new Set(['name', 'message', 'stack', ...Object.getOwnPropertyNames(value)])]
      : Object.keys(value);
    result = Object.fromEntries(keys.map(key => {
      try {
        return [key, serialize(value[key], ancestors)];
      } catch {
        return [key, '[Unserializable]'];
      }
    }));
  }
  ancestors.delete(value);
  return result;
}

/** Route application console calls to JSON lines; preserve conversation records.
 * Install once at each production entrypoint, before loading application modules.
 * @param {Object} [options]
 * @param {Console|Object} [options.target]
 * @param {(line: string) => void} [options.stdout]
 * @param {(line: string) => void} [options.stderr]
 */
export function installStructuredLogging({
  target = console,
  stdout = line => process.stdout.write(line),
  stderr = line => process.stderr.write(line)
} = {}) {
  for (const [method, level] of Object.entries(LEVELS)) {
    target[method] = (...args) => {
      try {
        if (method === 'log' && args.length === 1 && typeof args[0] === 'string') {
          try {
            if (JSON.parse(args[0])?.event === 'telegram_conversation') {
              stdout(`${args[0]}\n`);
              return;
            }
          } catch { /* Ordinary text is wrapped below. */ }
        }
        const [first, ...rest] = args;
        const values = typeof first === 'string' ? rest : args;
        const error = values.find(value => value instanceof Error);
        const data = values.filter(value => value !== error);
        const record = {
          level,
          time: new Date().toISOString(),
          service: 'ridebot',
          msg: typeof first === 'string' ? first : error?.message || '',
          ...(error ? { err: serialize(error) } : {}),
          ...(data.length ? { data: serialize(data) } : {})
        };
        const write = level === 'error' || level === 'warn' ? stderr : stdout;
        write(`${JSON.stringify(record)}\n`);
      } catch {
        // Diagnostics must never interrupt the operation being logged.
      }
    };
  }
}
