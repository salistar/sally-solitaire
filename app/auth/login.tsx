/**
 * @file auth/login.tsx
 * @description Login screen for the Solitaire app. Card image logo, email/password login, guest mode, and demo credentials.
 * @author Idriss Kriouile
 * @date 2026-04-07
 * @project SallyCards - Solitaire
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as api from '../../shared/api';
import { APP_CONFIG } from '../../src/config/app.config';

const APP_COLOR = APP_CONFIG.primary;
const APP_NAME = APP_CONFIG.name;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cardImage = require('../../assets/card-hero.png');

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('demo@sallycards.com');
  const [password, setPassword] = useState('Demo123456');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('[Solitaire/LoginScreen] Component mounted');
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      console.log('[Solitaire/LoginScreen] Validation failed: empty email or password');
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setLoading(true);
    console.log('[Solitaire/LoginScreen] State update: loading = true');
    try {
      console.log('[Solitaire/LoginScreen] Fetching login...');
      await api.login(email, password, { gameType: 'solitaire' });
      console.log('[Solitaire/LoginScreen] Login successful');
      router.replace('/(tabs)');
    } catch (e: any) {
      console.error('[Solitaire/LoginScreen] Error:', e);
      Alert.alert(t('error'), e.message || t('loginError'));
    } finally {
      setLoading(false);
      console.log('[Solitaire/LoginScreen] State update: loading = false');
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    console.log('[Solitaire/LoginScreen] State update: loading = true');
    try {
      console.log('[Solitaire/LoginScreen] Fetching guest session...');
      await api.createGuestSession();
      console.log('[Solitaire/LoginScreen] Guest session created');
      router.replace('/(tabs)');
    } catch (e: any) {
      console.error('[Solitaire/LoginScreen] Error:', e);
      Alert.alert(t('error'), e.message || t('guestError'));
    } finally {
      setLoading(false);
      console.log('[Solitaire/LoginScreen] State update: loading = false');
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Image source={cardImage} style={s.cardImage} resizeMode="contain" />

        <View style={s.titleRow}>
          <Text style={s.sallyText}>Sally </Text>
          <Text style={[s.appNameText, { color: APP_COLOR }]}>{APP_NAME}</Text>
        </View>
        <Text style={s.subtitle}>{t('loginSubtitle')}</Text>

        <View style={s.form}>
          <Text style={s.label}>{t('email')}</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={(val) => {
              console.log('[Solitaire/LoginScreen] State update: email =', val);
              setEmail(val);
            }}
            placeholder="demo@sallycards.com"
            placeholderTextColor="#6B7280"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={s.label}>{t('password')}</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={(val) => {
              console.log('[Solitaire/LoginScreen] State update: password = [hidden]');
              setPassword(val);
            }}
            placeholder="••••••••"
            placeholderTextColor="#6B7280"
            secureTextEntry
          />

          <TouchableOpacity style={s.button} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>{t('loginButton')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.guestButton} onPress={handleGuest} disabled={loading}>
            <Text style={s.guestText}>{t('guest')}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.credentials}>
          <Text style={s.credTitle}>{t('demoAccount')}</Text>
          <Text style={s.credText}>Email: demo@sallycards.com</Text>
          <Text style={s.credText}>Pass: Demo123456</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0830' },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  cardImage: {
    width: 80,
    height: 120,
    alignSelf: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  sallyText: { fontSize: 28, fontWeight: '900', color: '#fff' },
  appNameText: { fontSize: 28, fontWeight: '900' },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  form: { gap: 12 },
  label: { color: '#9CA3AF', fontSize: 13, fontWeight: '600', marginBottom: -4 },
  input: {
    backgroundColor: '#152A47',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  button: {
    backgroundColor: APP_COLOR,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  guestButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  guestText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
  credentials: {
    marginTop: 32,
    padding: 16,
    backgroundColor: 'rgba(79,70,229,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.2)',
  },
  credTitle: { color: APP_COLOR, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  credText: { color: '#6B7280', fontSize: 12 },
});

/* === End of auth/login.tsx — Solitaire — SallyCards === */
