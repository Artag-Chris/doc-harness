import { env, type Env } from '../../config/env';
import { createDeepSeekProvider } from './deepseek/deepseek.provider';
import { createGroqProvider } from './groq/groq.provider';
import { MockLlmProvider } from './mock/mock.provider';
import type { LlmProviderPort } from './llm-provider.port';

/** Nombres de proveedor soportados (lista cerrada: el `.env` se valida contra ella). */
export type LlmProviderName = 'deepseek' | 'groq' | 'mock';

/**
 * Factory de proveedores: el ÚNICO lugar que sabe qué adaptador corresponde a
 * cada nombre. Agregar un proveedor = su adaptador + sumarlo acá.
 */
export function createLlmProvider(name: LlmProviderName, config: Env = env): LlmProviderPort {
  switch (name) {
    case 'deepseek':
      return createDeepSeekProvider(config);
    case 'groq':
      return createGroqProvider(config);
    case 'mock':
      return new MockLlmProvider();
    default: {
      const unknown: never = name;
      throw new Error(`Proveedor de IA desconocido: ${String(unknown)}`);
    }
  }
}
