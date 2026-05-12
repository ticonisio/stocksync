# Story: Platform-Aware Onboarding Foundation

## Status

Implemented - DB platform field deferred

## Goal

Allow a new merchant to choose which ecommerce platform they use before connecting a store, starting with Shopify and preparing the product path for Nuvemshop.

## User Flow

1. Merchant creates an account or signs in.
2. If the merchant has no connected store, StockSync sends them to platform selection.
3. Merchant chooses one platform:
   - Shopify
   - Nuvemshop
4. StockSync sends the merchant to the correct connector flow.
5. After a store is connected, StockSync syncs products, variants, and platform grouping data.
6. Merchant lands in the dashboard.

## Technical Plan

1. Add platform identity to the data model.
   - Add a `CommercePlatform` enum with `SHOPIFY` and `NUVEMSHOP`.
   - Add `platform` to `Store`.
   - Preserve existing Shopify stores by defaulting existing rows to `SHOPIFY`.
   - Decide whether to keep Shopify-specific column names for this foundation story or introduce neutral external ID fields in the next story.

2. Replace Shopify-only onboarding redirects.
   - Change new-user redirect from `/connect-shopify` to `/connect-store`.
   - Change dashboard guard redirects from `/connect-shopify` to `/connect-store`.
   - Keep `/connect-shopify` as the Shopify connector route.

3. Add platform selection page.
   - Create `/connect-store`.
   - Show Shopify and Nuvemshop as platform options.
   - Shopify option routes to `/connect-shopify`.
   - Nuvemshop option routes to `/connect-nuvemshop`.
   - If Nuvemshop is not implemented yet, show an inactive "Em breve" state or route to a placeholder connector page.

4. Preserve Shopify behavior.
   - `POST /api/shopify/connect` continues to validate and save Shopify credentials.
   - New Shopify store records are saved with `platform = SHOPIFY`.
   - Existing sync, webhook, orders, provador, billing, and dashboard behavior continue working for Shopify stores.

5. Add Nuvemshop placeholder path.
   - Create `/connect-nuvemshop` with clear copy that the connector is being prepared.
   - Do not request credentials until the OAuth connector story is implemented.
   - Keep this page behind the same authenticated onboarding layout.

6. Update generic UI copy.
   - Empty states should say "Conectar loja" or "Conectar plataforma" where the message is not Shopify-specific.
   - Keep Shopify-specific copy only inside the Shopify connector flow.

7. Add tests.
   - New user auth config points to `/connect-store`.
   - Dashboard layout redirects users without a store to `/connect-store`.
   - Shopify connect still creates or updates stores with `platform = SHOPIFY`.
   - Platform selection renders both Shopify and Nuvemshop options.

## Acceptance Checklist

- [x] New users are sent to `/connect-store`, not `/connect-shopify`.
- [x] Users without a connected store are redirected from protected dashboard pages to `/connect-store`.
- [x] `/connect-store` lets the user choose Shopify or Nuvemshop.
- [x] Shopify selection opens the existing Shopify connection flow.
- [x] Nuvemshop selection has a defined placeholder or disabled state until its connector is built.
- [ ] `Store` records include a platform value.
- [x] Existing Shopify stores remain compatible without requiring a production DB migration.
- [x] Shopify connection still validates credentials and registers webhooks as before.
- [x] Generic UI copy no longer implies StockSync only supports Shopify.
- [x] Tests cover redirect, platform selection, and Shopify compatibility.

## File List

- `prisma/schema.prisma`
- `src/lib/auth.ts`
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/**/page.tsx`
- `src/app/(onboarding)/connect-store/page.tsx`
- `src/app/(onboarding)/connect-shopify/page.tsx`
- `src/app/(onboarding)/connect-nuvemshop/page.tsx`
- `src/app/api/shopify/connect/route.ts`
- `src/components/inventory/InventoryTable.tsx`
- `src/components/settings/DisconnectStoreButton.tsx`
- `tests/unit/auth.test.ts`
- `tests/unit/shopify-connect.test.ts`
- `tests/unit/platform-onboarding.test.tsx`

## Follow-Up Stories

- Nuvemshop OAuth app install and callback.
- Nuvemshop product, variant, category, and stock sync.
- Nuvemshop order import and velocity calculation.
- Nuvemshop webhook registration and processing.
- Platform-neutral external IDs for products, variants, collections, orders, and webhook events.
- Nuvemshop storefront/provador installation path.

## Notes

- Nuvemshop current API docs use OAuth authorization code flow and return `access_token` plus `user_id`, where `user_id` is the store id used in API URLs.
- Nuvemshop API requests require `Authentication: bearer <token>` and a `User-Agent` header.
- The first implementation should avoid pretending Nuvemshop is fully available until auth and sync are implemented.
- Prisma format and generate were run successfully via local CLI.
- `npm test`, `npm run lint`, and `npm run typecheck` timed out locally before returning diagnostics; single-file Vitest and direct `tsc`/`next lint` attempts also timed out.
- The `Store.platform` schema change was deferred because production Supabase is not reachable from local or Vercel build over the current `db.<project>.supabase.co:5432` URL. Keep the UI flow live first, then add the platform column after switching production to a reachable pooled database URL or applying the SQL in Supabase.
