import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { MockEsimProvider } from '@konekte/esim-provider-sdk';
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
export async function seedPlans(db: PrismaClient) {
  const provider = new MockEsimProvider();
  const capabilities = { ...provider.capabilities };
  await db.provider.upsert({ where: { id: provider.id }, create: { id: provider.id, displayName: 'Mock provider (simulated)', enabled: true, simulated: true, healthStatus: 'HEALTHY', capabilities }, update: { displayName: 'Mock provider (simulated)', enabled: true, simulated: true, healthStatus: 'HEALTHY', capabilities } });
  const plans = [
    { id: 'basic', name: 'Konekte Basic', dataGb: 10, priceCents: 999 },
    { id: 'plus', name: 'Konekte Plus', dataGb: 30, priceCents: 1499 },
    { id: 'max', name: 'Konekte Max', dataGb: 50, priceCents: 1999 }
  ];
  for (const plan of plans) {
    const data = { ...plan, durationDays: 30, currency: 'usd', pricingLabel: 'PLACEHOLDER_PRICING' };
    await db.plan.upsert({ where: { id: plan.id }, create: data, update: data });
    const product = (await provider.listProducts('HT')).find(p => p.dataGb === plan.dataGb)!;
    const stored = await db.providerProduct.upsert({ where: { providerId_providerProductId_countryCode: { providerId: provider.id, providerProductId: product.id, countryCode: 'HT' } }, create: { providerId: provider.id, providerProductId: product.id, countryCode: 'HT', name: product.name, dataGb: product.dataGb, durationDays: product.durationDays, simulated: true }, update: { name: product.name, dataGb: product.dataGb, durationDays: product.durationDays, simulated: true } });
    await db.planProviderMapping.upsert({ where: { planId_providerId: { planId: plan.id, providerId: provider.id } }, create: { planId: plan.id, providerId: provider.id, providerProductId: stored.id }, update: { providerProductId: stored.id, active: true } });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') throw new Error('Development seed is disabled in production.');
  const db = new PrismaClient();
  try { await seedPlans(db); } finally { await db.$disconnect(); }
}
