# NEXT-SESSION — handoff

Estado al cerrar la sesión del 2026-10-01. El harness está **implementado y
verificado en lo que no depende de Docker**; falta el arranque real y el deploy.

## Lo ya entregado y verificado

- Backend NestJS completo: `apps/api` con auth (JWT de atiende), LLM adaptador,
  storage, extractores, normas, renderers, `sources`, `jobs`, `generate`, `templates`,
  `usage`, `health`.
- Prisma con migración inicial (`0001_init`) y cadena de boot (ensure-database →
  generate → recover-migrations → migrate deploy → seed).
- Front: pestaña **Documentos** en `dashboard/` (`/docs`, `/docs/nuevo`,
  `/docs/[id]`, `/docs/plantillas`) + 4 componentes nuevos, y `NEXT_PUBLIC_DOCS_API_URL`
  documentada en `dashboard/.env.example`.
- `npm run check` → 0 errores TS y 9/9 tests.
- Extracción de PDF real verificada (8.700 caracteres).

Detalle y evidencia: `docs/IMPLEMENTADO.md`.

## Pasos exactos que faltan

### 1. Arrancar el stack real ✅ (hecho el 2026-10-02, 17/17 E2E)

```bash
cd doc-harness
cp .env.example .env          # dejar DEEPSEEK_API_KEY vacía para probar en modo mock
# si no existe la Redis compartida:
# docker run -d --name redis --network microservices-network redis:7-alpine
npm run docker:up:local
curl http://localhost:3300/api/health     # esperado: {"status":"ok","db":"up",...}
```

Si la red `microservices-network` no existe:
`docker network create microservices-network`.

### 2. Probar el flujo E2E ✅ (hecho)

1. En el dashboard (`NEXT_PUBLIC_DOCS_API_URL=http://localhost:3300/api`, puerto 3001):
   pestaña **Documentos → Nuevo documento**.
2. Subir un PDF real → verificar el texto extraído.
3. Operación **Reescribir**, formatos `PDF` + `DOCX` → descargar y **abrir ambos**.
4. Operación **Reemplazar nombres y datos** → *Detectar datos personales* → revisar el
   mapeo → *Aplicar reemplazos*.
5. Subir un Excel → **Editar Excel** → editar la grilla → descargar `.xlsx` y abrirlo.
6. **Generar desde plantilla** eligiendo ICONTEC / APA 7 / IEEE → revisar portada,
   márgenes y numeración.

### 3. Probar con la llave real de DeepSeek

En `.env`: `DEEPSEEK_API_KEY=<la misma que atiende>` y `DEEPSEEK_MODEL=deepseek-v4-flash`,
luego `docker compose up -d --force-recreate api` (un `restart` no relee el `.env`).
Verificar con `docker compose exec api npm run llm:check` y repetir el paso 2.

### 4. Deploy al server

> El repo ya está creado en GitHub (`Artag-Chris/doc-harness`, rama `main`) con el commit
> inicial pusheado. En el server: `git pull` + `docker compose up -d --build`.

1. Copiar el `.env` al server con: `JWT_SECRET` = **el de `atiende`** (obligatorio: si
   queda vacío o con el valor de ejemplo, el api **no arranca** y lo dice),
   `DEEPSEEK_API_KEY`/`DEEPSEEK_MODEL`, `CORS_ALLOWED_ORIGINS` con el dominio del
   dashboard, `API_PORT=3300`, `POSTGRES_DB=docharnes`, `QUEUE_PREFIX=docharnes`.
2. `docker compose up -d --build`.
3. Si ya tenías el contenedor arriba y cambiaste el `.env`:
   `docker compose up -d --force-recreate api` (un `restart` no relee el `.env`).
4. En Vercel, agregar `NEXT_PUBLIC_DOCS_API_URL=https://<dominio>/api` y **redesplegar**
   (las `NEXT_PUBLIC_*` se hornean en el build).

### 5. Decisiones abiertas / a futuro

- **Fidelidad visual**: replicar el diseño exacto de un documento subido (no solo el
  contenido). Hoy se prioriza contenido + norma.
- **TOC automática** en PDF: evaluar si conviene cambiar el `PdfRenderer` por
  HTML+Chromium detrás del mismo `RenderPort` (ver `docs/adr-001`).
- **Plantillas HTML** para la portada/membrete, si "estilo propio" se queda corto.
- **Dashboard**: no hay nada pendiente — `next build` pasa (30/30) y `tsc` da 0
  errores. Ojo al buildear a mano: **NO fuerces `NODE_ENV=development`** (rompe el
  prerender de las páginas con hooks); dejá que Next lo maneje, como Vercel.
