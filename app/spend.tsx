/**
 * @file spend.tsx
 * @description Boutique d'items où le joueur dépense les coins GAGNÉS (defi
 * du jour / streaks / victoires). Distinct de shop.tsx (IAP).
 *
 * Redesign : AppHeader on-brand + wallet hero animé + sections catégories
 * stylées + cartes items polish (icône large, hover, état owned/applied).
 * Skip-friendly en mode local — affiche une CTA pour se connecter.
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Alert, Animated, Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import { useIsLocal } from '../src/contexts/useAppMode';
import * as api from '../shared/api';
import { useAchievementToast } from '../src/contexts/AchievementToastContext';
import { useCardSkin, type SkinId } from '../src/contexts/useCardSkin';

const CATEGORY_META: Record<string, { label: string; icon: string; gradient: [string, string] }> = {
  consumable: { label: 'Consommables', icon: '🛠', gradient: ['#0EA5E9', '#0369A1'] },
  cosmetic: { label: 'Cosmétiques', icon: '🎨', gradient: ['#EC4899', '#BE185D'] },
  boost: { label: 'Boosts', icon: '⚡', gradient: ['#F59E0B', '#B45309'] },
};

export default function SpendScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const isLocal = useIsLocal();
  const toast = useAchievementToast();
  const cardSkin = useCardSkin();
  const [items, setItems] = useState<api.ShopItem[]>([]);
  const [coins, setCoins] = useState(0);
  const [inventory, setInventory] = useState<api.InventoryDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<{ id: string; username: string } | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  // Coin balance pulse animation on purchase
  const coinPulse = useRef(new Animated.Value(1)).current;

  const loadAll = useCallback(async () => {
    if (isLocal) { setLoading(false); return; }
    setLoading(true);
    try {
      const user = await api.getMe().catch(() => null);
      const [shopItems, rewards] = await Promise.all([
        api.fetchShopItems(),
        user?.id ? api.fetchUserRewards(user.id) : Promise.resolve(null),
      ]);
      const inv = user?.id ? await api.fetchInventory(user.id) : null;
      if (user) setMe({ id: user.id, username: user.username });
      setItems(shopItems);
      setCoins(rewards?.coins ?? 0);
      setInventory(inv);
    } finally {
      setLoading(false);
    }
  }, [isLocal]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const ownedQty = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of inventory?.items ?? []) map[it.itemId] = it.qty;
    return map;
  }, [inventory]);

  const activeUntilByItem = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of inventory?.items ?? []) {
      if (it.activeUntil && it.activeUntil > Date.now()) map[it.itemId] = it.activeUntil;
    }
    return map;
  }, [inventory]);

  const formatBoostRemaining = (untilMs: number): string => {
    const remaining = Math.max(0, untilMs - Date.now());
    const h = Math.floor(remaining / 3_600_000);
    const m = Math.floor((remaining % 3_600_000) / 60_000);
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
  };

  const grouped = useMemo(() => {
    const out: Record<string, api.ShopItem[]> = {};
    for (const it of items) {
      if (!out[it.category]) out[it.category] = [];
      out[it.category].push(it);
    }
    return out;
  }, [items]);

  const buy = useCallback(async (item: api.ShopItem) => {
    if (!me) {
      Alert.alert('Connexion requise', 'Connecte-toi pour acheter des items.');
      return;
    }
    if (coins < item.priceCoins) {
      Alert.alert(
        '🪙 Coins insuffisants',
        `Tu as ${coins} coins, il en faut ${item.priceCoins}.\n\nJoue le défi du jour pour en gagner !`,
      );
      return;
    }
    if (item.oneTime && (ownedQty[item.id] ?? 0) >= 1) {
      Alert.alert('Déjà possédé', `${item.name} est déjà dans ton inventaire.`);
      return;
    }
    setPurchasing(item.id);
    const result = await api.purchaseShopItem({
      userId: me.id,
      displayName: me.username,
      itemId: item.id,
    });
    setPurchasing(null);
    if (!result) {
      Alert.alert('Erreur', 'Achat échoué. Réessaie.');
      return;
    }
    if (!result.ok) {
      const msg =
        result.reason === 'insufficient-coins' ? `Il te manque ${(result.needed ?? 0) - (result.has ?? 0)} coins.` :
        result.reason === 'already-owned' ? 'Tu possèdes déjà cet item.' :
        'Achat refusé.';
      Alert.alert('Achat impossible', msg);
      return;
    }
    Alert.alert(
      '✅ Achat réussi',
      `Tu as acquis "${result.item.name}" pour ${result.item.priceCoins} coins.\nIl te reste ${result.coinsAfter} coins.`,
    );
    setCoins(result.coinsAfter);
    // Pulse — visual confirmation that balance changed
    Animated.sequence([
      Animated.timing(coinPulse, { toValue: 1.2, duration: 200, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      Animated.timing(coinPulse, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    if (result.unlockedAchievements && result.unlockedAchievements.length > 0) {
      toast.showAchievements(result.unlockedAchievements);
    }
    const inv = await api.fetchInventory(me.id);
    setInventory(inv);
  }, [me, coins, ownedQty, toast, coinPulse]);

  return (
    <View style={s.root}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <AppHeader title="Boutique items" subtitle="Dépense tes coins gagnés" showBack />

      {/* Wallet hero gold gradient */}
      <LinearGradient
        colors={['rgba(252,211,77,0.18)', 'rgba(124,58,237,0.18)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.heroCard}
      >
        <View style={s.heroLeft}>
          <Text style={s.heroLabel}>SOLDE COINS</Text>
          <Animated.View style={[s.coinRow, { transform: [{ scale: coinPulse }] }]}>
            <Text style={s.coinEmoji}>🪙</Text>
            <Text style={s.coinValue}>{coins.toLocaleString()}</Text>
          </Animated.View>
          {inventory && inventory.totalPurchases > 0 && (
            <Text style={s.heroSubInfo}>
              {inventory.totalPurchases} achats · {inventory.totalCoinsSpent.toLocaleString()} dépensés
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => router.push('/shop')}
          style={s.refillBtn}
        >
          <LinearGradient
            colors={['#FCD34D', '#F59E0B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.refillGrad}
          >
            <Ionicons name="add-circle" size={16} color="#78350F" />
            <Text style={s.refillText}>Recharger</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>

      {isLocal ? (
        <View style={s.offlineWrap}>
          <Ionicons name="cloud-offline-outline" size={56} color="rgba(167,139,250,0.5)" />
          <Text style={s.offlineTitle}>Mode hors-ligne</Text>
          <Text style={s.offlineText}>
            La boutique d'items nécessite une connexion. Active le mode connecté pour accéder à tes coins.
          </Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor="#FCD34D" />}
          contentContainerStyle={s.scrollContent}
        >
          {Object.entries(grouped).map(([category, list]) => {
            const meta = CATEGORY_META[category] ?? { label: category, icon: '📦', gradient: ['#475569', '#1E293B'] as [string, string] };
            return (
              <View key={category} style={s.categoryBlock}>
                <LinearGradient colors={meta.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.categoryHeader}>
                  <Text style={s.categoryIcon}>{meta.icon}</Text>
                  <Text style={s.categoryLabel}>{meta.label}</Text>
                  <Text style={s.categoryCount}>{list.length}</Text>
                </LinearGradient>

                <View style={s.grid}>
                  {list.map((item) => {
                    const owned = ownedQty[item.id] ?? 0;
                    const isOwnedCosmetic = item.oneTime && owned >= 1;
                    const canAfford = coins >= item.priceCoins;
                    const isPurchasing = purchasing === item.id;
                    const isSkin = item.id.startsWith('skin_');
                    const isApplied = isSkin && cardSkin.current === item.id;
                    const activeUntil = activeUntilByItem[item.id];
                    const isBoostActive = !!activeUntil;
                    return (
                      <View key={item.id} style={[s.card, isOwnedCosmetic && s.cardOwned, isBoostActive && s.cardActive]}>
                        <Text style={s.itemIcon}>{item.icon}</Text>
                        <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                        <Text style={s.itemDesc} numberOfLines={2}>{item.description}</Text>

                        {/* État badges */}
                        {owned > 0 && !item.oneTime && !isBoostActive && (
                          <View style={s.ownedBadge}>
                            <Text style={s.ownedBadgeText}>×{owned}</Text>
                          </View>
                        )}
                        {isBoostActive && (
                          <View style={s.boostActiveBadge}>
                            <Ionicons name="flash" size={10} color="#FCD34D" />
                            <Text style={s.boostActiveText}>{formatBoostRemaining(activeUntil)}</Text>
                          </View>
                        )}

                        {/* Apply pour skins */}
                        {isSkin && isOwnedCosmetic && (
                          <TouchableOpacity
                            style={[s.applyBtn, isApplied && s.applyBtnActive]}
                            onPress={async () => {
                              if (isApplied) await cardSkin.setCurrent('default');
                              else await cardSkin.setCurrent(item.id as SkinId);
                            }}
                          >
                            <Text style={s.applyBtnText}>
                              {isApplied ? '✓ Appliqué' : 'Appliquer'}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {/* Buy button — gradient when affordable */}
                        <TouchableOpacity
                          onPress={() => buy(item)}
                          disabled={isOwnedCosmetic || !canAfford || isPurchasing}
                          activeOpacity={0.8}
                          style={s.buyBtnWrap}
                        >
                          {isOwnedCosmetic ? (
                            <View style={[s.buyBtn, s.buyBtnOwned]}>
                              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                              <Text style={s.buyBtnOwnedText}>Possédé</Text>
                            </View>
                          ) : !canAfford ? (
                            <View style={[s.buyBtn, s.buyBtnDisabled]}>
                              <Text style={s.coinIconMini}>🪙</Text>
                              <Text style={s.buyBtnDisabledText}>{item.priceCoins}</Text>
                            </View>
                          ) : (
                            <LinearGradient
                              colors={meta.gradient}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={s.buyBtn}
                            >
                              {isPurchasing ? (
                                <Text style={s.buyBtnText}>…</Text>
                              ) : (
                                <>
                                  <Text style={s.coinIconMini}>🪙</Text>
                                  <Text style={s.buyBtnText}>{item.priceCoins}</Text>
                                </>
                              )}
                            </LinearGradient>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* Footer info */}
          <View style={s.footer}>
            <Text style={s.footerText}>
              💡 Les coins se gagnent au défi du jour, en complétant les variantes, et en débloquant des achievements.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  // ── Hero wallet ────────────────────────────────────────────────
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.3)',
  },
  heroLeft: { flex: 1 },
  heroLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, letterSpacing: 1.5, fontFamily: 'Inter-Bold' },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  coinEmoji: { fontSize: 28 },
  coinValue: { color: '#FCD34D', fontSize: 28, fontFamily: 'Inter-Black' },
  heroSubInfo: { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4 },
  refillBtn: { borderRadius: 999, overflow: 'hidden' },
  refillGrad: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 },
  refillText: { color: '#78350F', fontSize: 12, fontFamily: 'Inter-Black' },

  // ── Offline ───────────────────────────────────────────────────
  offlineWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  offlineTitle: { color: '#fff', fontSize: 18, fontFamily: 'Inter-Black' },
  offlineText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // ── Scroll content ────────────────────────────────────────────
  scrollContent: { paddingBottom: 32 },

  // ── Category block ────────────────────────────────────────────
  categoryBlock: { marginTop: 8 },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
  },
  categoryIcon: { fontSize: 18 },
  categoryLabel: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Black', letterSpacing: 1, flex: 1 },
  categoryCount: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Inter-Bold' },

  // ── Grid items ────────────────────────────────────────────────
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, gap: 8, justifyContent: 'space-between' },
  card: {
    width: '48%',
    backgroundColor: 'rgba(15,11,40,0.7)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
    alignItems: 'center',
    minHeight: 170,
  },
  cardOwned: { borderColor: 'rgba(16,185,129,0.5)', backgroundColor: 'rgba(16,185,129,0.08)' },
  cardActive: { borderColor: 'rgba(252,211,77,0.5)', backgroundColor: 'rgba(252,211,77,0.05)' },

  itemIcon: { fontSize: 32, marginBottom: 4 },
  itemName: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Black', textAlign: 'center' },
  itemDesc: { color: '#9CA3AF', fontSize: 10, textAlign: 'center', marginTop: 4, marginBottom: 8, minHeight: 28 },

  ownedBadge: { backgroundColor: 'rgba(16,185,129,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(16,185,129,0.5)' },
  ownedBadgeText: { color: '#10B981', fontSize: 10, fontFamily: 'Inter-Black' },
  boostActiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(252,211,77,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(252,211,77,0.5)' },
  boostActiveText: { color: '#FCD34D', fontSize: 10, fontFamily: 'Inter-Black' },

  applyBtn: {
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginBottom: 6,
    backgroundColor: 'rgba(167,139,250,0.18)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.5)',
    alignSelf: 'stretch', alignItems: 'center',
  },
  applyBtnActive: { backgroundColor: 'rgba(16,185,129,0.25)', borderColor: '#10B981' },
  applyBtnText: { color: '#E9D5FF', fontSize: 11, fontFamily: 'Inter-Bold' },

  // ── Buy button ────────────────────────────────────────────────
  buyBtnWrap: { alignSelf: 'stretch', marginTop: 'auto', borderRadius: 8, overflow: 'hidden' },
  buyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  coinIconMini: { fontSize: 14 },
  buyBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Black' },
  buyBtnDisabled: { backgroundColor: 'rgba(71,85,105,0.5)' },
  buyBtnDisabledText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: 'Inter-Black' },
  buyBtnOwned: { backgroundColor: 'rgba(16,185,129,0.18)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.5)' },
  buyBtnOwnedText: { color: '#10B981', fontSize: 12, fontFamily: 'Inter-Black' },

  // ── Footer ────────────────────────────────────────────────────
  footer: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  footerText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center', lineHeight: 16 },
});

/* === End of spend.tsx — Solitaire — SallyCards === */
