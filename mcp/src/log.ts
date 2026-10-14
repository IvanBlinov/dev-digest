/** stdout is reserved for JSON-RPC; every log line goes to stderr as one JSON object. */
function write(level: 'info' | 'error', msg: string, data?: unknown): void {
  process.stderr.write(`${JSON.stringify({ level, msg, ...(data === undefined ? {} : { data }) })}\n`);
}

export const log = {
  info: (msg: string, data?: unknown) => write('info', msg, data),
  error: (msg: string, data?: unknown) => write('error', msg, data),
};
