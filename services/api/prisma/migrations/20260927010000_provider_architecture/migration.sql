-- CreateEnum
CREATE TYPE "ProviderOperationState" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'RETRYABLE_FAILURE', 'FAILED', 'RECONCILIATION_REQUIRED');

-- CreateEnum
CREATE TYPE "ProviderOperationType" AS ENUM ('PROVISION', 'STATUS', 'ACTIVATE', 'TOP_UP', 'USAGE', 'SUSPEND', 'RESUME', 'TERMINATE', 'RECONCILE', 'RENEWAL_PACKAGE');

-- CreateEnum
CREATE TYPE "ReconciliationKind" AS ENUM ('PAID_BUT_NOT_PROVISIONED', 'LOCAL_ACTIVE_PROVIDER_INACTIVE', 'PROVIDER_ACTIVE_LOCAL_PENDING', 'RENEWAL_PAID_PACKAGE_NOT_ASSIGNED', 'USAGE_SYNC_STALE', 'UNKNOWN_PROVIDER_ESIM');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "healthStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "capabilities" JSONB NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderProduct" (
    "id" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerProductId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataGb" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProviderProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanProviderMapping" (
    "id" UUID NOT NULL,
    "planId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerProductId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlanProviderMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderOperation" (
    "id" UUID NOT NULL,
    "operationType" "ProviderOperationType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "providerReferenceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ProviderOperationState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "safeErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderWebhookEvent" (
    "id" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerReferenceId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationIssue" (
    "id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "kind" "ReconciliationKind" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "providerId" TEXT,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "safeDetails" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalPayment" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "checkoutReference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "state" "PaymentState" NOT NULL DEFAULT 'PENDING',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "renewalPaymentId" UUID NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenewalWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderProduct_providerId_providerProductId_countryCode_key" ON "ProviderProduct"("providerId", "providerProductId", "countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "PlanProviderMapping_planId_providerId_key" ON "PlanProviderMapping"("planId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderOperation_idempotencyKey_key" ON "ProviderOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProviderOperation_status_createdAt_idx" ON "ProviderOperation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderOperation_entityType_entityId_idx" ON "ProviderOperation"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderWebhookEvent_providerId_eventId_key" ON "ProviderWebhookEvent"("providerId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationIssue_fingerprint_key" ON "ReconciliationIssue"("fingerprint");

-- CreateIndex
CREATE INDEX "ReconciliationIssue_status_detectedAt_idx" ON "ReconciliationIssue"("status", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RenewalPayment_checkoutReference_key" ON "RenewalPayment"("checkoutReference");

-- CreateIndex
CREATE UNIQUE INDEX "RenewalPayment_idempotencyKey_key" ON "RenewalPayment"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "ProviderProduct" ADD CONSTRAINT "ProviderProduct_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanProviderMapping" ADD CONSTRAINT "PlanProviderMapping_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanProviderMapping" ADD CONSTRAINT "PlanProviderMapping_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanProviderMapping" ADD CONSTRAINT "PlanProviderMapping_providerProductId_fkey" FOREIGN KEY ("providerProductId") REFERENCES "ProviderProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderOperation" ADD CONSTRAINT "ProviderOperation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderWebhookEvent" ADD CONSTRAINT "ProviderWebhookEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationIssue" ADD CONSTRAINT "ReconciliationIssue_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalPayment" ADD CONSTRAINT "RenewalPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalWebhookEvent" ADD CONSTRAINT "RenewalWebhookEvent_renewalPaymentId_fkey" FOREIGN KEY ("renewalPaymentId") REFERENCES "RenewalPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
