import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, type Attachment as AttachmentRow } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Attachment } from '@scf/api-contracts';
import {
  attachmentStorageKey,
  safeAttachmentName,
  validateAttachment,
} from './domain/attachment';

/** Arquivo recebido no upload (formato do multer em memoria). */
export interface UploadedAttachment {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface AttachmentDownload {
  fileName: string;
  contentType: string;
  buffer: Buffer;
}

/** Raiz do storage de comprovantes (configuravel por env nos testes/ambientes). */
function storageRoot(): string {
  return resolve(process.env.RECEIPT_STORAGE_DIR ?? join(process.cwd(), 'storage', 'receipts'));
}

/**
 * Comprovantes de uma transacao. O arquivo vai para o storage local (a
 * interface e a mesma de um object storage: uma chave por comprovante) e a
 * linha guarda so os metadados, o checksum e a autoria.
 */
@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(spaceId: string, transactionId: string): Promise<Attachment[]> {
    await this.ensureTransaction(spaceId, transactionId);
    const rows = await this.prisma.attachment.findMany({
      where: { financialSpaceId: spaceId, transactionId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toView);
  }

  async upload(
    spaceId: string,
    transactionId: string,
    file: UploadedAttachment,
    userId: string,
  ): Promise<Attachment> {
    await this.ensureTransaction(spaceId, transactionId);

    const validation = validateAttachment({ contentType: file.mimetype, size: file.size });
    if (!validation.ok) {
      throw new BadRequestException({ code: validation.code, message: validation.message });
    }

    const id = randomUUID();
    const storageKey = attachmentStorageKey(spaceId, id, validation.contentType);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const fileName = safeAttachmentName(file.originalname);

    const absolute = join(storageRoot(), storageKey);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.buffer);

    const row = await this.prisma.attachment.create({
      data: {
        id,
        financialSpaceId: spaceId,
        transactionId,
        fileName,
        contentType: validation.contentType,
        size: file.size,
        storageKey,
        checksum,
        uploadedBy: userId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        financialSpaceId: spaceId,
        userId,
        operation: 'attachment.upload',
        entityType: 'Attachment',
        entityId: row.id,
        safeSummary: {
          fileName,
          contentType: validation.contentType,
          size: file.size,
          checksum,
        },
      },
    });

    return toView(row);
  }

  async download(
    spaceId: string,
    transactionId: string,
    attachmentId: string,
  ): Promise<AttachmentDownload> {
    const row = await this.findOwned(spaceId, transactionId, attachmentId);
    const buffer = await readFile(join(storageRoot(), row.storageKey));
    return { fileName: row.fileName, contentType: row.contentType, buffer };
  }

  async remove(
    spaceId: string,
    transactionId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    const row = await this.findOwned(spaceId, transactionId, attachmentId);
    // O arquivo e removido primeiro; a linha some em seguida. `force` tolera
    // um arquivo ja ausente (remocao idempotente).
    await rm(join(storageRoot(), row.storageKey), { force: true });
    await this.prisma.attachment.delete({ where: { id: row.id } });

    await this.prisma.auditLog.create({
      data: {
        financialSpaceId: spaceId,
        userId,
        operation: 'attachment.remove',
        entityType: 'Attachment',
        entityId: row.id,
        safeSummary: { fileName: row.fileName, checksum: row.checksum },
      },
    });
  }

  private async ensureTransaction(spaceId: string, transactionId: string): Promise<void> {
    const trx = await this.prisma.transaction.findUnique({
      where: { id: transactionId, financialSpaceId: spaceId },
      select: { id: true },
    });
    if (!trx) throw new NotFoundException('Transacao nao encontrada');
  }

  private async findOwned(
    spaceId: string,
    transactionId: string,
    attachmentId: string,
  ): Promise<AttachmentRow> {
    const row = await this.prisma.attachment.findUnique({
      where: { id: attachmentId, financialSpaceId: spaceId, transactionId },
    });
    if (!row) throw new NotFoundException('Comprovante nao encontrado');
    return row;
  }
}

function toView(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    transactionId: row.transactionId,
    fileName: row.fileName,
    contentType: row.contentType,
    size: row.size,
    checksum: row.checksum,
    createdAt: row.createdAt.toISOString(),
  };
}
