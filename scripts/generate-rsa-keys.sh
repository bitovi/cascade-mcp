#!/bin/bash

# Generate RSA-4096 Key Pair for Google Service Account Encryption
#
# This script generates a new RSA-4096 key pair and outputs base64-encoded
# versions suitable for environment variables (GitHub Secrets, .env files).
#
# Usage:
#   ./scripts/generate-rsa-keys.sh
#
# Output:
#   - private.pem (0600 permissions) - Private key file
#   - public.pem (0644 permissions) - Public key file
#   - Console output with base64-encoded keys for .env

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔐 Generating RSA-4096 Key Pair for Google Encryption${NC}"
echo ""

# Generate private key (4096-bit RSA)
echo -e "${YELLOW}→${NC} Generating private key..."
openssl genrsa -out private.pem 4096 2>/dev/null

# Set strict permissions on private key (owner read/write only)
chmod 0600 private.pem
echo -e "  ${GREEN}✓${NC} private.pem created (0600 permissions)"

# Generate public key from private key
echo -e "${YELLOW}→${NC} Generating public key..."
openssl rsa -in private.pem -pubout -out public.pem 2>/dev/null

# Set standard permissions on public key (owner read/write, others read)
chmod 0644 public.pem
echo -e "  ${GREEN}✓${NC} public.pem created (0644 permissions)"

echo ""
echo -e "${BLUE}📝 Base64-Encoded Keys for Environment Variables${NC}"
echo ""
echo -e "${YELLOW}Add these lines to your .env file:${NC}"
echo ""

# Store base64-encoded keys in variables (without line breaks)
PUBLIC_KEY_B64=$(base64 < public.pem | tr -d '\n')
PRIVATE_KEY_B64=$(base64 < private.pem | tr -d '\n')

# Output in .env format for easy copy-paste
echo "RSA_PUBLIC_KEY=\"${PUBLIC_KEY_B64}\""
echo ""
echo "RSA_PRIVATE_KEY=\"${PRIVATE_KEY_B64}\""
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}⚠️  Security Notes:${NC}"
echo ""
echo "  • Keep private.pem and RSA_PRIVATE_KEY secret"
echo "  • Never commit private keys to version control"
echo "  • Use different keys for dev, staging, and production"
echo "  • Store production keys in GitHub Secrets Manager"
echo ""
echo -e "${YELLOW}💡 Copy-Paste Tips:${NC}"
echo ""
echo "  • Copy the ENTIRE line including quotes: RSA_PUBLIC_KEY=\"...\""
echo "  • The quotes are REQUIRED to preserve special characters"
echo "  • Don't add extra line breaks when pasting into .env"
echo "  • Verify: keys should be one continuous base64 string"
echo ""
echo -e "${BLUE}📚 Documentation:${NC}"
echo "  • Setup: docs/encryption-setup.md"
echo "  • Deployment: docs/deployment.md"
echo ""
echo -e "${GREEN}✓${NC} Key generation complete!"
