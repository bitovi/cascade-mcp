# 33-google-service-account-encryption.md

## Status
Implemented

## What it proposes
Encrypt Google service account JSON credentials using RSA-4096 asymmetric encryption so users never transmit plaintext credentials. A server endpoint (`/google-service-encrypt`) lets users paste their service account JSON and receive an `RSA-ENCRYPTED:<base64>` string safe for storage and transmission via env vars or request headers.

## Architectural decisions made
- RSA-OAEP with SHA-256, 4096-bit key size
- `RSA-ENCRYPTED:` prefix on encrypted output to identify format
- Chunked encryption (400-byte chunks) to handle service account JSON exceeding RSA max payload
- Originally proposed auto-generating keys stored in `cache/keys/google-rsa/` filesystem
- **Spec is marked deprecated**: approach was refactored to use static pre-generated keys from `RSA_PUBLIC_KEY` / `RSA_PRIVATE_KEY` environment variables instead of auto-generated files
- Encrypted credentials passed via `X-Google-Token` header

## What still needs implementing
Fully implemented. Core encryption is in `server/utils/crypto.ts`, key management in `server/utils/encryption-manager.ts`, and the encrypt endpoint in `server/encrypt.ts`. All API endpoints (`write-story`, `write-shell-stories`, `analyze-feature-scope`) document and support `X-Google-Token: RSA-ENCRYPTED:...`. The auto-generated filesystem key approach was replaced by env-var-based static keys per the linked follow-up spec.
