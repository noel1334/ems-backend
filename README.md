# EMS Backend — Stage 14 Payments

Production-oriented multi-tenant EMS backend using Node.js, Express, Prisma and PostgreSQL.

## Stage 14 scope

- Payment records and provider references
- Paystack initialization and verification
- Flutterwave initialization and verification
- Paystack HMAC-SHA512 webhook validation
- Flutterwave `verif-hash` validation
- Provider-side amount/currency/reference verification
- Idempotent wallet funding through a unique ledger reference
- Atomic payment completion + wallet ledger credit
- Wallet ledger and funding modules nested under `src/modules/wallet/`
- Central route registration in `src/route/index.js`

## Important

Do not mark a payment successful based only on a browser callback or webhook payload. The backend re-verifies the transaction with the provider before crediting the wallet.

For Paystack, amounts sent to the provider are converted from NGN to kobo. Paystack documents that transaction amounts are supplied in the currency subunit. https://paystack.com/docs/api/transaction/

Flutterwave webhook events are also re-verified before value is delivered. https://developer.flutterwave.com/docs/webhooks

## Development

```bash
npm install
npm run prisma:generate
npm run prisma:validate
npm run prisma:format
npm run prisma:migrate
npm run dev
```

## Required payment environment variables

See `.env.example`.

Never expose provider secret keys to the frontend.

## Runtime verification

The repository includes a local PostgreSQL/Redis environment in `docker-compose.yml`. After installing dependencies:

```bash
npm install
npm run db:up
cp .env.test.example .env
npx prisma generate
npx prisma validate
npx prisma migrate dev --name init
npx prisma db seed
npm run runtime:check
npm test
npm run lint
```

For CI/production deployments, use `npx prisma migrate deploy` rather than `migrate dev`. Do not commit real JWT or payment-provider secrets.
