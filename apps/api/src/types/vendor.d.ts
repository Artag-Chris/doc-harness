// `mammoth` no publica tipos ni existe `@types/mammoth` en npm. Se declara acá
// para poder importarlo con dynamic import; el uso real lo castea en
// extract/docx.extractor.ts, así que el `any` no se propaga al resto del código.
declare module 'mammoth';
