import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ApiClient } from '@konekte/api-client';
import type { Locale, Tokens } from '@konekte/shared-types';
interface State { tokens: Tokens | null; locale: Locale; setLocale: (locale: Locale) => void }
export const useSession = create<State>(set => ({ tokens: null, locale: 'en', setLocale: locale => set({ locale }) }));
const key = 'konekte.refresh';
const url = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
// Browser preview intentionally keeps all credentials in memory. Native refresh tokens use OS secure storage.
export const api = new ApiClient(url, () => useSession.getState().tokens?.accessToken ?? null);
let refreshing: Promise<void> | null = null;
export async function acceptTokens(tokens: Tokens) {
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(key, tokens.refreshToken);
  useSession.setState({ tokens, locale: tokens.user.locale });
}
export async function clearSession() {
  useSession.setState({ tokens: null });
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(key);
}
export async function refreshSession() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const stored = useSession.getState().tokens?.refreshToken ?? (Platform.OS !== 'web' ? await SecureStore.getItemAsync(key) : null);
    if (!stored) return;
    try { await acceptTokens(await api.refresh(stored)); } catch { await clearSession(); }
  })().finally(() => { refreshing = null; });
  return refreshing;
}
