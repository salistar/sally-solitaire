/**
 * @file InfraCheckButton.tsx
 * @description Bouton "Vérifier l'infrastructure" + modal de résultats.
 *
 * À déposer dans /settings (ou n'importe quel écran). Lance `runInfraCheck`
 * en parallèle (API + Socket + TURN), affiche les latences et l'état OK/KO
 * pour chaque service. Utile au support pour diagnostiquer un problème
 * côté joueur ("le matchmaking ne marche pas") sans logs.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { runInfraCheck, type InfraCheckResult } from '../../shared/infraCheck';

export default function InfraCheckButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<InfraCheckResult[]>([]);

  const run = async () => {
    setOpen(true);
    setLoading(true);
    const res = await runInfraCheck();
    setResults(res);
    setLoading(false);
  };

  return (
    <>
      <TouchableOpacity onPress={run} activeOpacity={0.85} style={styles.btn}>
        <LinearGradient colors={['#0EA5E9', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGrad}>
          <Ionicons name="pulse" size={16} color="#fff" />
          <Text style={styles.btnText}>Vérifier l'infrastructure</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Ionicons name="pulse" size={20} color="#0EA5E9" />
              <Text style={styles.title}>État de l'infra</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color="#0EA5E9" />
                <Text style={styles.loadingText}>Pinging api · socket · turn …</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ gap: 8 }}>
                {results.map((r) => (
                  <View key={r.service} style={[styles.row, r.ok ? styles.rowOk : styles.rowKo]}>
                    <Ionicons
                      name={r.ok ? 'checkmark-circle' : 'close-circle'}
                      size={20}
                      color={r.ok ? '#10B981' : '#EF4444'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowService}>{r.service.toUpperCase()}</Text>
                      <Text style={styles.rowUrl} numberOfLines={1}>{r.url}</Text>
                      {r.error && <Text style={styles.rowError}>{r.error}</Text>}
                    </View>
                    <Text style={[styles.rowLatency, r.ok ? styles.latencyOk : styles.latencyKo]}>
                      {r.ok ? `${r.latencyMs}ms` : 'KO'}
                    </Text>
                  </View>
                ))}
                <TouchableOpacity onPress={run} style={styles.retryBtn}>
                  <Ionicons name="refresh" size={14} color="#fff" />
                  <Text style={styles.retryText}>Re-vérifier</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: 12, overflow: 'hidden' },
  btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  btnText: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Black' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#1F2937', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(14,165,233,0.4)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  title: { color: '#fff', fontSize: 16, fontFamily: 'Inter-Black', flex: 1 },
  closeBtn: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 4 },

  loadingWrap: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 24 },
  loadingText: { color: '#9CA3AF', fontSize: 12 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1 },
  rowOk: { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.4)' },
  rowKo: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.4)' },
  rowService: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Black', letterSpacing: 1 },
  rowUrl: { color: '#9CA3AF', fontSize: 10, marginTop: 1 },
  rowError: { color: '#FCA5A5', fontSize: 10, marginTop: 2 },
  rowLatency: { fontSize: 12, fontFamily: 'Inter-Black' },
  latencyOk: { color: '#10B981' },
  latencyKo: { color: '#EF4444' },

  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: '#0EA5E9' },
  retryText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Bold' },
});

/* === End of InfraCheckButton.tsx — Solitaire — SallyCards === */
