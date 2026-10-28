# Phase 1 architecture decisions

1. **One application, database-backed catalog.** Next.js App Router + PostgreSQL/Prisma. No runtime JSON fallback, no simulation state, no login or payments.
2. **Separate identity and versions.** Product and Item identify concepts; ProductVersion/ItemVersion bind fields and composition to DatasetVersion. Seed inserts an immutable version once. Published versions are selected by greatest version number; rejected datasets are excluded.
3. **Shared application boundary.** List client calls the HTTP API; detail server calls the same application service. Repository errors and runtime validation failures become sanitized errors. Secrets and SQL details are not sent to the client.
4. **Explicit provenance.** Source kind, dataset type, verification, modification time and verification time are separate. Mock cannot be verified official data; a reference source is not official. Unknown monetary values are null, not zero. Numeric price storage uses Decimal(30,0) and JSON strings.
5. **Composition, not probability.** ProductComponent and ItemComponent represent quantity-bearing edges. Cycles, dangling refs, duplicate IDs, non-positive quantities and depth over 8 are rejected before seed. Child quantities are per single parent and UI says so. No probability or item-opening semantics are inferred.
6. **Fail closed.** Mixed modes and invalid catalog data are rejected. Same-dataset references only in Phase 1. The database also checks positive quantities, price/currency pairs and verification consistency.
7. **No false source freshness.** Last modified comes from the dataset; verifiedAt remains absent until content verification. No invented freshness TTL or current-price claim.
8. **Minimal image policy.** Only local allowlisted SVG paths are accepted. On failed load the component renders an accessible fallback. External image integrations require verified assets and an explicit policy in a later phase.
9. **Development isolation.** Official and mock modes are different repository filters. Zero official rows render an empty state; they never silently show mock rows. User navigation exposes only implemented pages.
10. **Version selection.** Next/React/Tailwind exact versions were checked against npm. Prisma 6.19.3 is used for the current Node 20 environment and stable schema/client workflow. Toolchain transitive patches (`deepmerge-ts`, `esbuild`) are pinned via overrides after npm audit findings; validate/generate/migrate/seed/build and tests check compatibility. Vitest was updated to 4.1.11 to apply its security fixes. Review overrides on future upgrades.

## Runtime responsibilities

- `src/contracts/catalog.ts`: Zod DTOs, provenance invariants.
- `src/domain/catalog/dataset.ts`: flat input graph verification before persistence.
- `src/application/catalog.ts`: use cases, mode isolation, sanitized domain errors.
- `src/infrastructure/db/catalog-repository.ts`: version selection, batched composition mapping.
- `src/features/shop`: list request state, cards, nested tree, formatting.
- `src/app`: server detail, HTTP handlers, route errors and loading.

No automatic dataset publishing endpoint is exposed. No future empty modules are scaffolded.
