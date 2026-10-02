/**
 * ensure-database — corre en CADA boot, ANTES de `prisma migrate deploy`.
 *
 * Para qué existe: el harness tiene que poder levantarse sobre una base vacía
 * sin ningún paso manual de aprovisionamiento (el usuario copia el `.env` al
 * server y hace `docker compose up -d`; nada más).
 *
 * Crea la base destino si falta, conectándose a la base de mantenimiento
 * `postgres` del MISMO server y con las MISMAS credenciales.
 *
 * Es idempotente: se puede correr las veces que haga falta.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { databaseNameFromUrl, resolveDatabaseUrl, withDatabase } from '../src/config/database-url';

/**
 * El nombre de la base se INTERPOLA en un `CREATE DATABASE "..."` (Postgres no
 * admite parámetros ahí), así que la única defensa es validar el identificador.
 * Sin esto, un `DATABASE_URL` mal armado podría inyectar SQL en el boot.
 */
function assertSafeIdentifier(identifier: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(
      `Nombre de base inválido: "${identifier}". Solo se permiten letras, números y "_" ` +
        '(debe empezar con letra o "_"). Revisá POSTGRES_DB / DATABASE_URL.',
    );
  }
}

async function ensureDatabaseExists(targetUrl: string): Promise<string> {
  const database = databaseNameFromUrl(targetUrl);
  assertSafeIdentifier(database);
  const admin = new PrismaClient({
    datasources: { db: { url: withDatabase(targetUrl, 'postgres') } },
  });

  try {
    const rows = await admin.$queryRawUnsafe<Array<{ exists: boolean }>>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS "exists"',
      database,
    );

    if (rows[0]?.exists) {
      console.log(`[ensure-database] base "${database}" ya existe`);
    } else {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
      console.log(`[ensure-database] base "${database}" creada`);
    }
  } finally {
    await admin.$disconnect();
  }

  return database;
}

async function main(): Promise<void> {
  const targetUrl = resolveDatabaseUrl();
  const database = await ensureDatabaseExists(targetUrl);
  console.log(`[ensure-database] listo para migrar sobre "${database}"`);
}

void main().catch((err: unknown) => {
  const detail = err instanceof Error ? err.stack : String(err);
  process.stderr.write(`[ensure-database] FALLO: ${detail}\n`);
  process.exit(1);
});
