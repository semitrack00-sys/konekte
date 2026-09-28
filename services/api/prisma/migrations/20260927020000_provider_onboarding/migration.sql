-- CreateEnum
CREATE TYPE "ProviderEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "QualificationAnswer" AS ENUM ('UNKNOWN', 'YES', 'NO');

-- DropIndex
DROP INDEX "PlanProviderMapping_planId_providerId_key";

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "providerIdSnapshot" TEXT,
ADD COLUMN     "providerMappingId" UUID,
ADD COLUMN     "providerMappingVersion" INTEGER,
ADD COLUMN     "providerProductIdSnapshot" TEXT;

-- AlterTable
ALTER TABLE "ProviderProduct" ADD COLUMN     "capabilityMetadata" JSONB,
ADD COLUMN     "networkMetadata" JSONB,
ADD COLUMN     "wholesaleCurrency" TEXT,
ADD COLUMN     "wholesalePriceCents" INTEGER;

-- AlterTable
ALTER TABLE "PlanProviderMapping" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ProviderConfiguration" (
    "id" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "apiBaseUrl" TEXT,
    "apiKeyReference" TEXT,
    "webhookSecretReference" TEXT,
    "accountCustomerId" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "retryBaseDelayMs" INTEGER NOT NULL DEFAULT 250,
    "retryMaxDelayMs" INTEGER NOT NULL DEFAULT 5000,
    "enabledCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "environment" "ProviderEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "capabilityOverrides" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderQualification" (
    "id" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'HT',
    "haitiSupported" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "networkNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lte4g" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "fiveG" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "persistentEsim" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "topUpSameEsim" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "packageReplacement" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "usageApi" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "usageWebhook" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "hotspotPolicy" TEXT,
    "throttlingFup" TEXT,
    "packageExpirationBehavior" TEXT,
    "activationMethod" TEXT,
    "qrInstallation" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "manualInstallation" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "webhookAuthentication" TEXT,
    "idempotencySupport" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "reconciliationSupport" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "failedProvisioningRefundBehavior" TEXT,
    "sandboxAvailable" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "productionAvailable" "QualificationAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "commercialMinimums" JSONB,
    "wholesaleCurrency" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderMappingAudit" (
    "id" UUID NOT NULL,
    "mappingId" UUID NOT NULL,
    "planId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "priorProductRecordId" TEXT,
    "newProductRecordId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderMappingAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfiguration_providerId_key" ON "ProviderConfiguration"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderQualification_providerId_countryCode_key" ON "ProviderQualification"("providerId", "countryCode");

-- CreateIndex
CREATE INDEX "ProviderMappingAudit_planId_providerId_changedAt_idx" ON "ProviderMappingAudit"("planId", "providerId", "changedAt");

-- CreateIndex
CREATE INDEX "PlanProviderMapping_planId_providerId_active_idx" ON "PlanProviderMapping"("planId", "providerId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PlanProviderMapping_planId_providerId_version_key" ON "PlanProviderMapping"("planId", "providerId", "version");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_providerMappingId_fkey" FOREIGN KEY ("providerMappingId") REFERENCES "PlanProviderMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderConfiguration" ADD CONSTRAINT "ProviderConfiguration_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderQualification" ADD CONSTRAINT "ProviderQualification_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMappingAudit" ADD CONSTRAINT "ProviderMappingAudit_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "PlanProviderMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

