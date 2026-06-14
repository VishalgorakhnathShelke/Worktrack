# Commit 001: Repository Foundation

## What Changed

- Established monorepo boundaries for the API, web app, extension, and contracts.
- Defined architecture, privacy boundaries, ownership, and delivery gates.
- Added shared versioned JSON Schema contracts.
- Added contribution and review standards.

## Why

Six people can work in parallel only when public contracts and ownership are
clear. Privacy and analytics constraints are documented before implementation
so unsafe shortcuts do not become architecture.

## Scalability Review

- Tenant IDs, UUIDs, and schema versions preserve future migration options.
- AI and slow-job boundaries are designed as replaceable adapters.
- Append-only events and versioned derivatives support auditability.

## Senior Review

- Security: external-AI forbidden data and recorder controls are explicit.
- Quality: contract ownership and cross-area reviews reduce integration drift.
- Efficiency: one monorepo and shared contracts avoid duplicate types.
- Residual risk: authentication and production infrastructure are intentionally
  deferred; these must remain visible limitations.
