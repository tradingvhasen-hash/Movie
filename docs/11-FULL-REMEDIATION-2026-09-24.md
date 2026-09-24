# Full remediation — 2026-09-24

Baseline: `e95646155e9e4faff926a6311f5157fba086cdde`

This branch is the controlled remediation of the 50-item audit. The release rule is
simple: production is not touched until security/data-integrity fixes, regression
guards, build, and the default recommendation benchmark all pass.

## Release order

1. Privacy/RLS and deletion safety.
2. Local persistence, account ownership and cloud sync correctness.
3. Worker parity, startup/PWA cache correctness and destructive UI semantics.
4. Backup/restore and measurement integrity.
5. Sharing/list identity and public profile correctness.
6. Locale/RTL/accessibility/security headers.
7. Dependency security, deployment/process hardening and documentation.
8. Fresh regression audit, PR review, then controlled production merge/deploy.

Every fix should add or strengthen a guard where practical. Existing historical
migrations are not edited; database changes are additive migrations.
