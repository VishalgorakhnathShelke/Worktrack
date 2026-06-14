# Prototype Threat Model

## Highest-Risk Data

- Typed values, authentication data, screenshots, audio, and workflow metadata.
- Company-specific SOPs and operational insights.

## Required Controls

- Persistent recording indicator, pause/stop controls, and explicit consent.
- Domain allowlist and configurable sensitive-field selectors.
- Never capture password fields or payment/authentication-related inputs.
- Redacted payload preview and approval before external AI processing.
- Tenant-scoped persistence and object access.
- Deletion workflow covering sources and derived outputs.
- No employee ranking or unsupported performance claims.

## Prototype Limitations

This is not production-certified software. Before production use, complete an
independent penetration test, privacy impact assessment, access-control review,
retention policy, incident response process, and legal review.
