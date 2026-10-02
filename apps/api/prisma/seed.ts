/**
 * Seed — **opt-in** (`SEED_DEMO=true`), porque corre en CADA boot del contenedor
 * después de `migrate deploy`.
 *
 * Sin la variable no toca nada (y lo dice en el log): en el server se quiere
 * arrancar vacío y crear las plantillas desde el dashboard. Cuando está prendido,
 * todo es upsert: se puede correr las veces que haga falta sin duplicar.
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../src/config/env';
import { DEMO_TEMPLATES } from './seed/templates.data';

const prisma = new PrismaClient({ datasources: { db: { url: env.databaseUrl } } });

async function seedTemplates(): Promise<void> {
  for (const template of DEMO_TEMPLATES) {
    const data = {
      name: template.name,
      kind: template.kind,
      norm: template.norm,
      spec: template.spec as Prisma.InputJsonValue,
      builtin: false,
      // Sin dueño: visibles para todos (plantillas de ejemplo).
      ownerId: null,
    };
    await prisma.documentTemplate.upsert({
      where: { id: template.id },
      update: data,
      create: { id: template.id, ...data },
    });
  }
  console.log(`[seed] ${DEMO_TEMPLATES.length} plantillas de ejemplo listas`);
}

async function main(): Promise<void> {
  if (!env.SEED_DEMO) {
    console.log(
      '[seed] SEED_DEMO=false: no se siembra nada (las plantillas las creás vos desde el dashboard). ' +
        'Poné SEED_DEMO=true si querés las plantillas de ejemplo.',
    );
    return;
  }

  await seedTemplates();
}

void main()
  .catch((err: unknown) => {
    const detail = err instanceof Error ? err.stack : String(err);
    process.stderr.write(`[seed] FALLO: ${detail}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
