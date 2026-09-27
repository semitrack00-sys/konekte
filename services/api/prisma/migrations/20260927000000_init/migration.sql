CREATE TYPE "Locale" AS ENUM ('en', 'ht', 'fr');
CREATE TYPE "SubscriptionState" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELING', 'CANCELED', 'EXPIRED');
CREATE TYPE "PaymentState" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "EsimState" AS ENUM ('CREATED', 'READY', 'INSTALLED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'TERMINATED', 'ERROR');
CREATE TYPE "InstallationState" AS ENUM ('NOT_CREATED', 'PROVISIONING', 'READY_TO_INSTALL', 'INSTALLING', 'INSTALLED', 'ACTIVATING', 'ACTIVE', 'FAILED');
CREATE TYPE "JobState" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED');

CREATE TABLE "User" (
  "id" UUID NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
  "locale" "Locale" NOT NULL DEFAULT 'en', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Session" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "tokenHash" TEXT NOT NULL, "familyId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Device" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "name" TEXT NOT NULL, "supportsEsim" BOOLEAN NOT NULL,
  "unlocked" BOOLEAN NOT NULL, "compatible" BOOLEAN NOT NULL, "verification" TEXT NOT NULL DEFAULT 'SELF_REPORTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Plan" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "dataGb" INTEGER NOT NULL, "durationDays" INTEGER NOT NULL,
  "priceCents" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'usd', "pricingLabel" TEXT NOT NULL DEFAULT 'PLACEHOLDER_PRICING',
  "enabled" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Subscription" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "deviceId" UUID NOT NULL, "planId" TEXT NOT NULL,
  "state" "SubscriptionState" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3), CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Payment" (
  "id" UUID NOT NULL, "subscriptionId" UUID NOT NULL, "checkoutKey" TEXT NOT NULL, "checkoutReference" TEXT,
  "checkoutUrl" TEXT, "amountCents" INTEGER NOT NULL, "currency" TEXT NOT NULL, "mode" TEXT NOT NULL,
  "state" "PaymentState" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WebhookEvent" (
  "id" TEXT NOT NULL, "type" TEXT NOT NULL, "paymentId" UUID NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Esim" (
  "id" UUID NOT NULL, "subscriptionId" UUID NOT NULL, "provider" TEXT NOT NULL, "providerReference" TEXT,
  "simulated" BOOLEAN NOT NULL DEFAULT true, "state" "EsimState" NOT NULL DEFAULT 'CREATED',
  "installationState" "InstallationState" NOT NULL DEFAULT 'NOT_CREATED', "activationCipher" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Esim_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProvisioningJob" (
  "id" UUID NOT NULL, "esimId" UUID NOT NULL, "state" "JobState" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3), "leaseToken" TEXT, "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ProvisioningJob_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Usage" (
  "id" UUID NOT NULL, "esimId" UUID NOT NULL, "usedBytes" BIGINT NOT NULL, "totalBytes" BIGINT NOT NULL,
  "measuredAt" TIMESTAMP(3) NOT NULL, "simulated" BOOLEAN NOT NULL,
  CONSTRAINT "Usage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");
CREATE INDEX "Device_userId_idx" ON "Device"("userId");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE UNIQUE INDEX "Payment_subscriptionId_key" ON "Payment"("subscriptionId");
CREATE UNIQUE INDEX "Payment_checkoutKey_key" ON "Payment"("checkoutKey");
CREATE UNIQUE INDEX "Payment_checkoutReference_key" ON "Payment"("checkoutReference");
CREATE UNIQUE INDEX "Esim_subscriptionId_key" ON "Esim"("subscriptionId");
CREATE UNIQUE INDEX "Esim_providerReference_key" ON "Esim"("providerReference");
CREATE UNIQUE INDEX "ProvisioningJob_esimId_key" ON "ProvisioningJob"("esimId");
CREATE INDEX "ProvisioningJob_state_availableAt_idx" ON "ProvisioningJob"("state", "availableAt");
CREATE INDEX "Usage_esimId_measuredAt_idx" ON "Usage"("esimId", "measuredAt");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Esim" ADD CONSTRAINT "Esim_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProvisioningJob" ADD CONSTRAINT "ProvisioningJob_esimId_fkey" FOREIGN KEY ("esimId") REFERENCES "Esim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Usage" ADD CONSTRAINT "Usage_esimId_fkey" FOREIGN KEY ("esimId") REFERENCES "Esim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
