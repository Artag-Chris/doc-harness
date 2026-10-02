import { Global, Module } from '@nestjs/common';
import { env } from '../../config/env';
import { LocalDiskStorage } from './local-disk.storage';
import { STORAGE_PORT, type StoragePort } from './storage.port';

/**
 * Módulo de almacenamiento. Hoy solo `local`; sumar S3 = un adaptador + una rama
 * acá (el resto del código inyecta `STORAGE_PORT` y no se entera).
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PORT,
      useFactory: (): StoragePort => {
        switch (env.STORAGE_DRIVER) {
          case 'local':
            return new LocalDiskStorage(env.DOCS_STORAGE_DIR);
          default: {
            const unknown: never = env.STORAGE_DRIVER;
            throw new Error(`Storage driver desconocido: ${String(unknown)}`);
          }
        }
      },
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
