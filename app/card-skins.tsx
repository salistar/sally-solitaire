/**
 * @file card-skins.tsx
 * @description Catalogue + sélection des skins de cartes.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import * as Skins from '../src/game/card-skins';

export default function CardSkinsScreen() {
  const { palette } = useTheme();
  const [selected, setSelected] = useState<Skins.SkinId>('classic');
  const [owned, setOwned] = useState<Skins.SkinId[]>([]);

  const refresh = useCallback(async () => {
    setSelected(await Skins.getSelectedSkin());
    setOwned(await Skins.getOwnedSkins());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onSelect = async (id: Skins.SkinId) => {
    if (!owned.includes(id)) return;
    await Skins.selectSkin(id);
    setSelected(id);
  };

  const onPurchase = async (skin: Skins.CardSkin) => {
    Alert.alert(
      `Acheter "${skin.name}"`,
      `${skin.cost} gold. Cette action sera traitée par la shop côté backend.\n\nNote v1 : la déduction réelle du gold n'est pas faite, seulement l'unlock local pour démo.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'OK', onPress: async () => {
            await Skins.purchaseSkin(skin.id);
            await refresh();
            Alert.alert('🎉 Acheté !', `Skin "${skin.name}" disponible.`);
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title="Skins de cartes" showBack />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.intro, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Ionicons name="color-palette" size={22} color={palette.text} />
          <Text style={[styles.introText, { color: palette.text }]}>
            Personnalise l'apparence de tes cartes. Les skins premium peuvent être
            achetés via la shop avec du gold gagné en jouant.
          </Text>
        </View>

        {Skins.SKIN_CATALOG.map((skin) => {
          const isOwned = owned.includes(skin.id);
          const isActive = selected === skin.id;
          return (
            <View
              key={skin.id}
              style={[styles.card, {
                backgroundColor: palette.card,
                borderColor: isActive ? skin.primary : palette.border,
                borderWidth: isActive ? 2 : 1,
              }]}>
              <View style={styles.cardHeader}>
                <Text style={styles.emoji}>{skin.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: palette.text }]}>
                    {skin.name}
                    {skin.premium ? <Text style={[styles.badge, { color: '#F59E0B' }]}>  ✦ Premium</Text> : null}
                  </Text>
                  <Text style={[styles.desc, { color: palette.textSecondary }]}>
                    {skin.description}
                  </Text>
                </View>
              </View>

              <View style={styles.preview}>
                <View style={[styles.previewCard, { backgroundColor: skin.primary, borderColor: skin.secondary }]}>
                  <Text style={[styles.previewText, { color: skin.secondary }]}>♠ A</Text>
                </View>
                <View style={[styles.previewCard, { backgroundColor: skin.primary, borderColor: skin.secondary }]}>
                  <Text style={[styles.previewText, { color: skin.secondary }]}>♥ K</Text>
                </View>
                <View style={[styles.previewCard, { backgroundColor: skin.secondary, borderColor: skin.primary }]}>
                  <Text style={[styles.previewText, { color: skin.primary }]}>♦ Q</Text>
                </View>
              </View>

              <View style={styles.actions}>
                {isActive ? (
                  <View style={[styles.activeBadge, { backgroundColor: '#10B981' }]}>
                    <Ionicons name="checkmark-circle" size={14} color="#fff" />
                    <Text style={styles.activeBadgeText}>Actif</Text>
                  </View>
                ) : isOwned ? (
                  <TouchableOpacity onPress={() => onSelect(skin.id)}
                    style={[styles.btn, { backgroundColor: '#0EA5E9' }]}>
                    <Text style={styles.btnText}>Activer</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => onPurchase(skin)}
                    style={[styles.btn, { backgroundColor: '#F59E0B' }]}>
                    <Ionicons name="cart" size={12} color="#fff" />
                    <Text style={styles.btnText}>{skin.cost} gold</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10 },
  intro: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderWidth: 1, borderRadius: 10,
  },
  introText: { flex: 1, fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 18 },
  card: { borderRadius: 12, padding: 14, gap: 12 },
  cardHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  emoji: { fontSize: 32 },
  name: { fontSize: 15, fontFamily: 'Inter-Black' },
  badge: { fontSize: 11, fontFamily: 'Inter-Black' },
  desc: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  preview: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  previewCard: {
    width: 50, height: 70, borderRadius: 6, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  previewText: { fontSize: 14, fontFamily: 'Inter-Black' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
  },
  activeBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-Black' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6,
  },
  btnText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Black' },
});
