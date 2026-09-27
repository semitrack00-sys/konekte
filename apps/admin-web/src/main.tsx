import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ApiClient } from '@konekte/api-client';
import { messages } from '@konekte/ui';
import type { Locale } from '@konekte/shared-types';
import './styles.css';
const api = new ApiClient(import.meta.env.VITE_API_URL ?? 'http://localhost:4000');
const queryClient = new QueryClient();
function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const t = messages[locale];
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.plans() });
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health(), retry: false, refetchInterval: 30_000 });
  if (window.location.pathname === '/checkout-return') return <main><div className="brand">konekte.</div><section><h1>{t.payment}</h1><p>{t.paymentPending}</p><p>{t.demo}</p></section></main>;
  return <main><header><div><div className="brand">konekte.</div><span className="eyebrow">DEVELOPMENT / 0.1</span></div><select aria-label="Language" value={locale} onChange={e => setLocale(e.target.value as Locale)}><option value="en">English</option><option value="ht">Kreyòl</option><option value="fr">Français</option></select></header>
    <div className="notice">{t.demo}</div><div className="heading"><div><h1>{t.adminTitle}</h1><p>{t.adminDetail}</p></div><span className={`status ${health.data ? 'ready' : ''}`}>{health.isPending ? t.loading : health.data ? t.ready : t.unavailable}</span></div>
    <section><div className="section-heading"><h2>{t.plans}</h2><button onClick={() => { void plans.refetch(); void health.refetch(); }}>{t.refresh}</button></div>
      {plans.isPending && <p>{t.loading}</p>}{plans.error && <p role="alert">{t.error}</p>}<div className="plans">{plans.data?.map(plan => <article key={plan.id}><span className="eyebrow">{plan.name}</span><h3>{plan.dataGb}<small> GB</small></h3><p>{plan.durationDays} {t.days}</p><strong>{new Intl.NumberFormat(locale === 'ht' ? 'fr-HT' : locale, { style: 'currency', currency: plan.currency }).format(plan.priceCents / 100)}</strong><div className="pricing">{plan.pricingLabel}</div></article>)}</div>
    </section><footer>KONEKTE · DEVELOPMENT FOUNDATION</footer></main>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><App/></QueryClientProvider>);
