# 626-generic-text-encryption

## Status
Partial

## What it proposes
Make the web encryption page generic so it can encrypt any sensitive text (API keys, tokens, config files, credentials), not just Google service account JSON. Google-specific references should be removed except for an informational note that some endpoints require the `X-Google-Token` header.

## Architectural decisions made
- Backend `POST /encrypt` endpoint accepts any UTF-8 text up to 50KB (not Google-specific)
- Server-side and client-side 50KB size validation
- Result displays `RSA-ENCRYPTED:` prefixed string with copy-to-clipboard
- Google metadata display (client_email, project_id) shown in collapsible section only when Google JSON is detected
- Informational note about `X-Google-Token` header is acceptable as a provider-specific callout
- Terminal/OpenSSL encryption docs should use generic examples, not just Google JSON

## What still needs implementing
- Frontend state variable `serviceAccountJson` should be renamed to a generic name (e.g., `inputData`)
- Textarea `id` and `htmlFor` attributes still use `serviceAccountJson` instead of a generic identifier
- `EncryptionNotAvailableWarning` still links to `docs/google-drive-setup.md` — should be removed or replaced with generic credential setup guidance
- Verify `docs/encryption-setup.md` terminal encryption examples use generic text files (not Google-specific)
