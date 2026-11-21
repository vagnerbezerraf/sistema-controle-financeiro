import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CloudOff, RefreshCw } from 'lucide-react-native';
import { flushOfflineQueue, getOfflineSnapshot, subscribeOffline } from '../lib/offline';

/**
 * Faixa de status offline do app: indica falta de conexao e quantas mutacoes
 * estao na fila aguardando sincronizacao. Some quando online e sem pendencia.
 */
export default function OfflineBanner() {
  const snapshot = useSyncExternalStore(subscribeOffline, getOfflineSnapshot);
  const [status, pendingRaw] = snapshot.split('|');
  const pending = Number(pendingRaw) || 0;
  const offline = status === 'offline';

  if (!offline && pending === 0) return null;

  const tone = offline ? 'text-warning-700' : 'text-brand-700';

  return (
    <View
      testID="offline-status"
      className={`border ${offline ? 'border-warning-200 bg-warning-50' : 'border-brand-200 bg-brand-50'}`}
      style={styles.wrap}
    >
      {offline ? <CloudOff size={14} color="#c75002" /> : <RefreshCw size={14} color="#1743dc" />}
      <Text className={tone} style={styles.text}>
        {offline ? 'Sem conexao. Alteracoes sincronizam ao reconectar.' : 'Alteracoes aguardando sincronizacao.'}
      </Text>
      {pending > 0 && (
        <Text className={tone} style={styles.count}>
          {pending} na fila
        </Text>
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
