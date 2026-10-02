import { env } from './env';

/**
 * Nombres de las colas BullMQ del flujo de documentos.
 *
 * BullMQ NO permite ':' en el nombre de la cola, así que el aislamiento entre
 * proyectos que comparten la misma Redis se hace con la opción `prefix` de Bull
 * (`QUEUE_PREFIX`, por defecto `docharnes`).
 *
 * El flujo es: GENERATE (IA) → RENDER (archivos). Se separan para poder
 * re-renderizar tras una edición SIN volver a llamar a la IA (que es la cara).
 * La extracción del archivo subido es síncrona al subir: es rápida y da vista
 * previa inmediata, sin una tercera cola que solo agregaría latencia.
 */
export const QUEUES = {
  GENERATE: 'generate',
  RENDER: 'render',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const parsedRedis = new URL(env.REDIS_URL);

/** Conexión compartida para BullMQ (producers y workers). */
export const bullConnection = {
  prefix: env.QUEUE_PREFIX,
  connection: {
    host: parsedRedis.hostname,
    port: Number(parsedRedis.port || 6379),
    username: parsedRedis.username ? decodeURIComponent(parsedRedis.username) : undefined,
    password: parsedRedis.password ? decodeURIComponent(parsedRedis.password) : undefined,
    maxRetriesPerRequest: null,
  },
};

/** Opciones de retry por defecto de los jobs. */
export const JOB_OPTIONS = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 3000 },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 7 * 86400 },
} as const;
