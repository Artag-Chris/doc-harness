import type { z } from 'zod';

/**
 * Puerto de proveedores de IA (patrón adaptador).
 *
 * El resto del sistema NO conoce a DeepSeek ni a Groq: pide texto o JSON por
 * este puerto. Cambiar de proveedor es registrar un adaptador y tocar el `.env`.
 *
 * Dos detalles del contrato:
 *  1. **`json()` devuelve `null` cuando no hay IA real** (modo `mock`). No es un
 *     error: es la señal para que el llamador use su respaldo determinístico y el
 *     flujo pueda correr E2E sin llaves ni red.
 *  2. **Todo JSON se valida con Zod antes de salir del adaptador.** Si el
 *     proveedor devuelve algo que no cumple, es `LlmInvalidJsonError`.
 */

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface LlmChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmChatRequest {
  system: string;
  messages: LlmChatMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  signal?: AbortSignal;
}

export interface LlmResult {
  text: string;
  provider: string;
  model: string;
  usage: LlmUsage;
  costUsd: number;
  latencyMs: number;
}

export interface LlmJsonRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  /** Nombre corto de la tarea, para logs y telemetría (p. ej. 'rewrite-document'). */
  task: string;
  /** Descripción legible del contrato que se le pasa al modelo. */
  hint?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface LlmJsonResult<T> {
  data: T;
  meta: LlmResult;
}

export interface LlmProviderPort {
  readonly name: string;
  readonly model: string;
  /** true = no hay IA real (mock determinístico). */
  readonly isMock: boolean;
  chat(request: LlmChatRequest): Promise<LlmResult>;
  json<T>(request: LlmJsonRequest<T>): Promise<LlmJsonResult<T> | null>;
  isHealthy(): Promise<boolean>;
}

/** Token de inyección del proveedor de IA (el router resuelto por configuración). */
export const LLM_PROVIDER_TOKEN = 'LLM_PROVIDER_TOKEN';
