import 'dotenv/config';
import { z } from 'zod';
import { resolveDatabaseUrl } from './database-url';

/**
 * Configuración validada al boot (fail-fast, patrón de atiende).
 *
 * Reglas que se respetan acá:
 *  - Un booleano se parsea con enum + transform, NUNCA con `z.coerce.boolean`:
 *    `z.coerce.boolean("false")` da `true` (string no vacío) y es un bug clásico.
 *  - `LLM_PROVIDER=auto` degrada a `mock` cuando no hay llaves: así el flujo
 *    completo corre E2E sin red ni gasto.
 *  - Si se pide un proveedor EXPLÍCITO sin su llave, se falla al boot en vez de
 *    arrancar con mock silencioso (el `superRefine` de abajo).
 */

/**
 * Valor de ejemplo que NUNCA debe llegar a un despliegue: el harness valida el
 * JWT que emite atiende, así que un secreto de ejemplo daría 401 en el dashboard
 * sin decir por qué. Se rechaza explícitamente en el `superRefine`.
 */
export const DEV_JWT_SECRET = 'dev-secret-change-me';

const boolFromEnv = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

/** Una URL mal formada tiene que fallar ACÁ, con el nombre de la variable. */
function isParseableUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** CSV → lista limpia (sin entradas vacías por comas de más). */
function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Número opcional: ausente o vacío = `undefined` (no 0 silencioso). */
const optionalNumber = () =>
  z.preprocess(
    (value) => (value === '' || value === undefined || value === null ? undefined : value),
    z.coerce.number().nonnegative().optional(),
  );

const envSchema = z
  .object({
    // ── Aplicación ─────────────────────────────────────────────────────────
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3300),
    CORS_ALLOWED_ORIGINS: z.string().default('*'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    TRUST_PROXY: z.coerce.number().default(0),

    // ── Base de datos / colas ──────────────────────────────────────────────
    // DATABASE_URL puede venir directo o derivarse de DATABASE_HOST/POSTGRES_*
    // (lo resuelve resolveDatabaseUrl).
    QUEUE_PREFIX: z.string().min(1).default('docharnes'),
    REDIS_URL: z
      .string()
      .min(1)
      .default('redis://localhost:6380')
      .refine(isParseableUrl, { message: 'REDIS_URL no es una URL válida (ej. redis://host:6379).' }),

    // ── IA (patrón adaptador: un puerto + un adaptador por proveedor) ──────
    LLM_PROVIDER: z.enum(['auto', 'deepseek', 'groq', 'mock']).default('auto'),
    LLM_FALLBACK: z.enum(['auto', 'deepseek', 'groq', 'none']).default('auto'),
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),
    LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    LLM_MAX_TOKENS: z.coerce.number().int().min(1).default(8192),
    LLM_PRICE_INPUT_PER_1M: optionalNumber(),
    LLM_PRICE_OUTPUT_PER_1M: optionalNumber(),

    DEEPSEEK_API_KEY: z.string().default(''),
    DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
    DEEPSEEK_BASE_URL: z.string().default(''),
    GROQ_API_KEY: z.string().default(''),
    GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
    GROQ_BASE_URL: z.string().default(''),

    // ── Almacenamiento ─────────────────────────────────────────────────────
    STORAGE_DRIVER: z.enum(['local']).default('local'),
    DOCS_STORAGE_DIR: z.string().min(1).default('./.data'),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(500).default(25),

    // ── Auth (JWT compartido con atiende) ─────────────────────────────────
    // Sin valor de ejemplo a propósito: vacío/ausente = el boot FALLA y lo dice,
    // en vez de arrancar y dar 401 en silencio (el peor caso: parece que el
    // harness está roto cuando en realidad falta copiar el secreto de atiende).
    JWT_SECRET: z.string().min(1, 'Falta JWT_SECRET: es el MISMO de atiende.').default(''),
    JWT_EXPIRES_IN: z.string().default('1d'),

    // ── Demo ───────────────────────────────────────────────────────────────
    SEED_DEMO: boolFromEnv('false'),
  })
  .superRefine((value, ctx) => {
    const missing = (variable: string, message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [variable], message });
    };

    /** Un proveedor se "usa" si es el principal o el respaldo. */
    const usedAsLlm = (provider: 'deepseek' | 'groq'): boolean =>
      value.LLM_PROVIDER === provider || value.LLM_FALLBACK === provider;

    const where = `LLM_PROVIDER="${value.LLM_PROVIDER}", LLM_FALLBACK="${value.LLM_FALLBACK}"`;

    if (usedAsLlm('deepseek') && value.DEEPSEEK_API_KEY.length === 0) {
      missing('DEEPSEEK_API_KEY', `Se pidió deepseek (${where}) pero DEEPSEEK_API_KEY está vacía.`);
    }
    if (usedAsLlm('groq') && value.GROQ_API_KEY.length === 0) {
      missing('GROQ_API_KEY', `Se pidió groq (${where}) pero GROQ_API_KEY está vacía.`);
    }

    if (value.JWT_SECRET === DEV_JWT_SECRET) {
      missing(
        'JWT_SECRET',
        'Es el valor de ejemplo. Copiá el JWT_SECRET REAL de atiende ' +
          '(`docker exec <atiende> printenv JWT_SECRET`): con el de ejemplo el dashboard da 401.',
      );
    }
  });

