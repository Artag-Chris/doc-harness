# Doc Harness

Harness personal para **transformar documentos con IA y descargarlos en formatos
reales** — Word, PDF y Excel — sin depender de ninguna cuenta externa (Office 365,
Google Docs) ni subir tus archivos a un servicio de terceros.

Subís un documento, elegís qué querés hacer y la IA lo reescribe, reemplaza datos
personales, lo convierte o lo genera desde una plantilla; después lo editás por
bloques y lo bajás en el formato que necesites, siguiendo una norma (ICONTEC, APA 7,
IEEE) o tu propio estilo.

---

## El problema

Los documentos viven atrapados en el formato en que te los mandaron: un PDF del que
no podés cambiar una palabra, un Word con nombres que hay que anonimizar, un Excel
que hay que limpiar. Las herramientas que lo resuelven piden cuenta, cuota o subir el
archivo a un servidor ajeno. Este harness lo hace **local**, sobre la infraestructura
que ya corre para el resto del ecosistema (`atiende`, `cv-harness`, `social-harness`).

## Qué hace

| Flujo | Qué pasa |
|---|---|
| **Reescribir / mejorar** | La IA reescribe el documento conservando los hechos: redacción, estructura y claridad. |
| **Reemplazar nombres y datos** | Detecta nombres, correos, teléfonos, IDs y direcciones; vos aprobás el reemplazo y él lo aplica literal. |
| **Generar desde plantilla** | Redacta un documento nuevo siguiendo una plantilla o una instrucción. |
| **Convertir formato** | Pasa el material a Word/PDF (o un Excel a tabla) sin resumir. |
| **Editar Excel** | Limpia, reformula o agrega columnas a una planilla y la devuelve en `.xlsx`. |

Formatos de entrada: **PDF, DOCX, XLSX, CSV, TXT, MD**.
Formatos de salida: **PDF, DOCX, XLSX**.

## Arquitectura

```
[subir documento]──► extract ──► [DocContent | WorkbookContent]  (JSONB, editable)
                                      │
                              IA (DeepSeek)  ──►  respaldo determinístico si no hay llave
                                      │
                              [edición en el dashboard]
                                      │
                              render ──► [.docx | .pdf | .xlsx]
```

La pieza clave es el **contenido intermedio estructurado** (bloques: títulos,
párrafos, listas, tablas). Gracias a eso el front puede editar por bloques y el
backend re-renderiza a cualquier formato **sin volver a llamar a la IA** (la parte
cara). Es el mismo patrón que usa `ResumeDraft.content` en `cv-harness`.

### Puertos y adaptadores

| Puerto | Implementaciones | Cambiar de proveedor es… |
|---|---|---|
| `LlmProviderPort` | DeepSeek · Groq · mock | tocar `LLM_PROVIDER` en el `.env` |
| `ExtractorPort` | PDF · DOCX · XLSX · CSV · TXT · MD | registrar un adaptador |
| `RendererPort` | DOCX · PDF · XLSX | registrar un adaptador |
| `StoragePort` | disco local (preparado para S3) | tocar `STORAGE_DRIVER` |

## Stack

- **NestJS 11 + Prisma 6 + BullMQ** sobre la **Redis compartida**; base PostgreSQL
  propia (`docharnes`) dentro del **Postgres de `atiende`**.
- **IA**: DeepSeek (`deepseek-v4-flash`), la misma llave que los otros harnesses;
  Groq como respaldo; `mock` determinístico para correr el flujo completo sin llaves.
- **Generación de archivos**: `docx` (Word) · `pdfkit` (PDF, sin Chromium ni fuentes
  externas) · `exceljs` (Excel).
- **Extracción**: `pdf-parse` (build pdf.js v2, lee PDFs modernos) · `mammoth` (Word)
  · `exceljs` (Excel/CSV).
- **Front**: pestaña **Documentos** dentro del `dashboard/` existente (Next 16 +
  React 19 + Tailwind v4), sin segundo login.

## Cómo correrlo

### Dev local

