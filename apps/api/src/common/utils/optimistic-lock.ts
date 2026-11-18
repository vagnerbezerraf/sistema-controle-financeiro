import { ConflictException, NotFoundException } from '@nestjs/common';

/** Codigo devolvido no corpo quando a versao enviada ficou desatualizada. */
export const STALE_VERSION_CODE = 'STALE_VERSION';

interface OptimisticUpdateOptions<T> {
  /** Executa o UPDATE condicional pela versao e devolve quantas linhas mudaram. */
  applyConditionalUpdate: () => Promise<number>;
  /** Recarrega o recurso ja com a versao incrementada. */
  reload: () => Promise<T>;
  /** Verifica se o recurso existe, para diferenciar 404 de 409. */
  exists: () => Promise<boolean>;
  notFoundMessage: string;
  staleMessage: string;
}

/**
 * Atualizacao com concorrencia otimista: se o `applyConditionalUpdate` nao
 * afetar nenhuma linha, ou o recurso nao existe (404) ou a `version` enviada
 * pelo cliente esta desatualizada (409 STALE_VERSION) — sinal de que outra
 * sessao alterou o registro no meio do caminho.
 */
export async function updateWithOptimisticLock<T>(opts: OptimisticUpdateOptions<T>): Promise<T> {
  const affected = await opts.applyConditionalUpdate();
  if (affected === 0) {
    if (!(await opts.exists())) throw new NotFoundException(opts.notFoundMessage);
    throw new ConflictException({ code: STALE_VERSION_CODE, message: opts.staleMessage });
  }
  return opts.reload();
}
