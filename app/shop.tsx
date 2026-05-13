/**
 * @file shop.tsx
 * @description Boutique Sally Coins pour Solitaire — acheter des packs de coins
 * via IAP (RevenueCat — clé fournie via secret EAS).
 *
 * Redesign : palette feutre vert/violet identique aux écrans moteur, hero
 * compact avec wallet animé, grille de packages avec gradient + ribbons,
 * modal de confirmation custom (au lieu d'Alert), banner offline pour le
 * mode local. Distincte de spend.tsx qui dépense les coins GAGNÉS.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import { useIsLocal } from '../src/contexts/useAppMode';
import { logger } from '../src/utils/logger';
import * as api from '../shared/api';

const log = logger.scoped('ShopScreen');

export default function ShopScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const isLocal = useIsLocal();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<api.ShopPackage[]>([]);
  const [user, setUser] = useState<api.User | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [confirmPkg, setConfirmPkg] = useState<api.ShopPackage | null>(null);
  // Animated coin balance — bumps when balance increases after a purchase.
  const coinPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    log.screen('mounted');
    if (isLocal) {
      // No backend in local mode — skip fetch, show offline state.
      setLoading(false);
      return;
    }
    (async () => {
      try {
        log.bin('GET /shop/packages');
        const [pkgs, u] = await Promise.all([api.getShopPackages(), api.getMe()]);
        log.bout('200 /shop/packages', `${pkgs.length} packs`);
        setPackages(pkgs);
        setUser(u);
      } catch (e) {
        log.error('init shop failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isLocal]);

  const handleConfirmPurchase = async () => {
    const pkg = confirmPkg;
    if (!pkg) return;
    setConfirmPkg(null);
    setPurchasing(pkg.productId);
    try {
      const fakeId = `dev-${Date.now()}`;
      log.apiIn(`RevenueCat Purchases.purchasePackage(${pkg.productId})`);
      log.apiOut(`SUCCESS purchaseId=${fakeId} (stub mode)`);
      log.bin('POST /shop/purchase/confirm', { productId: pkg.productId });
      const out = await api.confirmPurchase('solitaire', pkg.productId, fakeId, 'android');
      log.bout('200 /shop/purchase/confirm', { amount: out.amount, balance: out.newBalance });
      if (user) setUser({ ...user, coins: out.newBalance });
      // Pulse the coin badge to celebrate
      Animated.sequence([
        Animated.timing(coinPulse, { toValue: 1.3, duration: 220, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.timing(coinPulse, { toValue: 1, duration: 220, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]).start();
      Alert.alert(
        '🎉 Achat réussi',
        `+${out.amount.toLocaleString()} coins crédités !\nNouveau solde : ${out.newBalance.toLocaleString()} 🪙`,
      );
    } catch (e: any) {
      log.error('confirmPurchase failed', e?.message);
      Alert.alert('Erreur', e?.message || 'Achat échoué');
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <View style={s.root}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <AppHeader title="Sally Coins" subtitle="Boutique de pièces" showBack />

      {/* Wallet hero : badge animé + tagline */}
      <LinearGradient
        colors={['rgba(252,211,77,0.18)', 'rgba(124,58,237,0.18)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.heroCard}
      >
        <View style={s.heroLeft}>
          <Text style={s.heroTitle}>Ton portefeuille</Text>
          <Animated.View style={[s.walletRow, { transform: [{ scale: coinPulse }] }]}>
            <Text style={s.coinEmoji}>🪙</Text>
            <Text style={s.walletValue}>{(user?.coins ?? 0).toLocaleString()}</Text>
            <Text style={s.walletLabel}>coins</Text>
          </Animated.View>
        </View>
        <View style={s.heroRight}>
          <Ionicons name="sparkles" size={48} color="#FCD34D" />
        </View>
      </LinearGradient>

      {isLocal ? (
        // ── Mode local : pas de backend → boutique inactive ─────────
        <View style={s.offlineWrap}>
          <Ionicons name="cloud-offline-outline" size={56} color="rgba(167,139,250,0.5)" />
          <Text style={s.offlineTitle}>Mode hors-ligne</Text>
          <Text style={s.offlineText}>
            Connecte-toi pour acheter des Sally Coins et débloquer toutes les variantes.
          </Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Mode local', 'Va dans Paramètres → Mode connecté pour activer la boutique.')}
            style={s.offlineBtn}
          >
            <LinearGradient
              colors={['#7C3AED', '#EC4899']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.offlineBtnGrad}
            >
              <Text style={s.offlineBtnText}>Activer le mode connecté</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color="#FCD34D" />
          <Text style={s.loaderText}>Chargement des packs…</Text>
        </View>
      ) : packages.length === 0 ? (
        <View style={s.offlineWrap}>
          <Ionicons name="alert-circle-outline" size={56} color="rgba(167,139,250,0.5)" />
          <Text style={s.offlineTitle}>Boutique vide</Text>
          <Text style={s.offlineText}>Aucun pack disponible pour le moment.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {packages.map((pkg) => {
            const total = (pkg.coins || 0) + (pkg.bonus || 0);
            const isBuying = purchasing === pkg.productId;
            return (
              <TouchableOpacity
                key={pkg.productId}
                onPress={() => !isBuying && setConfirmPkg(pkg)}
                activeOpacity={0.85}
                style={s.pkgWrap}
              >
                <LinearGradient
                  colors={(pkg.gradient as [string, string]) || ['#7C3AED', '#EC4899']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[s.pkg, pkg.bestValue && s.pkgBest]}
                >
                  {pkg.popular && (
                    <View style={s.ribbon}>
                      <Text style={s.ribbonText}>POPULAIRE</Text>
                    </View>
                  )}
                  {pkg.bestValue && (
                    <View style={[s.ribbon, { backgroundColor: '#FCD34D' }]}>
                      <Text style={[s.ribbonText, { color: '#78350F' }]}>⭐ TOP</Text>
                    </View>
                  )}
                  <Text style={s.pkgIcon}>{pkg.icon || '💰'}</Text>
                  <Text style={s.pkgName} numberOfLines={1}>{pkg.name}</Text>
                  <View style={s.coinStack}>
                    <Text style={s.coinEmojiSmall}>🪙</Text>
                    <Text style={s.pkgCoins}>{total.toLocaleString()}</Text>
                  </View>
                  {pkg.bonus > 0 && (
                    <View style={s.bonusPill}>
                      <Text style={s.bonusText}>+{pkg.bonus} BONUS</Text>
                    </View>
                  )}
                  <View style={s.priceBtn}>
                    {isBuying ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={s.priceText}>{pkg.priceEur.toFixed(2)} €</Text>
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
          <View style={s.disclaimer}>
            <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.5)" />
            <Text style={s.disclaimerText}>
              Les Sally Coins sont une monnaie virtuelle, utilisables uniquement dans l'app.
              Aucune valeur monétaire réelle.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Confirmation modal — remplace Alert pour un look on-brand */}
      <Modal visible={!!confirmPkg} transparent animationType="fade" onRequestClose={() => setConfirmPkg(null)}>
        <View style={s.modalBackdrop}>
          {confirmPkg && (
            <LinearGradient
              colors={(confirmPkg.gradient as [string, string]) || ['#7C3AED', '#EC4899']}
              style={s.modalCard}
            >
              <Text style={s.modalEmoji}>{confirmPkg.icon || '💰'}</Text>
              <Text style={s.modalTitle}>{confirmPkg.name}</Text>
              <View style={s.modalCoinRow}>
                <Text style={s.coinEmojiBig}>🪙</Text>
                <Text style={s.modalCoinValue}>
                  {((confirmPkg.coins || 0) + (confirmPkg.bonus || 0)).toLocaleString()}
                </Text>
              </View>
              {confirmPkg.bonus > 0 && (
                <Text style={s.modalBonus}>
                  Inclut {confirmPkg.bonus} coins bonus !
                </Text>
              )}
              <Text style={s.modalPrice}>{confirmPkg.priceEur.toFixed(2)} €</Text>
              <View style={s.modalBtnRow}>
                <TouchableOpacity onPress={() => setConfirmPkg(null)} style={s.modalCancelBtn}>
                  <Text style={s.modalCancelText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleConfirmPurchase} style={s.modalConfirmBtn}>
                  <Text style={s.modalConfirmText}>Acheter</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          )}
        </View>
      </Modal>
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
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.3)',
  },
  heroLeft: { flex: 1 },
  heroRight: { paddingLeft: 12 },
  heroTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: 1.5, fontFamily: 'Inter-Bold' },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  coinEmoji: { fontSize: 28 },
  walletValue: { color: '#FCD34D', fontSize: 30, fontFamily: 'Inter-Black' },
  walletLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter-SemiBold', marginLeft: 4 },

  // ── Loader / offline ──────────────────────────────────────────
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loaderText: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  offlineWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  offlineTitle: { color: '#fff', fontSize: 18, fontFamily: 'Inter-Black' },
  offlineText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  offlineBtn: { borderRadius: 999, overflow: 'hidden', marginTop: 8 },
  offlineBtnGrad: { paddingHorizontal: 20, paddingVertical: 12 },
  offlineBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },

  // ── Grid packages ─────────────────────────────────────────────
  list: { padding: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 32 },
  pkgWrap: { width: '48.5%', marginBottom: 12 },
  pkg: {
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    minHeight: 230,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pkgBest: { borderColor: '#FCD34D' },
  ribbon: {
    position: 'absolute',
    top: 12,
    right: -22,
    transform: [{ rotate: '30deg' }],
    backgroundColor: '#EF4444',
    paddingHorizontal: 22,
    paddingVertical: 3,
  },
  ribbonText: { color: '#fff', fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1 },
  pkgIcon: { fontSize: 44, marginBottom: 6 },
  pkgName: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black', letterSpacing: 0.3, marginBottom: 6, textAlign: 'center' },
  coinStack: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  coinEmojiSmall: { fontSize: 20 },
  pkgCoins: { color: '#fff', fontSize: 26, fontFamily: 'Inter-Black' },
  bonusPill: {
    backgroundColor: 'rgba(252,211,77,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 4,
    marginBottom: 8,
  },
  bonusText: { color: '#78350F', fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 0.8 },
  priceBtn: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    minWidth: 90,
    alignItems: 'center',
    marginTop: 'auto',
  },
  priceText: { color: '#fff', fontSize: 15, fontFamily: 'Inter-Black' },

  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 8,
    width: '100%',
  },
  disclaimerText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'Inter-Regular', flex: 1, lineHeight: 14 },

  // ── Modal de confirmation ─────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(252,211,77,0.6)',
  },
  modalEmoji: { fontSize: 56 },
  modalTitle: { color: '#fff', fontSize: 20, fontFamily: 'Inter-Black', marginTop: 6 },
  modalCoinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  coinEmojiBig: { fontSize: 32 },
  modalCoinValue: { color: '#FCD34D', fontSize: 32, fontFamily: 'Inter-Black' },
  modalBonus: { color: 'rgba(252,211,77,0.95)', fontSize: 12, fontFamily: 'Inter-Bold', marginTop: 4 },
  modalPrice: { color: '#fff', fontSize: 18, fontFamily: 'Inter-Black', marginTop: 12 },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 18, width: '100%' },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center' },
  modalCancelText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },
  modalConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#FCD34D', alignItems: 'center' },
  modalConfirmText: { color: '#78350F', fontSize: 14, fontFamily: 'Inter-Black' },
});

/* === End of shop.tsx — Solitaire — SallyCards === */
