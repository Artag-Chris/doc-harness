# ADR-001 — Motor de documentos: contenido estructurado + renderers por formato

- **Estado**: aceptada
- **Fecha**: 2026-10-01
- **Contexto**: primer harness de documentos del ecosistema; el requerimiento es
  generar **Word, PDF y Excel reales** con normas de formato (ICONTEC, APA 7, IEEE),
  sin cuentas externas.

## Problema

Necesitábamos decidir tres cosas que condicionan todo el resto:

1. **Qué es "el documento" internamente** (¿markdown? ¿HTML? ¿un árbol de bloques?).
2. **Con qué se genera el PDF** (¿Chromium headless? ¿una librería JS pura?).
3. **Dónde viven las normas** (¿enums/tablas de la base? ¿catálogo en código?).

## Decisión

### 1. Contenido intermedio estructurado (bloques) en JSONB

El documento es un objeto `DocContent` (`title`, `blocks[]`, `references[]`) con
bloques tipados: `heading`, `paragraph`, `list`, `table`, `pagebreak`. El Excel es un
`WorkbookContent` (`sheets[]` con `columns` y `rows`).

**Por qué**: permite editar por bloques en el front, re-renderizar sin volver a
llamar a la IA, y validar con Zod lo que devuelve el modelo (el contrato de datos es
del llamador, no del modelo). Markdown no alcanza (no expresa tablas bien ni da
control de layout); HTML acoplaría el layout al contenido.

### 2. PDF con `pdfkit` (JS puro), no con Chromium headless

**Por qué**:
- Sin binarios pesados: la imagen sigue siendo `node:20-alpine` + `curl` + `openssl`.
- Sin archivos de fuente: usa las tipografías estándar del PDF (Helvetica ≈ Arial,
  Times-Roman ≈ Times New Roman), que son justamente las que piden las normas.
- Control total de márgenes, interlineado, portada, encabezado y numeración de página.
- Determinístico y rápido (milisegundos), sin un navegador en el contenedor.

**Costo asumido**: hay que escribir el layout a mano (no se reutiliza CSS) y no hay
tabla de contenido automática. Para el alcance de las normas (portada + secciones +
numeración) alcanza.

**Alternativa descartada**: HTML + Chromium (puppeteer/playwright). Da plantillas más
cómodas y TOC automático, pero engorda la imagen ~300 MB, agrega un proceso pesado y
una fuente de fallos en el contenedor. Queda como **swap posible** porque el PDF vive
detrás de `RendererPort`: cambiar de motor es un adaptador nuevo.

**Nota sobre Word/Excel**: no había alternativa razonable a `docx` y `exceljs` (son
las librerías estándar, JS puro, sin dependencias nativas). `exceljs` ya se usa en
`atiende`.

### 3. Normas como catálogo en CÓDIGO, expuesto por `GET /norms`

`norms.catalog.ts` define cada norma como un `FormatSpec` validado con Zod
(tamaño de página, márgenes, tipografía, interlineado, portada, encabezado,
numeración, estilo de cita). El front **no** tiene la lista hardcodeada: la pide.

**Por qué**: es exactamente la misma razón por la que `social-harness` guarda las
redes como texto y no como enum — agregar o **quitar** una norma no debe costar una
migración. Además, aparece sola en el selector de la UI.

### 4. Extracción con `pdf-parse` en su build de **pdf.js v2.0.550**

`pdf-parse` trae varios builds de pdf.js; el default (v1.10.100) **no lee PDFs
modernos** (object streams / xref comprimido) y falla con `bad XRef entry`.
Se fuerza `version: 'v2.0.550'`, que sí los lee. Verificado con PDFs reales.

`pdf-parse` además se carga con el `require` de Node (`createRequire`) y no con un
`import`: la librería hace `require()` dinámico de un build interno de pdf.js y un
transformador (Vite en tests) puede romperlo.

## Consecuencias

- **Positivas**: imagen liviana, arranque rápido, normas extensibles sin migración,
  contenido editable y re-renderizable sin costo de IA, adaptadores intercambiables.
- **Negativas**: el layout del PDF es código (no plantillas HTML) y no hay TOC
  automática; la fidelidad visual de un documento subido respecto al original no es
  pixel-perfect (se prioriza contenido y norma).
- **Pendiente de revisar**: si en el uso aparece la necesidad de plantillas HTML
  complejas o TOC, se evalúa Chromium detrás del mismo puerto.