```bash
cp .env.example .env          # y completá (mínimo: dejá DEEPSEEK_API_KEY vacía = modo mock)
npm run docker:infra:up       # postgres local (puerto 5436)
npm run docker:up:local       # api en http://localhost:3300
```

La **Redis compartida** (`redis` en la red `microservices-network`) no se levanta
acá: se reutiliza la de los otros proyectos. Si no existe:

```bash
docker run -d --name redis --network microservices-network redis:7-alpine
```

El front se levanta aparte, en el `dashboard/`, con `NEXT_PUBLIC_DOCS_API_URL=http://localhost:3300/api`.

### Server

```bash
git pull
docker compose up -d --build
```

El contenedor, en cada arranque: crea la base si falta → genera el cliente Prisma →
recupera migraciones fallidas → migra → corre el seed (opt-in). **No hay pasos
manuales de aprovisionamiento.**

### Checklist del server (variables)

1. `JWT_SECRET` → **el mismo de `atiende`** (una sola sesión; sin esto la pestaña da 401).
2. `DEEPSEEK_API_KEY` + `DEEPSEEK_MODEL=deepseek-v4-flash` (las mismas de los otros harnesses).
3. `CORS_ALLOWED_ORIGINS` → el dominio del dashboard.
4. `API_PORT=3300` · `POSTGRES_DB=docharnes` · `QUEUE_PREFIX=docharnes`.

Diagnóstico de la capa de IA y de la extracción:

```bash
docker compose exec api npm run llm:check
docker compose exec api npm run extract:check /ruta/documento.pdf
```

## API

`/api` (Swagger en `/api/docs`). Todos los endpoints exigen el Bearer de `atiende`
salvo `/api/health`.

- `GET /norms` · `GET|POST|PATCH|DELETE /templates[/:id]`
- `POST /sources` (multipart) · `GET /sources` · `GET|DELETE /sources/:id`
- `POST /jobs` · `GET /jobs` · `GET /jobs/:id` · `DELETE /jobs/:id`
- `PATCH /jobs/:id/content` · `POST /jobs/:id/refine` · `POST /jobs/:id/render`
- `POST /jobs/:id/anonymize/scan` · `POST /jobs/:id/anonymize/apply`
- `GET /jobs/:id/preview` (PDF) · `GET /jobs/:id/download?format=PDF|DOCX|XLSX`
- `GET /usage` (gasto de IA) · `GET /health`

## Decisiones de diseño

- **PDF con pdfkit, no con Chromium.** Sin binarios pesados ni archivos de fuente:
  usa las tipografías estándar (Helvetica/Times ≈ Arial/Times New Roman, las que
  piden las normas). Aislado tras `RendererPort` por si algún día conviene otro motor
  (ver `docs/adr-001`).
- **Normas como catálogo en código, no como enum de la base.** Sumar una norma es una
  entrada en `norms.catalog.ts`; se expone por `GET /norms` y el front arma el
  selector sola. Cero migraciones.
- **La IA asesora, no actúa sola.** En anonimización la IA *propone* las entidades y
  el usuario aprueba el mapeo; el reemplazo es un `split/join` literal, no una
  reescritura del modelo.
- **Infraestructura compartida.** Mismo Postgres y Redis que los otros harnesses,
  diferenciado por base, `QUEUE_PREFIX` y puertos (3300/5436).
- **Falla ruidoso antes que fallar en silencio.** Si `JWT_SECRET` falta o es el valor de
  ejemplo, el api **no arranca** con un mensaje accionable: arrancar con un secreto
  distinto al de atiende daría 401 en el dashboard y parecería que el harness está roto.

## Estado y límites conocidos

Ver `docs/AUDITORIA.md` (auditoría de robustez y deploy), `docs/IMPLEMENTADO.md`
(inventario y evidencia) y `docs/NEXT-SESSION.md` (pendientes). Resumen: backend compila
y pasa **11 tests**; los compose están validados en modo server y local; y el **E2E sobre
el stack real pasó 17/17** (arranque sobre base vacía, subir un PDF, reescribir y descargar
PDF/DOCX, anonimizar, editar Excel y generar con norma ICONTEC). Falta probar la generación
con la **llave real de DeepSeek** (el E2E corrió en modo `mock`).
