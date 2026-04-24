# 001-static-encryption-keys

## Status
Partial

## What it proposes
Replace dynamic RSA key generation with static pre-generated RSA-4096 key pairs loaded from base64-encoded environment variables (`RSA_PUBLIC_KEY` / `RSA_PRIVATE_KEY`). The system gracefully degrades when keys are absent, disabling Google service account features without breaking other functionality. A shell script (`scripts/generate-rsa-keys.sh`) is provided for key generation.

## Architectural decisions made
- Keys stored as base64-encoded PEM in environment variables (not filesystem at runtime)
- `EncryptionManager` class (`server/utils/encryption-manager.ts`) wraps key loading, validation, and encrypt/decrypt with `EncryptionNotEnabledError` / `InvalidKeyFormatError` typed errors
- Graceful degradation: missing keys → disabled state, not a fatal startup error (unless keys are present but malformed)
- Node.js `crypto.createPublicKey()` / `createPrivateKey()` used for PEM validation at startup
- `scripts/generate-rsa-keys.sh` generates RSA-4096 pairs and prints base64-encoded output ready for `.env`
- Encrypted credentials prefixed with `RSA-ENCRYPTED:` for format identification

## What still needs implementing
- GitHub Actions workflow examples for staging (`deploy-staging.yml.example`) and production (`deploy-production.yml.example`) with Secrets injection
- Documentation of GitHub Secrets naming conventions (`STAGING_*` / `PROD_*` prefixes) in `docs/deployment.md`
- Staging and production deployment testing / key isolation verification (T038–T046)
- `contributing.md` updates: manual key generation workflow, optional encryption explanation (T047–T049)
- `docs/encryption-setup.md` updates: remove auto-generation references, add base64 explanation and key rotation (T050–T052)
- `docs/deployment.md` GitHub Secrets setup section (T053–T055)
- Copilot instructions updated with private key security guideline (T056–T057)
- Documentation review with new contributors (T058–T059)
