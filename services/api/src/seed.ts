import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
export async function seedPlans(db: PrismaClient) {
  const plans = [
    { id: 'basic', name: 'Konekte Basic', dataGb: 10, priceCents: 999 },
    { id: 'plus', name: 'Konekte Plus', dataGb: 30, priceCents: 1499 },
    { id: 'max', name: 'Konekte Max', dataGb: 50, priceCents: 1999 }
  ];
  for (const plan of plans) {
    const data = { ...plan, durationDays: 30, currency: 'usd', pricingLabel: 'PLACEHOLDER_PRICING' };
    await db.plan.upsert({ where: { id: plan.id }, create: data, update: data });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') throw new Error('Development seed is disabled in production.');
  const db = new PrismaClient();
  try { await seedPlans(db); } finally { await db.$disconnect(); }
}
