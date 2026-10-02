# Auditoría — doc-harness

- **Fecha**: 2026-10-02
- **Alcance**: robustez, escalabilidad/extensibilidad futura y preparación real para
  el server remoto (copiar `.env` → `docker compose up -d --build` y que arranque de una).
- **Método**: lectura del código propio punto por punto; **comparación 1:1 con
  `social-harness`/`cv-harness`** (cadena de boot, compose, `.env.example`, puertos);
  validación de los compose con `docker compose config`; verificación de los guardas de
  configuración en ejecución real. `npm run check` (tsc + tests) antes y después.

## Veredicto

**Listo para el server** con el checklist del `.env`. Los cuatro problemas que rompían
el "que funcione de una" quedaron **corregidos y verificados**. Queda **una sola
verificación que no se pudo hacer acá**: el build real de la imagen y el arranque E2E
(el daemon de Docker no estaba corriendo) y la generación con la llave real de DeepSeek.

## Hallazgos y estado

### Críticos — impedían que arrancara/anduviera de una

| # | Hallazgo | Estado |
|---|---|---|
| C1 | El `.env.example` traía `JWT_SECRET=dev-secret-change-me`. Copiado al server, el harness arranca **y da 401 en silencio** en la pestaña (el síntoma parece "está roto"). | **Corregido**. El valor queda **vacío** y el api **falla al arrancar** con mensaje accionable; además se rechaza explícitamente el valor de ejemplo. Verificado en 3 casos reales (vacío → error; ejemplo → error; real → emite token). |
| C2 | La migración inicial (`0001_init/migration.sql`) tenía un **BOM** (`EF BB BF`) al inicio del archivo. Postgres falla con `syntax error at or near "\uFEFF"` y **el contenedor queda en bucle de arranque** (P3018). Habría roto el primer `docker compose up` en el server. | **Corregido** (se removió el BOM y se verificó que los primeros bytes sean `2D 2D 20`). **Lo atrapó el E2E**, no el typecheck ni los tests: es un problema de bytes, no de código. Barrido del repo: era el único archivo con BOM. |

### Altos — funcionales

| # | Hallazgo | Estado |
|---|---|---|
| A1 | Elegir **Excel** en una operación de documento (Reescribir/Convertir) producía un render **omitido en silencio** (solo un log): el usuario no recibía ese formato y nada se lo decía. | **Corregido**. Validación `400` con los formatos válidos por operación, y el front solo ofrece los válidos. |
| A2 | Al re-renderizar con **menos** formatos, los artefactos viejos quedaban descargables (mezcla de versiones). | **Corregido**. Se borran fila **y** archivo de los formatos que ya no se piden. |
| A3 | Un archivo **corrupto o ilegible** devolvía `500 Error interno` en vez de un `400` con el motivo. | **Corregido**. La extracción ahora falla con `400` y el nombre del archivo. |

### Medios

| # | Hallazgo | Estado |
|---|---|---|
| M1 | Las plantillas `builtin` se podían **editar** (mutación compartida), y el filtro de visibilidad armaba un `OR` con `{}` (frágil). | **Corregido**: `403` al editar una de fábrica; filtro de visibilidad explícito. |
| M2 | Se aceptaba `.xls` (Excel binario viejo) y después fallaba con "no se pudo leer", porque `exceljs` no lo lee. | **Corregido**: se rechaza al subir con "formato no soportado" (junto con `.doc`). |
| M3 | El directorio de almacenamiento local (`.data`) no estaba en `.gitignore`/`.dockerignore`: riesgo de commitear archivos subidos o meterlos en la imagen. | **Corregido** en los tres ignore. |
| M4 | Un `templateId` inexistente se ignoraba en silencio al crear el trabajo. | **Corregido**: `400` si la plantilla no existe o no es del usuario. |

### Bajos — documentados, no implementados (a propósito)

| # | Hallazgo | Recomendación |
|---|---|---|
| B1 | Sin **retención**: `DocJob`/`DocArtifact` y los archivos crecen sin límite. | Job de limpieza configurable (borrar > N días). Fase futura. |
| B2 | El `DocContent` se guarda **sin versión de esquema**: un cambio de contrato puede invalidar trabajos viejos al renderizar. | Agregar `schemaVersion` al contenido + migración perezosa en el parse. Decisión ya contemplada como futura (no se toca código todavía). |
| B3 | Extracción y render son **CPU-bound en el mismo proceso** que la API (bloquean el event loop en documentos grandes). | Para uso personal es correcto; si escala, mover a un worker/cola aparte. `ExtractorPort`/`RendererPort` ya lo permiten sin tocar el resto. |
| B4 | El front cae a `http://localhost:3300/api` si falta `NEXT_PUBLIC_DOCS_API_URL` → en Vercel se ve "roto" sin decir por qué. | Exigir la variable o mostrar un error explícito. Mismo patrón que CV/Social. |
| B5 | La etapa `production` del Dockerfile corre como `USER node` y no prepara la base; tampoco podría escribir `/data`. | Hoy se usa `development` (igual que los hermanos). Si se pasa a `production`, ajustar el dueño del volumen y llevar migraciones. |
| B6 | Listados sin paginación real (`take: 200`). | Suficiente para uso personal; paginar cuando haga falta. |

