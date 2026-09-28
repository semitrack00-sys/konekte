# Billing

`BILLING_MODE=mock` requires no external credentials and never charges money. `BILLING_MODE=stripe_test` accepts only a Stripe test secret plus a webhook signing secret supplied through the environment. Live Stripe credentials and live webhook events are rejected. Production startup is blocked.

All plans use **PLACEHOLDER_PRICING**. Initial checkout is a one-time purchase of a 30-day allowance. A development renewal checkout can charge the existing placeholder amount; only a verified Stripe test event can queue a provider top-up. Package assignment and subscription-period extension are recorded after provider confirmation. This is not a Stripe subscription or a claim of live recurring service. Refunds and chargeback processing are not implemented.

## Checkout

The mobile client submits only `planId`, `deviceId` and a UUID `Idempotency-Key`. The API checks ownership and compatibility, loads pricing from the catalog and stores the amount/currency on Payment. It serializes repeated checkout requests by customer/key, rejects changes under an existing key, and sends the payment ID as Stripe's idempotency key.

The remote call happens after the local intent commits. A retry can safely resume after remote creation before local persistence using the same provider key. An unbound intent older than 23 hours requires reconciliation rather than risking a second Checkout session beyond Stripe's key retention window. A transient failure requires the client to retry with the same key.

The test adapter creates Stripe-hosted Checkout; no card number enters Konekte. The configured return URL is server-owned. The return page only tells the customer to await verification; it never fulfills a purchase.

## Verified webhook state machine

The endpoint retains the original request bytes and validates `Stripe-Signature` using the official Stripe SDK and a five-minute timestamp tolerance. It rejects live events. Supported events:

| Event | Effect |
| --- | --- |
| `checkout.session.completed` | Succeed only if `payment_status=paid`; otherwise wait |
| `checkout.session.async_payment_succeeded` | Succeed only if paid |
| `checkout.session.async_payment_failed` | Fail unless already succeeded |
| `checkout.session.expired` | Fail unless already succeeded |

The verified metadata payment ID, session reference, amount, currency, mode and test environment must match local intent. Unbound checkout persistence returns a retryable error, allowing Stripe to redeliver. Unknown signed event types are acknowledged without mutation.

Event IDs are unique in PostgreSQL. Payment-scoped advisory locks serialize concurrent delivery. The verified transition, event receipt, eSIM creation and provisioning job commit atomically. A duplicate returns success. Separate success events cannot create another eSIM. Success is terminal against later failures; a later verified success can recover failure.

## Mock and Stripe testing

The owner-only mock simulation endpoint creates an SDK-signed development event and passes it through the same verifier and state machine. Its signing key is derived from an environment secret. This endpoint is not registered in Stripe test mode. Mock events cannot verify against a Stripe webhook secret.

For optional Stripe sandbox testing, set `BILLING_MODE=stripe_test`, `STRIPE_SECRET_KEY` to your sandbox key, and `STRIPE_WEBHOOK_SECRET` to the CLI listener secret. Forward only to the local `/api/v1/webhooks/stripe` route, restart the API/worker, and create a new checkout. Do not reuse mock payment intents after changing billing mode. No real credentials or live charges are necessary for the default test suite.

Implementation references: [Stripe signature verification](https://docs.stripe.com/webhooks/signature), [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment), [idempotent requests](https://docs.stripe.com/api/idempotent_requests).
