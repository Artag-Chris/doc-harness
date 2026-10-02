/**
 * Firma un token de prueba con el MISMO `JWT_SECRET` que usa atiende, para probar
 * la API con curl/Swagger sin pasar por el dashboard.
 *
 *   npx ts-node scripts/dev-token.ts --sub=<uuid> --email=yo@ejemplo.com
 *
 * El harness NO firma tokens en producción: el único emisor es atiende. Esto es
 * una herramienta de desarrollo.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found?.slice(prefix.length);
}

const sub = arg('sub') ?? 'dev-user';
const token = jwt.sign(
  { sub, email: arg('email') ?? 'dev@docharnes.local', role: arg('role') ?? 'ADMIN' },
  env.JWT_SECRET,
  { expiresIn: env.JWT_EXPIRES_IN as unknown as number },
);

process.stdout.write(`${token}\n`);
