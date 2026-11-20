import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { ImportBatch as ImportBatchModel } from '@prisma/client';
import type {
  CommitImportResult,
  ImportBatch,
  ImportFormat,
  ImportPreview,
} from '@scf/api-contracts';
import { toDate } from '../common/utils/date';
import { CategorizationService } from '../categorization/categorization.service';
import { resolveCategoryId, type CategorizationTargetType } from '../categorization/domain/categorization-rule';
import {
  buildImportPreview,
  type ExistingEntry,
  type ImportRowType,
  type ParsedImportRow,
} from './domain/import-rows';
import { parseCsv } from './domain/csv-import';
import { parseOfx } from './domain/ofx-import';

/** Limite de lotes devolvidos na auditoria. */
const LIST_LIMIT = 100;

/** Extrai as linhas do extrato usando o parser do formato informado. */
function parseSource(format: ImportFormat, text: string): ParsedImportRow[] {
  return format === 'ofx' ? parseOfx(text) : parseCsv(text);
}

/**
 * Servico de importacao de extrato (CSV ou OFX). A previa e persistida como um
 * lote (`import_batches`) guardando o texto original: isso permite auditar depois
 * e desfazer o commit cancelando os lancamentos que ele criou.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly categorization: CategorizationService,
  ) {}

  /** Cria a previa (nao aplicada) a partir do texto do extrato. */
  async preview(
    spaceId: string,
    accountId: string,
    source: string,
    format: ImportFormat = 'csv',
    fileName?: string,
  ): Promise<ImportPreview> {
    if (!source.trim()) {
      throw new BadRequestException({
        code: format === 'ofx' ? 'EMPTY_OFX' : 'EMPTY_CSV',
        message: format === 'ofx' ? 'O arquivo OFX esta vazio' : 'O arquivo CSV esta vazio',
      });
    }
    await this.assertAccount(spaceId, accountId);

    const parsed = parseSource(format, source);
    const existing = await this.loadExisting(spaceId, accountId, parsed);
    const { rows, summary } = buildImportPreview(parsed, existing);

    const batch = await this.prisma.importBatch.create({
      data: {
        financialSpaceId: spaceId,
        accountId,
        status: 'previewed',
        format,
        fileName: fileName ?? null,
        sourceText: source,
        rowCount: summary.total,
        validCount: summary.valid,
        invalidCount: summary.invalid,
        duplicateCount: summary.duplicates,
      },
    });

    return { batch: this.toBatch(batch), rows, summary };
  }

  /** Lista os lotes do espaco (auditoria), do mais recente para o mais antigo. */
  async list(spaceId: string, status?: 'previewed' | 'committed' | 'undone'): Promise<ImportBatch[]> {
    const batches = await this.prisma.importBatch.findMany({
      where: { financialSpaceId: spaceId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return batches.map((batch) => this.toBatch(batch));
  }

  /** Detalhe do lote, reclassificando as linhas contra o estado atual dos dados. */
  async detail(spaceId: string, batchId: string): Promise<ImportPreview> {
    const batch = await this.findBatch(spaceId, batchId);
    const parsed = parseSource(batch.format, batch.sourceText);
    // Os lancamentos do proprio lote sao ignorados na deduplicacao: senao um
    // lote ja importado apareceria com todas as linhas como duplicadas.
    const existing = await this.loadExisting(spaceId, batch.accountId, parsed, batch.createdTransactionIds);
    const { rows, summary } = buildImportPreview(parsed, existing);
    return { batch: this.toBatch(batch), rows, summary };
  }

  /** Aplica o lote: cria os lancamentos das linhas validas como confirmados. */
  async commit(spaceId: string, batchId: string, userId: string): Promise<CommitImportResult> {
    const batch = await this.findBatch(spaceId, batchId);
    if (batch.status !== 'previewed') {
      throw new ConflictException({
        code: 'IMPORT_BATCH_NOT_PREVIEWED',
        message: 'Somente lotes em previa podem ser importados',
      });
    }

    // Reclassifica contra o estado atual: o que era valido na previa pode ter
    // virado duplicata nesse meio-tempo, por isso o total aplicado pode ser menor.
    const parsed = parseSource(batch.format, batch.sourceText);
    const existing = await this.loadExisting(spaceId, batch.accountId, parsed);
    const { summary, rows } = buildImportPreview(parsed, existing);
    const valid = rows.filter((row) => row.status === 'valid');

    // As regras ativas sao lidas uma vez e aplicadas a cada linha: o lancamento
    // importado ja nasce categorizado, sem exigir a aplicacao retroativa depois.
    const rules = await this.categorization.loadRuleInputs(spaceId);

    // O extrato nao traz a moeda; ela vem da conta de destino do lote.
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: batch.accountId },
      select: { currency: true },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const createdIds: string[] = [];
      for (const row of valid) {
        const categoryId = resolveCategoryId(rules, {
          description: row.description,
          type: row.type as CategorizationTargetType,
        });
        const created = await tx.transaction.create({
          data: {
            financialSpaceId: spaceId,
            type: row.type as ImportRowType,
            status: 'confirmed',
            description: row.description,
            categoryId,
            currency: account.currency,
            totalAmount: row.amount as string,
            effectiveDate: toDate(row.date as string),
            postings: {
              create: [
                {
                  accountId: batch.accountId,
                  amount: row.amount as string,
                  direction: row.type === 'income' ? 'debit' : 'credit',
                  effectiveDate: toDate(row.date as string),
                },
              ],
            },
          },
          select: { id: true },
        });
        createdIds.push(created.id);
      }

      const record = await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: 'committed',
          committedAt: new Date(),
          importedCount: createdIds.length,
          createdTransactionIds: createdIds,
        },
      });

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId,
          operation: 'import.commit',
          entityType: 'ImportBatch',
          entityId: batch.id,
          safeSummary: {
            fileName: batch.fileName,
            rowCount: batch.rowCount,
            importedCount: createdIds.length,
            skippedCount: Math.max(0, batch.validCount - createdIds.length),
            remainingDuplicates: summary.duplicates,
          },
        },
      });

      return record;
    });

    return {
      batch: this.toBatch(updated),
      importedCount: updated.importedCount,
      skippedCount: Math.max(0, batch.validCount - updated.importedCount),
    };
  }

  /** Desfaz a importacao: cancela (exclusao logica) os lancamentos criados. */
  async undo(spaceId: string, batchId: string, userId: string): Promise<ImportBatch> {
    const batch = await this.findBatch(spaceId, batchId);
    if (batch.status !== 'committed') {
      throw new ConflictException({
        code: 'IMPORT_BATCH_NOT_COMMITTED',
        message: 'Somente lotes importados podem ser desfeitos',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (batch.createdTransactionIds.length > 0) {
        await tx.transaction.updateMany({
          where: { id: { in: batch.createdTransactionIds }, financialSpaceId: spaceId },
          data: { status: 'canceled' },
        });
      }

      const record = await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: 'undone', undoneAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          financialSpaceId: spaceId,
          userId,
          operation: 'import.undo',
          entityType: 'ImportBatch',
          entityId: batch.id,
          safeSummary: {
            fileName: batch.fileName,
            revertedTransactions: batch.createdTransactionIds.length,
          },
        },
      });

      return record;
    });

    return this.toBatch(updated);
  }

  private async findBatch(spaceId: string, batchId: string): Promise<ImportBatchModel> {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, financialSpaceId: spaceId },
    });
    if (!batch) throw new NotFoundException('Lote de importacao nao encontrado');
    return batch;
  }

  /** Garante que a conta de destino pertence ao espaco (evita referencia cruzada). */
  private async assertAccount(spaceId: string, accountId: string): Promise<void> {
    const count = await this.prisma.account.count({ where: { id: accountId, financialSpaceId: spaceId } });
    if (count === 0) {
      throw new BadRequestException({
        code: 'INVALID_ACCOUNT',
        message: 'Conta nao pertence a este espaco financeiro',
      });
    }
  }

  /**
   * Le os lancamentos existentes na conta dentro da janela de datas do arquivo,
   * para deduplicar contra o que ja esta registrado. Limitar a janela mantem a
   * leitura proporcional ao arquivo importado.
   */
  private async loadExisting(
    spaceId: string,
    accountId: string,
    parsed: ParsedImportRow[],
    excludeTransactionIds: string[] = [],
  ): Promise<ExistingEntry[]> {
    const dates = parsed.map((row) => row.date).filter((date): date is string => date !== null);
    if (dates.length === 0) return [];
    const from = dates.reduce((min, date) => (date < min ? date : min));
    const to = dates.reduce((max, date) => (date > max ? date : max));

    const transactions = await this.prisma.transaction.findMany({
      where: {
        financialSpaceId: spaceId,
        status: { not: 'canceled' },
        effectiveDate: { gte: toDate(from), lte: toDate(to) },
        postings: { some: { accountId } },
        ...(excludeTransactionIds.length > 0 ? { id: { notIn: excludeTransactionIds } } : {}),
      },
      select: { type: true, totalAmount: true, effectiveDate: true, description: true },
    });

    return transactions.flatMap((transaction) => {
      if (transaction.type !== 'income' && transaction.type !== 'expense') return [];
      return [
        {
          date: transaction.effectiveDate.toISOString().slice(0, 10),
          description: transaction.description,
          amount: transaction.totalAmount.abs().toFixed(2),
          type: transaction.type as ImportRowType,
        },
      ];
    });
  }

  private toBatch(batch: ImportBatchModel): ImportBatch {
    return {
      id: batch.id,
      financialSpaceId: batch.financialSpaceId,
      accountId: batch.accountId,
      status: batch.status,
      format: batch.format,
      fileName: batch.fileName,
      rowCount: batch.rowCount,
      validCount: batch.validCount,
      invalidCount: batch.invalidCount,
      duplicateCount: batch.duplicateCount,
      importedCount: batch.importedCount,
      committedAt: batch.committedAt ? batch.committedAt.toISOString() : null,
      undoneAt: batch.undoneAt ? batch.undoneAt.toISOString() : null,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };
  }
}
