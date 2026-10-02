import { promises as fs } from 'node:fs';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { StoragePort } from './storage.port';

/**
 * Almacenamiento en disco local (volumen docker `docharnes_data`).
 *
 * Seguridad: toda `key` se resuelve DENTRO del directorio raíz y se verifica que
 * el resultado siga adentro. Sin eso, una key como "../../etc/passwd" escribiría
 * fuera de la carpeta de datos. Es la única defensa porque las keys las arma el
 * backend (nunca llegan del cliente), pero la validación es barata y explícita.
 */
export class LocalDiskStorage implements StoragePort {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  private absolute(key: string): string {
    const normalized = normalize(key).replace(/^([/\\])+/, '');
    const full = join(this.root, normalized);
    const rootWithSep = this.root.endsWith(sep) ? this.root : `${this.root}${sep}`;
    if (full !== this.root && !full.startsWith(rootWithSep)) {
      throw new Error(`Key de almacenamiento fuera del directorio raíz: "${key}".`);
    }
    return full;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const full = this.absolute(key);
    await fs.mkdir(dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.absolute(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.absolute(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.absolute(key));
    } catch {
      // Borrar algo que ya no está no es un error para quien llama.
    }
  }
}
