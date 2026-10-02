/**
 * Diagnóstico de la capa de IA: `npm run llm:check`.
 *
 * Verifica que el proveedor configurado responda de verdad y que devuelva un JSON
 * que cumpla un contrato mínimo. Es la primera cosa a correr cuando "no genera
 * nada": casi siempre es un `mock` silencioso por falta de llave.
 */
import 'dotenv/config';
import { z } from 'zod';
import { env } from '../src/config/env';
import { createLlmProvider } from '../src/modules/llm/llm.factory';

const ProbeSchema = z.object({ ok: z.boolean(), echo: z.string() });

async function main(): Promise<void> {
  console.log(
    `Proveedor: ${env.llmMode} (respaldo: ${env.llmFallback ?? 'ninguno'}) · modelo: ${
      env.llmMode === 'deepseek'
        ? env.DEEPSEEK_MODEL
        : env.llmMode === 'groq'
          ? env.GROQ_MODEL
          : 'mock'
    }`,
  );

  const provider = createLlmProvider(env.llmMode);

  if (provider.isMock) {
    console.log('Modo mock: no hay llaves configuradas (DEEPSEEK_API_KEY vacía). El flujo corre sin IA.');
    return;
  }

  const healthy = await provider.isHealthy();
  console.log(`Disponibilidad: ${healthy ? 'OK' : 'FALLO'}`);

  const result = await provider.json<z.infer<typeof ProbeSchema>>({
    system: 'Respondé SOLO con JSON.',
    user: 'Devolvé { "ok": true, "echo": "pong" }.',
    schema: ProbeSchema,
    hint: '{ "ok": boolean, "echo": string }',
    task: 'llm-check',
  });

  if (!result) {
    console.log('El proveedor no devolvió JSON (modo mock).');
    return;
  }

  console.log('Respuesta válida:', JSON.stringify(result.data));
  console.log(`Modelo: ${result.meta.model} · latencia: ${result.meta.latencyMs} ms`);
}

void main().catch((err: unknown) => {
  process.stderr.write(`[llm:check] FALLO: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