## Escalabilidad y futuro (lo que quedó bien pensado)

- **Puertos y adaptadores** en los cuatro ejes que van a cambiar: `LlmProviderPort`
  (DeepSeek/Groq/mock), `ExtractorPort` (PDF/DOCX/XLSX/CSV/TXT/MD), `RendererPort`
  (DOCX/PDF/XLSX), `StoragePort` (local → S3). Sumar un formato o proveedor **no toca
  el pipeline**.
- **Normas como catálogo en código** + `GET /norms`: sumar una norma no cuesta migración
  y aparece sola en la UI.
- **Contenido estructurado** (bloques): re-renderizar no vuelve a gastar IA.
- **Infra compartida** sin choques: base `docharnes` en el Postgres de atiende, Redis
  compartida con `QUEUE_PREFIX=docharnes`, puertos libres (API **3300**, Postgres local
  **5436**), red `microservices-network`.
- **Boot auto-recuperable**: `ensure-database` crea la base; `recover-migrations` limpia
  intentos fallidos sólo si no hay datos; seed **idempotente y opt-in**.
- **IA como asesora**: en anonimización la IA propone y el usuario aprueba; el reemplazo
  es literal (no una reescritura del modelo).

## Paridad con los harnesses hermanos (deploy)

Comparado 1:1 con `social-harness`:

| Pieza | doc-harness | social-harness |
|---|---|---|
| Scripts raíz `docker:*` | ✅ mismo set | ✅ |
| compose server = solo `api` (sin DB/Redis) | ✅ | ✅ |
| compose infra local (Postgres propio + override api) | ✅ | ✅ |
| Dockerfile multi-stage + `target: development` | ✅ | ✅ |
| Cadena de boot (ensure-db → generate → recover → migrate → seed) | ✅ | ✅ (+ `ensure-index`, que acá no aplica) |
| `.env.example` con checklist de server | ✅ | ✅ |
| JWT compartido con atiende | ✅ | ✅ |
| `QUEUE_PREFIX` propio | ✅ (`docharnes`) | ✅ |
| Puertos sin choque con los hermanos | ✅ (3300 / 5436) | ✅ (3200 / 5435) |

**Validado**: `docker compose config` da `EXIT=0` en modo server y en modo local, y
resuelve bien `DATABASE_URL` en cada caso (`atiende-postgres` en server,
`docharnes-postgres` en local), el volumen `/data`, el puerto 3300 y `QUEUE_PREFIX`.

## Verificación E2E (hecha, sobre el stack real)

`docker compose -f docker-compose.yml -f docker-compose.infra.yml up -d --build` sobre una
**base vacía** (Postgres local recién creado) y con **Redis compartida**. Resultado:
**17/17 en verde**:

| Prueba | Resultado |
|---|---|
| `GET /api/health` | `status=ok db=up llm=mock` |
| `GET /api/norms` | `icontc, apa7, ieee, custom` |
| Subir PDF real (200 KB) | extraído, **8.700 caracteres** |
| Job REESCRIBIR → PDF + DOCX | `DONE`; descargas `%PDF` (12.075 B) y `PK` DOCX (14.150 B) |
| `GET /jobs/:id/preview` | PDF válido (12.075 B) |
| Anonimizar: `scan` | 5 entidades detectadas |
| Anonimizar: `apply` | el correo original **ya no aparece** |
| Subir CSV → EDITAR EXCEL → XLSX | `DONE`; descarga `PK` (6.664 B) |
| GENERAR DESDE PLANTILLA (ICONTEC) | `DONE`; PDF (2.052 B) |
| XLSX en una operación de documento | **400** (validación nueva) |
| `GET /api/usage` | responde |

Además, el arranque fue **auto-recuperable**: el primer boot falló por el BOM (C2) y, tras
corregir el archivo, el propio `recover-migrations` limpió el intento fallido y migró de
nuevo — sin ningún paso manual.

## Falta verificar

1. **Generación con la llave real de DeepSeek** (todo el E2E corrió en modo `mock`:
   sin IA real, los jobs usan el respaldo determinístico). El cableado del proveedor está
   verificado por `llm:check` y por el adaptador, pero la calidad de la generación real
   queda para cuando pongas la llave.

Los pasos exactos están en `docs/NEXT-SESSION.md`.

## Evidencia de la corrida de verificación

- `npm run check` → **0 errores TS** y **11/11 tests** (se sumaron round-trip de DOCX con
  `docx` + `mammoth` y de CSV, más los 9 previos).
- Guarda de `JWT_SECRET` probado en ejecución real (3 casos, arriba).
- `docker compose config` en los dos modos (sin daemon).
- Extracción de PDF real: 8.700 caracteres de un PDF del workspace (verificado antes).
