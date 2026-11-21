'use client';
import { useSyncExternalStore } from 'react';
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react';
import { cls } from '@/lib/format';
import {
  discardOfflineConflicts,
  flushOfflineQueue,
  getOfflineSnapshot,
  subscribeOffline,
} from '@/lib/offline';

/**
 * Faixa de status offline no topo do app: indica falta de conexao, quantas
 * mutacoes estao na fila e quantas ficaram em conflito (reconciliacao manual).
 */
export default function OfflineBanner() {
  const snapshot = useSyncExternalStore(subscribeOffline, getOfflineSnapshot);
  const [status, pendingRaw, conflictRaw] = snapshot.split('|');
  const pending = Number(pendingRaw) || 0;
  const conflicts = Number(conflictRaw) || 0;
  const offline = status === 'offline';

  if (!offline && pending === 0) return null;

  const hasConflicts = conflicts > 0;
  const tone = hasConflicts
    ? 'border-danger-200 bg-danger-50 text-danger-700'
    : offline
      ? 'border-warning-200 bg-warning-50 text-warning-700'
      : 'border-brand-200 bg-brand-50 text-brand-700';

  return (
    <div
      id="offline-status"
      data-status={hasConflicts ? 'conflict' : offline ? 'offline' : 'pending'}
      className={cls('flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs', tone)}
    >
      {hasConflicts ? (
        <AlertTriangle className="h-3.5 w-3.5" />
      ) : offline ? (
        <CloudOff className="h-3.5 w-3.5" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      <span>
        {hasConflicts
          ? 'Alteracoes nao aplicadas por conflito de versao.'
          : offline
            ? 'Sem conexao. As alteracoes ficam na fila e sincronizam ao reconectar.'
            : 'Alteracoes aguardando sincronizacao.'}
      </span>
      {pending > 0 && <span className="font-semibold">{pending} na fila</span>}
      {hasConflicts && (
        <button
          type="button"
          id="offline-descartar"
          className="underline underline-offset-2"
          onClick={() => void discardOfflineConflicts()}
        >
          Descartar conflitos
        </button>
      )}
      {!offline && pending > 0 && (
        <button
          type="button"
          id="offline-sincronizar"
          className="underline underline-offset-2"
          onClick={() => void flushOfflineQueue(true)}
        >
          Sincronizar agora
        </button>
      )}
    </div>
  );
}
