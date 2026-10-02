/**
 * Plantillas de ejemplo (opt-in con SEED_DEMO=true). Son puntos de partida para
 * ver el flujo completo; el usuario puede editarlas o crear las suyas.
 */
export interface DemoTemplate {
  id: string;
  name: string;
  kind: 'pdf' | 'docx';
  norm: string;
  spec: Record<string, unknown>;
}

export const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    id: 'demo-informe-icontc',
    name: 'Informe ICONTEC',
    kind: 'pdf',
    norm: 'icontc',
    spec: { coverPage: true, headingNumbering: true, pageNumbering: 'top-right' },
  },
  {
    id: 'demo-articulo-apa7',
    name: 'Artículo APA 7',
    kind: 'docx',
    norm: 'apa7',
    spec: { coverPage: true },
  },
  {
    id: 'demo-informe-propio',
    name: 'Informe propio (sin norma)',
    kind: 'pdf',
    norm: 'custom',
    spec: {
      marginsCm: { top: 2, right: 2, bottom: 2, left: 2 },
      fontFamily: 'Helvetica',
      fontSize: 11,
      coverPage: false,
      pageNumbering: 'bottom-center',
      runningHeader: { text: 'Informe', showTitle: false },
    },
  },
];
