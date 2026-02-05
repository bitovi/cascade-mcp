# Research: Static Pre-Generated Encryption Keys

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)  
**Phase**: 0 - Outline & Research  
**Date**: February 3, 2026

## Research Questions Resolved

### 1. Base64 Encoding for Multi-Line PEM Files

**Question**: How to store multi-line PEM files in environment variables?

**Decision**: Use standard base64 encoding (Node.js `Buffer.toString('base64')`)

**Rationale**:
- GitHub Secrets documentation recommends base64 encoding for multi-line secrets
- Node.js has built-in base64 support: `Buffer.from(base64String, 'base64').toString('utf8')`
- Standard base64 encoding is widely understood and documented
- No need for URL-safe variant since environment variables don't have URL encoding constraints

**Alternatives Considered**:
- Single-line PEM with escaped newlines: Complex to maintain, error-prone in shell scripts
- Custom delimiter-based encoding: Adds unnecessary complexity
- Splitting into multiple environment variables: Increases configuration burden

**References**:
- [GitHub: Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets#storing-large-secrets)
- [Node.js Buffer Documentation](https://nodejs.org/api/buffer.html#static-method-bufferfromstring-encoding)

### 2. Environment Variable Naming Convention

**Question**: What naming convention for encryption key environment variables?

**Decision**: 
- `GOOGLE_RSA_PUBLIC_KEY` - Base64-encoded public key PEM
- `GOOGLE_RSA_PRIVATE_KEY` - Base64-encoded private key PEM

**Rationale**:
- Prefix `GOOGLE_` matches existing `GOOGLE_SERVICE_ACCOUNT_ENCRYPTED` variable
- `RSA` clarifies the encryption algorithm
- `PUBLIC_KEY` / `PRIVATE_KEY` are explicit and self-documenting
- All-caps snake_case follows established pattern in `.env.example`

**Alternatives Considered**:
- `GOOGLE_ENCRYPTION_PUBLIC` / `GOOGLE_ENCRYPTION_PRIVATE`: Less specific about algorithm
- `GOOGLE_PUBLIC_PEM` / `GOOGLE_PRIVATE_PEM`: Emphasizes format over purpose
- Single variable with both keys: Security risk (private key must be separate)

### 3. GitHub Secrets Management Strategy

**Question**: How to configure separate keys for staging and production in GitHub Secrets?

**Decision**: Environment-specific secrets with deployment workflow configuration

**Implementation Pattern**:
```yaml
# .github/workflows/deploy-staging.yml
env:
  GOOGLE_RSA_PUBLIC_KEY: ${{ secrets.STAGING_GOOGLE_RSA_PUBLIC_KEY }}
  GOOGLE_RSA_PRIVATE_KEY: ${{ secrets.STAGING_GOOGLE_RSA_PRIVATE_KEY }}

# .github/workflows/deploy-production.yml
env:
  GOOGLE_RSA_PUBLIC_KEY: ${{ secrets.PROD_GOOGLE_RSA_PUBLIC_KEY }}
  GOOGLE_RSA_PRIVATE_KEY: ${{ secrets.PROD_GOOGLE_RSA_PRIVATE_KEY }}
```

**Rationale**:
- GitHub Secrets are environment-agnostic (not tied to GitHub Environments)
- Prefix-based naming (`STAGING_*`, `PROD_*`) makes secrets organization clear
- Workflow files explicitly map secrets to standard environment variable names
- Prevents accidental cross-environment key usage

**Alternatives Considered**:
- GitHub Environments: Requires branch protection rules, adds complexity for this use case
- Single shared key pair: Security violation - compromised staging key affects production
- Separate repositories: Excessive overhead for key isolation

**References**:
- [GitHub Actions: Using Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets#using-encrypted-secrets-in-a-workflow)

### 4. Graceful Degradation Pattern

**Question**: How should system behave when encryption keys are not configured?

**Decision**: Log informational message and disable Google-specific features

**Implementation Pattern**:
```typescript
export class GoogleKeyManager {
  private isEnabled = false;
  
  async loadKeysFromEnv(): Promise<void> {
    const publicKeyB64 = process.env.GOOGLE_RSA_PUBLIC_KEY;
    const privateKeyB64 = process.env.GOOGLE_RSA_PRIVATE_KEY;
    
    if (!publicKeyB64 || !privateKeyB64) {
      console.log('ℹ️  Google encryption keys not configured');
      console.log('   Google Drive/Docs features will be unavailable');
      console.log('   To enable: See docs/encryption-setup.md');
      this.isEnabled = false;
      return;
    }
    
    // Decode and validate keys...
    this.isEnabled = true;
  }
  
  isFeatureEnabled(): boolean {
    return this.isEnabled;
  }
}
```

**Rationale**:
- Informational logging (not warning/error) - missing keys are valid configuration
- Clear guidance on how to enable the feature
- Other system functionality continues unaffected
- Tools can check `isFeatureEnabled()` before attempting encryption operations

**Alternatives Considered**:
- Throw error on startup: Too aggressive, breaks entire system for optional feature
- Silent failure: Poor developer experience, confusing when features don't work
- Lazy error on first use: Better than startup failure, but informational logging at startup is more helpful

### 5. Key Generation Script Approach

**Question**: How should developers generate RSA key pairs?

**Decision**: Shell script using OpenSSL (ubiquitous on macOS/Linux)

**Implementation**:
```bash
#!/bin/bash
# scripts/generate-rsa-keys.sh
set -e

echo "🔐 Generating RSA-4096 key pair..."

# Generate private key
openssl genrsa -out private.pem 4096
chmod 600 private.pem

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem
chmod 644 public.pem

echo "✅ Keys generated successfully:"
echo "   Private: private.pem (permissions: 600)"
echo "   Public:  public.pem (permissions: 644)"
echo ""
echo "📋 Add to .env file:"
echo "GOOGLE_RSA_PUBLIC_KEY=$(base64 -i public.pem | tr -d '\n')"
echo "GOOGLE_RSA_PRIVATE_KEY=$(base64 -i private.pem | tr -d '\n')"
```

**Rationale**:
- OpenSSL is pre-installed on macOS and most Linux distributions
- Script handles permissions automatically (0600 for private key)
- Outputs base64-encoded values ready for `.env` file
- Single command execution, no manual steps for permission setting

**Alternatives Considered**:
- Node.js script using `crypto.generateKeyPair()`: Requires Node.js setup first, less portable
- Manual OpenSSL commands in documentation: Error-prone, developers skip permission setting
- Online key generators: Security risk, keys should never be generated on untrusted systems

**References**:
- [OpenSSL RSA Key Generation](https://www.openssl.org/docs/man1.1.1/man1/genrsa.html)

### 6. Key Validation Strategy

**Question**: How to validate loaded keys are valid PEM format?

**Decision**: Attempt to create Node.js `crypto` key objects during initialization

**Implementation Pattern**:
```typescript
import { createPublicKey, createPrivateKey } from 'crypto';

async function validateKeys(publicPem: string, privatePem: string): Promise<void> {
  try {
    // Validate public key
    createPublicKey(publicPem);
    
    // Validate private key
    createPrivateKey(privatePem);
  } catch (error) {
    throw new Error(`Invalid RSA key format: ${error.message}`);
  }
}
```

**Rationale**:
- Node.js `crypto` module validates PEM format and key structure
- Fails fast on startup rather than on first encryption/decryption attempt
- No external dependencies needed
- Same validation used internally by `publicEncrypt`/`privateDecrypt`

**Alternatives Considered**:
- Regex validation of PEM headers: Insufficient - doesn't validate key structure
- Test encryption/decryption on startup: Adds latency, same validation happens in `createPublicKey`
- No validation: Poor developer experience - errors appear during runtime operations

### 7. Backward Compatibility with Current Implementation

**Question**: Can existing encrypted credentials continue to work?

**Decision**: Yes - encryption format (`RSA-ENCRYPTED:` prefix, base64-encoded chunks) remains unchanged

**Validation**:
- Same RSA-OAEP padding with SHA-256
- Same 4096-bit key size
- Same chunking strategy (400-byte plaintext chunks → 512-byte encrypted chunks)
- Only key source changes (environment variables instead of filesystem)

**Migration Path**:
- Generate keys with new script
- Base64-encode and add to environment variables
- Existing encrypted credentials work immediately
- No re-encryption required unless rotating keys

**Alternatives Considered**:
- New encryption format: Breaking change, requires re-encrypting all stored credentials
- Version-based decryption: Unnecessary complexity since format is identical

## Implementation Priorities

Based on user story priorities from spec.md:

### P1: Local Development Setup (Critical Path)
1. Create key generation script (`scripts/generate-rsa-keys.sh`)
2. Simplify `GoogleKeyManager` to load from environment variables only
3. Remove `generateRSAKeyPair()` from `crypto.ts`
4. Add graceful degradation for missing keys
5. Update `.env.example` with new variables

### P2: GitHub Secrets Integration
1. Document GitHub Secrets setup in `docs/deployment.md`
2. Add example GitHub Actions workflow snippets
3. Test with separate staging/production keys

### P3: Documentation Updates
1. Update `contributing.md` with local setup instructions
2. Update `docs/encryption-setup.md` and `docs/google-drive-setup.md` for new workflow
3. Update `.github/copilot-instructions.md` with security guidelines

## Technology Stack Decisions

### Existing Technologies (Reused)
- **Node.js `crypto` module**: RSA encryption/decryption (no changes)
- **TypeScript strict mode**: Type safety maintained
- **Existing test framework**: Unit tests for new environment loading logic

### New Tools Required
- **OpenSSL**: Key generation (already available on target platforms)
- **Base64 encoding**: Native Node.js `Buffer` (no external dependencies)

### Dependencies Removed
- File system operations for key management (`fs/promises` still used elsewhere)
- Dynamic key generation logic (`generateRSAKeyPair` function removed)

## Security Considerations

### Private Key Protection
- Environment variables are process-isolated (not accessible across processes)
- Private key never transmitted to client (server-side decryption only)
- Base64 encoding is NOT encryption (keys must still be kept secret)
- GitHub Secrets are encrypted at rest and in transit

### Key Rotation Process
1. Generate new key pair with script
2. Base64-encode and update environment variables (or GitHub Secrets)
3. Restart server (loads new keys)
4. Re-encrypt all stored service account credentials with new public key
5. Distribute new encrypted credentials to users/systems
6. Old encrypted credentials become invalid (cannot decrypt with new private key)

### Validation Measures
- Key format validated on startup (fails fast)
- Missing keys logged as informational (not error)
- Private key access logged for audit trail

## Open Questions

None - all research questions resolved.

## Next Steps (Phase 1)

1. Generate `data-model.md`:
   - Environment variable schema (GOOGLE_RSA_PUBLIC_KEY, GOOGLE_RSA_PRIVATE_KEY)
   - Key validation rules
   - Base64 encoding/decoding logic
   - Graceful degradation state management

2. Generate `contracts/`:
   - TypeScript interfaces for environment configuration
   - Key loading function signatures
   - Error types for validation failures

3. Generate `quickstart.md`:
   - 5-minute setup guide for local development
   - Script execution → environment variable setup → server start
   - Verification steps (test encryption on web page)

4. Update agent context:
   - Run `.specify/scripts/bash/update-agent-context.sh copilot`
   - Add new environment variable patterns
   - Document graceful degradation pattern
