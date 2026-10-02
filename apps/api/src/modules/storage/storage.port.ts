/**
 * Puerto de almacenamiento de archivos (patrón adaptador).
 *
 * El resto del sistema guarda y lee bytes por esta interfaz, sin saber si viven
 * en disco local (hoy) o en S3 (mañana): cambiar de backend es registrar un
 * adaptador y tocar `STORAGE_DRIVER`.
 *
 * `key` es una ruta LÓGICA (p. ej. "sources/<id>.pdf"), nunca una ruta absoluta
 * del host: el adaptador decide dónde materializarla y valida que no se escape
 * de su directorio raíz.
 */
export interface StoragePort {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

export const STORAGE_PORT = 'STORAGE_PORT';
