import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { randomUUID } from 'expo-crypto';
import { ApiError } from '@konekte/api-client';
import { credentialsSchema } from '@konekte/shared-validation';
import type { InstallationState, Locale, Plan, Subscription } from '@konekte/shared-types';
import { messages, theme, type MessageKey } from '@konekte/ui';
import { acceptTokens, api, clearSession, refreshSession, useSession } from './session';
const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });
useSession.subscribe((state, previous) => {
  if (state.tokens?.user.id !== previous.tokens?.user.id) client.clear();
});
const useText = () => messages[useSession(s => s.locale)];
function Button({ children, onPress, secondary = false, disabled = false }: { children: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, disabled && { opacity: 0.45 }]}><Text style={[styles.buttonText, secondary && { color: theme.colors.primary }]}>{children}</Text></Pressable>;
}
function ErrorNotice({ error }: { error: unknown }) {
  const t = useText();
  if (!error) return null;
  return <Text accessibilityRole="alert" style={styles.error}>{error instanceof ApiError && error.status === 401 ? t.expired : t.error}</Text>;
}
function Auth() {
  const t = useText();
  const locale = useSession(s => s.locale);
  const [register, setRegister] = useState(true);
  const { control, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(credentialsSchema), defaultValues: { email: '', password: '' } });
  const mutation = useMutation({ mutationFn: async ({ email, password }: { email: string; password: string }) => acceptTokens(await (register ? api.register(email, password, locale) : api.login(email, password))) });
  return <View style={styles.card}>
    <Text style={styles.eyebrow}>01 / KONEKTE</Text><Text style={styles.title}>{register ? t.register : t.login}</Text><Text style={styles.body}>{t.tagline}</Text>
    <Controller control={control} name="email" render={({ field: { value, onChange, onBlur } }) => <><Text style={styles.label}>{t.email}</Text><TextInput accessibilityLabel={t.email} style={styles.input} value={value} onChangeText={onChange} onBlur={onBlur} autoCapitalize="none" keyboardType="email-address" autoComplete="email" /></>} />
    <Controller control={control} name="password" render={({ field: { value, onChange, onBlur } }) => <><Text style={styles.label}>{t.password}</Text><TextInput accessibilityLabel={t.password} style={styles.input} value={value} onChangeText={onChange} onBlur={onBlur} secureTextEntry autoComplete={register ? 'new-password' : 'current-password'} /></>} />
    {(errors.email || errors.password) && <Text style={styles.error}>{t.invalidForm}</Text>}
    <ErrorNotice error={mutation.error}/><Button disabled={mutation.isPending} onPress={handleSubmit(data => mutation.mutate(data))}>{mutation.isPending ? t.loading : register ? t.register : t.login}</Button>
    <Button secondary onPress={() => { setRegister(!register); mutation.reset(); }}>{register ? t.login : t.register}</Button>
  </View>;
}
function Compatibility({ onReady }: { onReady: () => void }) {
  const t = useText();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [supportsEsim, setSupports] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const mutation = useMutation({ mutationFn: () => api.addDevice({ name, supportsEsim, unlocked }), onSuccess: async device => { await queryClient.invalidateQueries({ queryKey: ['devices'] }); if (device.compatible) onReady(); } });
  return <View style={styles.card}><Text style={styles.eyebrow}>02 / KONEKTE</Text><Text style={styles.title}>{t.compatibility}</Text><Text style={styles.body}>{t.selfReported}</Text>
    <Text style={styles.label}>{t.deviceName}</Text><TextInput accessibilityLabel={t.deviceName} value={name} onChangeText={setName} style={styles.input} maxLength={80}/>
    <View style={styles.row}><Text style={styles.flexText}>{t.supportsEsim}</Text><Switch accessibilityLabel={t.supportsEsim} value={supportsEsim} onValueChange={setSupports} /></View>
    <View style={styles.row}><Text style={styles.flexText}>{t.unlocked}</Text><Switch accessibilityLabel={t.unlocked} value={unlocked} onValueChange={setUnlocked} /></View>
    {mutation.data && <Text style={styles.body}>{mutation.data.compatible ? t.compatible : t.incompatible}</Text>}
    <ErrorNotice error={mutation.error}/><Button disabled={!name.trim() || mutation.isPending} onPress={() => mutation.mutate()}>{t.check}</Button>
  </View>;
}
function Plans({ onCheckout, deviceId }: { onCheckout: () => void; deviceId?: string }) {
  const t = useText();
  const locale = useSession(s => s.locale);
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ['plans'], queryFn: () => api.plans() });
  const [selection, setSelection] = useState<{ plan: Plan; key: string } | null>(null);
  const checkout = useMutation({ mutationFn: async () => {
    if (!selection || !deviceId) throw new Error('Select phone and plan');
    return api.checkout(selection.plan.id, deviceId, selection.key);
  }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['subscriptions'] }); onCheckout(); } });
  return <View style={styles.stack}><Text style={styles.eyebrow}>03 / KONEKTE</Text><Text style={styles.title}>{t.plans}</Text>
    {catalog.isPending && <ActivityIndicator/>}<ErrorNotice error={catalog.error}/>
    {catalog.data?.map(plan => <Pressable key={plan.id} accessibilityRole="button" accessibilityState={{ selected: selection?.plan.id === plan.id }} onPress={() => { setSelection({ plan, key: randomUUID() }); checkout.reset(); }} style={[styles.card, selection?.plan.id === plan.id && styles.selected]}>
      <Text style={styles.label}>{plan.name}</Text><View style={styles.row}><Text style={styles.data}>{plan.dataGb} GB</Text><Text style={styles.price}>{new Intl.NumberFormat(locale === 'ht' ? 'fr-HT' : locale, { style: 'currency', currency: plan.currency }).format(plan.priceCents / 100)}</Text></View>
      <Text style={styles.body}>{plan.durationDays} {t.days}</Text><Text style={styles.pricing}>{plan.pricingLabel}</Text>
    </Pressable>)}
    <ErrorNotice error={checkout.error}/><Button disabled={!selection || !deviceId || checkout.isPending} onPress={() => checkout.mutate()}>{checkout.isPending ? t.loading : t.pay}</Button>
  </View>;
}
const statusKeys: Record<InstallationState, MessageKey> = { NOT_CREATED: 'statePending', PROVISIONING: 'statePending', READY_TO_INSTALL: 'stateReady', INSTALLING: 'stateInstalling', INSTALLED: 'stateInstalled', ACTIVATING: 'stateActivating', ACTIVE: 'stateActive', FAILED: 'stateFailed' };
function Activation({ subscription }: { subscription?: Subscription }) {
  const t = useText();
  const queryClient = useQueryClient();
  const esim = subscription?.esim;
  const install = useQuery({ queryKey: ['install', esim?.id], queryFn: () => api.installData(esim!.id), enabled: !!esim && ['READY_TO_INSTALL', 'INSTALLING', 'INSTALLED'].includes(esim.installationState) });
  const update = async () => { await queryClient.invalidateQueries({ queryKey: ['subscriptions'] }); await queryClient.invalidateQueries({ queryKey: ['usage'] }); };
  const action = useMutation({ mutationFn: (step: 'start-install' | 'confirm-install' | 'activate') => api.installationAction(esim!.id, step), onSuccess: update });
  const retry = useMutation({ mutationFn: () => api.retryProvisioning(esim!.id), onSuccess: update });
  const payment = useMutation({ mutationFn: (outcome: 'success' | 'failure') => api.simulatePayment(subscription!.payment!.id, outcome), onSuccess: update });
  return <View style={styles.card}><Text style={styles.eyebrow}>04 / KONEKTE</Text><Text style={styles.title}>{t.activation}</Text>
    {!subscription && <Text style={styles.body}>{t.noSubscription}</Text>}
    {subscription?.payment?.state === 'PENDING' && <><Text style={styles.body}>{t.paymentPending}</Text>
      {subscription.payment.checkoutUrl ? <Button onPress={() => { void Linking.openURL(subscription.payment!.checkoutUrl!); }}>{t.pay}</Button> : subscription.payment.mode === 'mock' ? <><Button disabled={payment.isPending} onPress={() => payment.mutate('success')}>{t.testPayment}</Button><Button secondary disabled={payment.isPending} onPress={() => payment.mutate('failure')}>{t.failPayment}</Button></> : <Text style={styles.body}>{t.error}</Text>}
    </>}
    {subscription?.payment?.state === 'FAILED' && <Text style={styles.error}>{t.paymentFailed}</Text>}
    {subscription?.payment?.state === 'SUCCEEDED' && <Text style={styles.body}>{t.paymentSuccess}</Text>}
    {esim && <View style={styles.pill}><Text style={styles.pillText}>{t[statusKeys[esim.installationState]]}</Text></View>}
    {esim && ['NOT_CREATED', 'PROVISIONING', 'ACTIVATING'].includes(esim.installationState) && <><ActivityIndicator/><Text style={styles.body}>{t.preparing}</Text></>}
    {install.data && <View style={styles.demoBox}><Text style={styles.body}>{t.installationWarning}</Text><Text selectable style={styles.code}>{install.data.manual.address}{'\n'}{install.data.manual.code}</Text></View>}
    {esim?.installationState === 'READY_TO_INSTALL' && <Button disabled={action.isPending} onPress={() => action.mutate('start-install')}>{t.startInstall}</Button>}
    {esim?.installationState === 'INSTALLING' && <Button disabled={action.isPending} onPress={() => action.mutate('confirm-install')}>{t.confirmInstall}</Button>}
    {esim?.installationState === 'INSTALLED' && <Button disabled={action.isPending} onPress={() => action.mutate('activate')}>{t.activate}</Button>}
    {esim?.installationState === 'ACTIVE' && <Text style={styles.body}>{t.active}</Text>}
    {esim?.installationState === 'FAILED' && <Button disabled={retry.isPending} onPress={() => retry.mutate()}>{t.retry}</Button>}
    <ErrorNotice error={action.error || payment.error || retry.error || install.error}/>
    <Button secondary onPress={() => { void update(); }}>{t.refresh}</Button>
  </View>;
}
function UsageScreen() {
  const t = useText();
  const query = useQuery({ queryKey: ['usage'], queryFn: () => api.usage(), refetchInterval: 60_000 });
  return <View style={styles.card}><Text style={styles.eyebrow}>05 / KONEKTE</Text><Text style={styles.title}>{t.usage}</Text><Text style={styles.body}>{t.simulatedUsage}</Text>
    {query.isPending && <ActivityIndicator/>}<ErrorNotice error={query.error}/>
    {query.data?.length === 0 && <Text style={styles.body}>{t.noSubscription}</Text>}
    {query.data?.map(usage => <View key={usage.esimId} style={styles.stack}>
      <Text style={styles.data}>{(usage.usedBytes / 1e9).toFixed(2)} GB</Text><Text style={styles.body}>{t.used} {t.of} {usage.totalBytes / 1e9} GB</Text>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: usage.totalBytes, now: usage.usedBytes }} style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, usage.usedBytes / usage.totalBytes * 100)}%` }]}/></View>
      <Text style={styles.body}>{new Date(usage.measuredAt).toLocaleString()}</Text>
    </View>)}<Button secondary onPress={() => { void query.refetch(); }}>{t.refresh}</Button>
  </View>;
}
function Home() {
  const t = useText();
  const [screen, setScreen] = useState<'compatibility' | 'plans' | 'activation' | 'usage' | 'phone'>('compatibility');
  const devices = useQuery({ queryKey: ['devices'], queryFn: () => api.devices() });
  const subscriptions = useQuery({ queryKey: ['subscriptions'], queryFn: () => api.subscriptions(), refetchInterval: 3000 });
  const device = devices.data?.find(d => d.compatible);
  const current = subscriptions.data?.[0];
  return <><View style={styles.nav}>{(['compatibility', 'plans', 'activation', 'usage', 'phone'] as const).map(tab => <Pressable key={tab} accessibilityRole="button" accessibilityState={{ selected: screen === tab }} onPress={() => setScreen(tab)} style={[styles.tab, screen === tab && styles.activeTab]}><Text style={[styles.tabText, screen === tab && { color: 'white' }]}>{t[tab]}</Text></Pressable>)}</View>
    <ErrorNotice error={devices.error || subscriptions.error}/>
    {screen === 'compatibility' && <Compatibility onReady={() => setScreen('plans')}/>}
    {screen === 'plans' && (device ? <Plans deviceId={device.id} onCheckout={() => setScreen('activation')}/> : <Compatibility onReady={() => setScreen('plans')}/>)}
    {screen === 'activation' && <Activation subscription={current}/>}
    {screen === 'usage' && <UsageScreen/>}
    {screen === 'phone' && <View style={styles.card}><Text style={styles.title}>{t.comingSoon}</Text><Text style={styles.body}>{t.phoneDetail}</Text></View>}
  </>;
}
function Shell() {
  const t = useText();
  const { tokens, locale, setLocale } = useSession();
  const [restoring, setRestoring] = useState(true);
  const queryClient = useQueryClient();
  useEffect(() => {
    void refreshSession().finally(() => setRestoring(false));
    const timer = setInterval(() => { void refreshSession(); }, 8 * 60_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refreshSession(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);
  const logout = async () => { try { await api.logout(); } finally { await clearSession(); queryClient.clear(); } };
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><View><Text style={styles.logo}>konekte<Text style={{ color: theme.colors.primary }}>.</Text></Text><Text style={styles.body}>{t.tagline}</Text></View>
      <View style={styles.languages}>{(['en', 'ht', 'fr'] as Locale[]).map(l => <Pressable accessibilityRole="button" accessibilityLabel={{ en: 'English', ht: 'Kreyòl', fr: 'Français' }[l]} accessibilityState={{ selected: locale === l }} key={l} onPress={() => setLocale(l)} style={[styles.language, locale === l && { backgroundColor: theme.colors.accent }]}><Text style={styles.label}>{l.toUpperCase()}</Text></Pressable>)}</View>
    </View><View style={styles.demoBox}><Text style={styles.demoText}>{t.demo}</Text></View>
    {restoring ? <ActivityIndicator/> : tokens ? <Home/> : <Auth/>}
    {tokens && <Button secondary onPress={() => { void logout().catch(() => undefined); }}>{t.logout}</Button>}
    <Text style={styles.footer}>KONEKTE · MVP / 0.1</Text>
  </ScrollView></SafeAreaView>;
}
export default function App() { return <QueryClientProvider client={client}><Shell/></QueryClientProvider>; }
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background }, page: { padding: 24, paddingTop: 40, gap: 22, maxWidth: 640, width: '100%', alignSelf: 'center' },
  header: { gap: 16 }, logo: { fontSize: 46, fontWeight: '800', letterSpacing: -2, color: theme.colors.ink }, languages: { flexDirection: 'row', gap: 8 }, language: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: '#E5ECE6' },
  card: { padding: 24, backgroundColor: theme.colors.paper, borderRadius: theme.radius, gap: 16, borderWidth: 1, borderColor: '#DDE7DF' }, stack: { gap: 18 }, title: { fontSize: 28, fontWeight: '700', color: theme.colors.ink, letterSpacing: -0.7 },
  eyebrow: { color: theme.colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 2 }, body: { color: theme.colors.muted, fontSize: 15, lineHeight: 23 }, label: { fontWeight: '600', color: theme.colors.ink, fontSize: 14 },
  input: { borderWidth: 1, borderColor: '#B4C7BD', borderRadius: 10, padding: 14, fontSize: 16, color: theme.colors.ink, backgroundColor: '#FBFCFA' }, button: { padding: 16, backgroundColor: theme.colors.primary, borderRadius: 12, alignItems: 'center' }, secondaryButton: { backgroundColor: '#E8EFE8' }, buttonText: { fontSize: 15, fontWeight: '700', color: 'white', textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 14 }, flexText: { flex: 1, color: theme.colors.ink, fontSize: 15 }, error: { color: theme.colors.danger, lineHeight: 22 }, selected: { borderColor: theme.colors.primary, borderWidth: 2, backgroundColor: '#F5FAE9' },
  data: { fontSize: 38, fontWeight: '700', color: theme.colors.ink, letterSpacing: -1 }, price: { fontSize: 22, fontWeight: '600', color: theme.colors.primary }, pricing: { fontSize: 10, letterSpacing: 1, color: theme.colors.muted },
  demoBox: { backgroundColor: '#E7EED8', padding: 16, borderRadius: 12, gap: 8 }, demoText: { color: '#42572A', fontSize: 13, lineHeight: 20 }, code: { fontSize: 12, color: theme.colors.muted },
  nav: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, tab: { padding: 12, borderRadius: 22, backgroundColor: '#E5ECE6' }, activeTab: { backgroundColor: theme.colors.primary }, tabText: { fontSize: 12, fontWeight: '600', color: theme.colors.ink },
  pill: { backgroundColor: theme.colors.accent, padding: 12, borderRadius: 10, alignSelf: 'flex-start' }, pillText: { color: theme.colors.ink, fontWeight: '600' }, track: { backgroundColor: '#E5ECE6', height: 14, borderRadius: 7, overflow: 'hidden' }, fill: { backgroundColor: theme.colors.primary, height: '100%', minWidth: 3 }, footer: { color: theme.colors.muted, fontSize: 10, letterSpacing: 2, textAlign: 'center', padding: 20 }
});
