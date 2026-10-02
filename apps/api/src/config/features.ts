import { env } from './env';

/**
 * Feature flags derivadas del entorno, agrupadas por capacidad.
 *
 * Para qué: que el resto del código pregunte por CAPACIDAD y no por variables de
 * entorno sueltas (`features.llm.provider` en vez de leer `LLM_PROVIDER`).
 */
export interface Features {
  llm: {
    /** Proveedor principal resuelto (mock = sin llaves, determinístico). */
    provider: 'deepseek' | 'groq' | 'mock';
    /** Respaldo resuelto (null = ninguno). */
    fallback: 'deepseek' | 'groq' | null;
    /** Modelo del principal, tal como está en el `.env`. */
    model: string;
    maxTokens: number;
  };
  storage: {
    driver: 'local';
    dir: string;
    maxUploadBytes: number;
  };
}

/** Modelo que corresponde al proveedor principal. */
export function primaryModelFor(config: typeof env): string {
  switch (config.llmMode) {
    case 'deepseek':
      return config.DEEPSEEK_MODEL;
    case 'groq':
      return config.GROQ_MODEL;
    case 'mock':
      return 'mock';
    default: {
      const unknown: never = config.llmMode;
      throw new Error(`Proveedor de IA desconocido: ${String(unknown)}`);
    }
  }
}

export function buildFeatures(config: typeof env = env): Features {
  return {
    llm: {
      provider: config.llmMode,
      fallback: config.llmFallback,
      model: primaryModelFor(config),
      maxTokens: config.LLM_MAX_TOKENS,
    },
    storage: {
      driver: config.STORAGE_DRIVER,
      dir: config.DOCS_STORAGE_DIR,
      maxUploadBytes: config.MAX_UPLOAD_MB * 1024 * 1024,
    },
  };
}

export const features: Features = buildFeatures();
