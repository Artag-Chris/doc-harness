# Doc Harness — lo implementado

Inventario de lo que funciona hoy, cómo probarlo y con qué evidencia. Complementa el
`README.md` (presentación) y el `NEXT-SESSION.md` (pendientes).

Fecha: 2026-10-01.

## Estado por fase

| Fase | Estado |
|---|---|
| 1. Scaffold (compose, Dockerfile, Prisma, boot chain) | ✅ implementado |
| 2. Entrada (storage + extractores) | ✅ implementado y probado |
| 3. IA + modelo estructurado (rewrite, anonymize, from_template) | ✅ implementado (mock verificado; con llave real falta probar) |
| 4. Salida (renderers + normas + plantillas + descargas) | ✅ implementado y probado |
| 5. Excel (parseo, edición, export) | ✅ implementado y probado |
| 6. Front (pestaña `/docs`) | ✅ implementado (typecheck OK; render en navegador pendiente) |
| 7. Docs | ✅ este archivo |

## Capacidades y para qué sirven

### Backend (`apps/api`, puerto 3300)

- **`GET /api/health`** — estado real de la DB y proveedor de IA resuelto. Único endpoint público.
- **`GET /api/norms`** — catálogo de normas (icontc, apa7, ieee, custom) con su spec. El front arma el selector desde acá.
- **`/api/templates`** (CRUD) — plantillas propias (márgenes, tipografía, portada, membrete).
- **`POST /api/sources`** (multipart) — sube y extrae texto/estructura en el mismo request.
- **`/api/jobs`** — crea y consulta trabajos (rewrite, anonymize, from_template, convert, excel_edit).
- **`PATCH /api/jobs/:id/content`** — guarda la edición por bloques/hojas.
- **`POST /api/jobs/:id/refine`** — ajustes con IA sobre el contenido existente.
- **`POST /api/jobs/:id/render`** — re-renderiza a los formatos elegidos con otra norma/plantilla.
- **`POST /api/jobs/:id/anonymize/scan`** y **`/apply`** — detecta datos personales y aplica el mapeo aprobado.
- **`GET /api/jobs/:id/preview`** — PDF del contenido actual (refleja ediciones sin guardar).
- **`GET /api/jobs/:id/download?format=…`** — descarga el artefacto (PDF/DOCX/XLSX).
- **`GET /api/usage`** — gasto de IA acumulado.

### Front (`dashboard/`, pestaña "Documentos")

- `/docs` — resumen con los trabajos y el gasto de IA.
- `/docs/nuevo` — wizard: archivo → operación → formato + norma/plantilla → instrucción.
- `/docs/[id]` — editor por bloques, editor de planilla, ajustes IA, panel de anonimización, vista previa PDF en vivo, descargas y re-render.
- `/docs/plantillas` — alta/baja de plantillas propias.

## Cómo probarlo

### Unitario (sin base de datos ni Docker)

```bash
cd apps/api
npm install
npx prisma generate
npm run check      # tsc --noEmit + vitest
```

### Extracción contra un archivo real

```bash
npm run extract:check -- /ruta/a/tu-documento.pdf
```

### Diagnóstico de IA

```bash
npm run llm:check
```

### Flujo completo

```bash
cp .env.example .env
npm run docker:infra:up && npm run docker:up:local   # o npm run docker:up:local (levanta todo)
curl http://localhost:3300/api/health
```

Luego, en el dashboard: pestaña **Documentos → Nuevo documento**.

## Evidencia de verificación (corrida real)

- **`npm run check`** → 0 errores de TypeScript y **9/9 tests** en verde:
  - `test/render.spec.ts` (5): PDF con firma `%PDF` y >1 KB **para las 4 normas**;
    DOCX y XLSX como contenedor ZIP (`PK`) válido; error explícito si falta contenido;
    catálogo de normas correcto (APA 7 con doble espacio, IEEE con secciones numeradas).
  - `test/extract.spec.ts` (4): detección de tipo por extensión/mime; TXT; Excel
    round-trip (`Nombre/Edad`, 2 filas, vista previa TSV); PDF inválido falla limpio.
- **`npm run build`** (Nest) → compila sin errores.
- **`npm run extract:check -- Christian_Resume.pdf`** → `Tipo: PDF · 200.023 bytes · 191 ms
  · Texto extraído: 8.700 caracteres`, con muestra legible (correo, teléfono, cargos).
  También verificado con un segundo PDF real (2.778 caracteres).
- **PDF generado**: se validó la tabla xref del PDF producido por pdfkit (13/13 offsets
  apuntan a su objeto y `startxref` coincide) → archivo estructuralmente válido.
- **Front**: `tsc --noEmit` sobre el `dashboard/` sin errores propios (los 2 errores
  que aparecen son de `.next/types` generado y **preexistentes**: se reprodujeron con
  `git stash` de mis cambios).

## Bugs encontrados y resueltos durante la implementación

- `@types/mammoth` no existe en npm → se declara el módulo localmente (`src/types/vendor.d.ts`).
- `NODE_ENV=production` en el host hacía que `npm install` omitiera las
  devDependencies → el Dockerfile ya fuerza `development`; documentado.
- `pdf-parse` con su pdf.js por defecto **no lee PDFs modernos** (`bad XRef entry`) →
  se fuerza el build `v2.0.550`.
- `pdf-parse` rompía bajo vitest por su `require` dinámico → se carga con
  `createRequire` y la verificación real se movió a `scripts/extract-check.ts`.
- Los errores de render (contenido faltante) ahora son explícitos en vez de producir
  un archivo vacío.

## Límites conocidos

- **No verificado todavía**: arranque completo del stack con Docker (Docker Desktop no
  estaba corriendo durante el desarrollo) y generación con la llave real de DeepSeek
  (se probó el flujo en modo `mock`, que devuelve el respaldo determinístico).
- **Fidelidad al original**: para un documento subido se prioriza el contenido y la
  norma; no se replica el diseño exacto del original.
- **Sin TOC automática** en PDF (ver ADR-001).
- **El build de Next del `dashboard/`** falla por un problema preexistente en
  `/social/comunidad` (prerender, `useState` nulo), ajeno a esta pestaña.
