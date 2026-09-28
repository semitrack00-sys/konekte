import type { PrismaClient } from '@prisma/client';
import type { CatalogProductInput } from '@konekte/esim-provider-sdk';
import { z } from 'zod';

const catalogProductSchema = z.object({
  providerProductId: z.string().min(1).max(160), countryCode: z.string().regex(/^[A-Z]{2}$/),
  name: z.string().min(1).max(160), dataGb: z.number().positive(), durationDays: z.number().int().positive(),
  wholesalePriceCents: z.number().int().nonnegative().nullable(), currency: z.string().length(3),
  networkMetadata: z.record(z.string(), z.unknown()).nullable(), capabilityMetadata: z.record(z.string(), z.unknown()).nullable()
}).strict();

/** Imports normalized catalog data. Null wholesale price remains explicitly unknown. */
export async function importProviderCatalog(db: PrismaClient, providerId: string, input: CatalogProductInput[]) {
  const products = z.array(catalogProductSchema).parse(input);
  const provider = await db.provider.findUnique({ where: { id: providerId } });
  if (!provider) throw new Error('PROVIDER_NOT_FOUND');
  const results = [];
  for (const product of products) results.push(await db.providerProduct.upsert({
    where: { providerId_providerProductId_countryCode: { providerId, providerProductId: product.providerProductId, countryCode: product.countryCode } },
    create: { providerId, providerProductId: product.providerProductId, countryCode: product.countryCode, name: product.name, dataGb: Math.ceil(product.dataGb), durationDays: product.durationDays, wholesalePriceCents: product.wholesalePriceCents, wholesaleCurrency: product.wholesalePriceCents === null ? null : product.currency.toLowerCase(), networkMetadata: product.networkMetadata ?? undefined, capabilityMetadata: product.capabilityMetadata ?? undefined, simulated: provider.simulated },
    update: { name: product.name, dataGb: Math.ceil(product.dataGb), durationDays: product.durationDays, wholesalePriceCents: product.wholesalePriceCents, wholesaleCurrency: product.wholesalePriceCents === null ? null : product.currency.toLowerCase(), networkMetadata: product.networkMetadata ?? undefined, capabilityMetadata: product.capabilityMetadata ?? undefined }
  }));
  return results;
}
