import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react-native';
import {
  discardOfflineConflicts,
  flushOfflineQueue,
  getOfflineSnapshot,
  subscribeOffline,
} from '../lib/offline';

/**
 * Faixa de status offline do app: indica falta de conexao, quantas mutacoes
 * estao na fila e quantas ficaram em conflito (reconciliacao manual). Some
 * quando online, sem pendencia e sem conflito.
 */
export default function OfflineBanner() {
  const snapshot = useSyncExternalStore(subscribeOffline, getOfflineSnapshot);
  const [status, pendingRaw, conflictRaw] = snapshot.split('|');
  const pending = Number(pendingRaw) || 0;
  const conflicts = Number(conflictRaw) || 0;
  const offline = status === 'offline';

  if (!offline && pending === 0) return null;

  const hasConflicts = conflicts > 0;
  const tone = hasConflicts ? 'text-danger-700' : offline ? 'text-warning-700' : 'text-brand-700';
  const iconColor = hasConflicts ? '#b91c1c' : offline ? '#c75002' : '#1743dc';

  return (
    <View
      testID="offline-status"
      className={`border ${
        hasConflicts
          ? 'border-danger-200 bg-danger-50'
          : offline
            ? 'border-warning-200 bg-warning-50'
            : 'border-brand-200 bg-brand-50'
      }`}
      style={styles.wrap}
    >
      {hasConflicts ? (
        <AlertTriangle size={14} color={iconColor} />
      ) : offline ? (
        <CloudOff size={14} color={iconColor} />
      ) : (
        <RefreshCw size={14} color={iconColor} />
      )}
      <Text className={tone} style={styles.text}>
        {hasConflicts
          ? 'Alteracoes nao aplicadas por conflito de versao.'
          : offline
            ? 'Sem conexao. Alteracoes sincronizam ao reconectar.'
            : 'Alteracoes aguardando sincronizacao.'}
      </Text>
      {pending > 0 && (
        <Text className={tone} style={styles.count}>
          {pending} na fila
        </Text>
      )}
      {hasConflicts && (
        <Pressable testID="offline-descartar" onPress={() => void discardOfflineConflicts()}>
          <Text className="text-danger-700" style={styles.action}>
            Descartar
          </Text>
        </Pressable>
      )}
      {!offline && pending > 0 && (
        <Pressable testID="offline-sincronizar" onPress={() => void flushOfflineQueue(true)}>
          <Text className="text-brand-700" style={styles.action}>
            Sincronizar
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 74,
    zIndex: 30,
    elevation: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: { flex: 1, fontSize: 12 },
  count: { fontSize: 12, fontWeight: '600' },
  action: { fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
});
