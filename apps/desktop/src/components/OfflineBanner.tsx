import { useSyncExternalStore } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { flushOfflineQueue, getOfflineSnapshot, subscribeOffline } from '../lib/offline';
import { cls } from '../lib/format';

/**
 * Faixa de status offline exibida no topo do app: indica falta de conexao e
 * quantas mutacoes estao na fila aguardando sincronizacao.
 */
export default function OfflineBanner() {
  const snapshot = useSyncExternalStore(subscribeOffline, getOfflineSnapshot);
  const [status, pendingRaw] = snapshot.split('|');
  const pending = Number(pendingRaw) || 0;
  const offline = status === 'offline';

  if (!offline && pending === 0) return null;

  return (
    <div
      id="offline-status"
      data-status={offline ? 'offline' : 'pending'}
      className={cls(
        'flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs',
        offline ? 'border-warning-200 bg-warning-50 text-warning-700' : 'border-brand-200 bg-brand-50 text-brand-700',
      )}
    >
      {offline ? <CloudOff className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
      <span>
        {offline
          ? 'Sem conexao. As alteracoes ficam na fila e sincronizam ao reconectar.'
          : 'Alteracoes aguardando sincronizacao.'}
      </span>
      {pending > 0 && <span className="font-semibold">{pending} na fila</span>}
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
