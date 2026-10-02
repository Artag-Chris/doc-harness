import type {
  LlmChatRequest,
  LlmJsonRequest,
  LlmJsonResult,
  LlmProviderPort,
  LlmResult,
} from './llm-provider.port';
import { LlmUnavailableError } from './llm.errors';

/**
 * Router de proveedores: principal → respaldo.
 *
 * Reglas:
 *  - Si no hay IA real (`mock`), `json()` devuelve `null` de una: el llamador cae
 *    a su respaldo determinístico.
 *  - Si ambos fallan, se lanza `LlmUnavailableError` con los DOS motivos.
 *  - `provider`/`model` del resultado son los del proveedor que contestó de verdad.
 */
export class LlmRouterService implements LlmProviderPort {
  constructor(
    private readonly primary: LlmProviderPort,
    private readonly fallback: LlmProviderPort | null = null,
  ) {}

  get name(): string {
    return 'router';
  }

  get model(): string {
    return this.primary.model;
  }

  get isMock(): boolean {
    return this.primary.isMock;
  }

  get primaryName(): string {
    return this.primary.name;
  }

  get fallbackName(): string | null {
    return this.fallback?.name ?? null;
  }

  async chat(request: LlmChatRequest): Promise<LlmResult> {
    try {
      return await this.primary.chat(request);
    } catch (error) {
      if (!this.fallback || this.primary.isMock) throw error;
      try {
        return await this.fallback.chat(request);
      } catch (fallbackError) {
        throw new LlmUnavailableError([
          `${this.primary.name}: ${describe(error)}`,
          `${this.fallback.name}: ${describe(fallbackError)}`,
        ]);
      }
    }
  }

  async json<T>(request: LlmJsonRequest<T>): Promise<LlmJsonResult<T> | null> {
    if (this.primary.isMock) return null;

    try {
      return await this.primary.json(request);
    } catch (error) {
      if (!this.fallback) throw error;
      try {
        return await this.fallback.json(request);
      } catch (fallbackError) {
        throw new LlmUnavailableError([
          `${this.primary.name}: ${describe(error)}`,
          `${this.fallback.name}: ${describe(fallbackError)}`,
        ]);
      }
    }
  }

  async isHealthy(): Promise<boolean> {
    if (await this.primary.isHealthy()) return true;
    return this.fallback ? this.fallback.isHealthy() : false;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
