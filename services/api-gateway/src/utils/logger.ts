/**
 * Logger estruturado (JSON por linha) — sem payloads dinâmicos: apenas valores primitivos tipados.
 * Usado também como log de auditoria de descartes (400) e contingências (502/503/504).
 */
export type LogValue = string | number | boolean | null;
export type LogFields = Readonly<{ [campo: string]: LogValue | readonly LogValue[] }>;

type LogLevel = 'info' | 'warn' | 'error' | 'audit';

function write(level: LogLevel, evento: string, campos: LogFields): void {
  const linha = JSON.stringify({ ts: new Date().toISOString(), level, evento, ...campos });
  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${linha}\n`);
  } else {
    process.stdout.write(`${linha}\n`);
  }
}

export const logger = {
  info: (evento: string, campos: LogFields = {}): void => write('info', evento, campos),
  warn: (evento: string, campos: LogFields = {}): void => write('warn', evento, campos),
  error: (evento: string, campos: LogFields = {}): void => write('error', evento, campos),
  audit: (evento: string, campos: LogFields = {}): void => write('audit', evento, campos),
};
