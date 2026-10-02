import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SourceFile } from '@prisma/client';
import { AccessScope } from '../auth/access-scope.service';
import type { AuthPayload } from '../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { ExtractService } from '../extract/extract.service';
import { detectFileKind } from '../extract/file-kind';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';

const EXTENSION: Record<string, string> = {
  PDF: 'pdf',
  DOCX: 'docx',
  XLSX: 'xlsx',
  CSV: 'csv',
  TXT: 'txt',
  MD: 'md',
};

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly extract: ExtractService,
    private readonly scope: AccessScope,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /**
   * Guarda el archivo y extrae su contenido en el mismo request: la extracción es
   * rápida (máx. 25 MB) y así la vista previa está lista al instante, sin una
   * cola extra que solo agregaría latencia.
   */
  async upload(
    user: AuthPayload,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
  ): Promise<SourceFile> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Falta el archivo (campo "file").');
    }

    const kind = detectFileKind(file.originalname, file.mimetype);
    if (!kind) {
      throw new BadRequestException(
        `Formato no soportado: "${file.originalname}". Aceptados: PDF, DOCX, XLSX, CSV, TXT, MD.`,
      );
    }

    const { text, meta } = await this.extract.extract(kind, file.buffer);
    const created = await this.prisma.sourceFile.create({
      data: {
        ...this.scope.ownership(user),
        filename: file.originalname,
        mime: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        kind,
        // La key se arma después de conocer el id; se guarda el archivo y se
        // actualiza la fila (una sola escritura extra, sin carrera).
        storageKey: 'pending',
        extractedText: text,
        meta: meta as object,
      },
    });

    const storageKey = `sources/${created.id}.${EXTENSION[kind] ?? 'bin'}`;
    await this.storage.save(storageKey, file.buffer);

    return this.prisma.sourceFile.update({ where: { id: created.id }, data: { storageKey } });
  }

  async list(user: AuthPayload): Promise<SourceFile[]> {
    return this.prisma.sourceFile.findMany({
      where: this.scope.ownedWhere(user),
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(user: AuthPayload, id: string): Promise<SourceFile> {
    const found = await this.prisma.sourceFile.findFirst({
      where: { id, ...this.scope.ownedWhere(user) },
    });
    if (!found) throw new NotFoundException(`El archivo ${id} no existe.`);
    return found;
  }

  async remove(user: AuthPayload, id: string): Promise<{ deleted: true }> {
    const found = await this.get(user, id);
    await this.storage.remove(found.storageKey);
    await this.prisma.sourceFile.delete({ where: { id: found.id } });
    return { deleted: true };
  }

  /** Lee el buffer de un archivo fuente (para los jobs). */
  async readBuffer(source: SourceFile): Promise<Buffer> {
    return this.storage.read(source.storageKey);
  }
}
