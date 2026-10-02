import { Injectable, type LoggerService } from '@nestjs/common';
import { env } from '../config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Regla de filtrado, aislada y pura (probable sin depender del entorno). */
export function isLevelEnabled(level: LogLevel, configured: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[configured];
}

/**
 * Logger en una línea JSON por evento (mismo formato que atiende/cv-harness).
 *
 * Sin parámetros de constructor A PROPÓSITO: un parámetro con valor por defecto
 * hace que Nest lo tome como dependencia y el contenedor no arranca. El nivel
 * sale de la configuración ya validada (decisión de boot, no cambia en caliente).
 */
@Injectable()
export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('error', message, context);
  }

  private write(level: LogLevel, message: unknown, context?: string, trace?: string): void {
    if (!isLevelEnabled(level, env.LOG_LEVEL)) return;

    const payload: Record<string, unknown> = {
      ...(this.normalize(message) as Record<string, unknown>),
      ...(context ? { context } : {}),
      level,
      time: new Date().toISOString(),
    };
    if (trace) payload.trace = trace;

    const line = `${JSON.stringify(payload)}\n`;
    if (level === 'error') process.stderr.write(line);
    else process.stdout.write(line);
  }

  private normalize(message: unknown): Record<string, unknown> {
    if (typeof message === 'string') return { msg: message };
    if (message instanceof Error) return { msg: message.message, stack: message.stack };
    if (message && typeof message === 'object') return message as Record<string, unknown>;
    return { msg: String(message) };
  }
}