export type RawEnv = z.infer<typeof envSchema>;

/** Proveedor de IA efectivo tras resolver `auto`. */
export type LlmMode = 'deepseek' | 'groq' | 'mock';
/** Respaldo de IA (nunca puede ser el mismo que el principal ni `mock`). */
export type LlmFallback = 'deepseek' | 'groq';

export type Env = RawEnv & {
  databaseUrl: string;
  llmMode: LlmMode;
  llmFallback: LlmFallback | null;
  corsAllowedOrigins: string[];
};

/**
 * REDIS_URL se puede setear directo o derivarse de REDIS_HOST/REDIS_PORT/
 * REDIS_PASSWORD (mismo patrón que atiende).
 *
 * El default de dev local apunta al 6380 porque ahí publica cv-harness el
 * contenedor `redis` compartido (dentro de la red es `redis:6379`).
 */
export function resolveRedisUrl(input: NodeJS.ProcessEnv): string {
  const direct = input.REDIS_URL?.trim();
  if (direct) return direct;

  const host = input.REDIS_HOST?.trim();
  if (!host) return 'redis://localhost:6380';

  const port = input.REDIS_PORT?.trim() || '6379';
  const pass = input.REDIS_PASSWORD;
  const auth = pass ? `:${encodeURIComponent(pass)}@` : '';
  return `redis://${auth}${host}:${port}`;
}

function resolveLlmMode(parsed: RawEnv): LlmMode {
  if (parsed.LLM_PROVIDER === 'deepseek') return 'deepseek';
  if (parsed.LLM_PROVIDER === 'groq') return 'groq';
  if (parsed.LLM_PROVIDER === 'mock') return 'mock';
  if (parsed.DEEPSEEK_API_KEY.length > 0) return 'deepseek';
  if (parsed.GROQ_API_KEY.length > 0) return 'groq';
  return 'mock';
}

/**
 * Respaldo de IA: nunca el mismo que el principal, y nunca `mock` (caer a mock
 * devolvería null y el job se quedaría sin contenido sin decir por qué).
 */
export function resolveLlmFallback(parsed: RawEnv, primary: LlmMode): LlmFallback | null {
  if (parsed.LLM_FALLBACK === 'none') return null;

  const available: LlmFallback[] = [];
  if (parsed.GROQ_API_KEY.length > 0) available.push('groq');
  if (parsed.DEEPSEEK_API_KEY.length > 0) available.push('deepseek');

  if (parsed.LLM_FALLBACK === 'auto') {
    return available.find((provider) => provider !== primary) ?? null;
  }

  return parsed.LLM_FALLBACK === primary ? null : parsed.LLM_FALLBACK;
}

export function parseEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.parse({
    ...input,
    REDIS_URL: resolveRedisUrl(input),
  });

  const llmMode = resolveLlmMode(parsed);

  return {
    ...parsed,
    databaseUrl: resolveDatabaseUrl(input),
    llmMode,
    llmFallback: resolveLlmFallback(parsed, llmMode),
    corsAllowedOrigins: splitCsv(parsed.CORS_ALLOWED_ORIGINS),
  };
}

/** Formatea los errores de Zod en un mensaje accionable (no un dump crudo). */
export function formatEnvIssues(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.join('.') || '(raíz)';
    return `  · ${path}: ${issue.message}`;
  });
  return `Configuración inválida (.env):\n${lines.join('\n')}`;
}

function loadEnv(): Env {
  try {
    return parseEnv();
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(formatEnvIssues(error));
    }
    throw error;
  }
}

/** Instancia global parseada una vez (`dotenv/config` carga apps/api/.env). */
export const env: Env = loadEnv();
