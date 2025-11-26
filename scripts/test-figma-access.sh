#!/bin/bash
# Test Figma API access with your current token
# Run with: DEBUG_FIGMA_TOKEN=true npm run start-local
# Then copy the full token from logs and paste it here

if [ -z "$1" ]; then
  echo "Usage: ./test-figma-access.sh <figma_token>"
  echo ""
  echo "This will test if your token can access the TaskFlow file"
  echo "To get your token, run: DEBUG_FIGMA_TOKEN=true npm run start-local"
  echo "Then trigger identify-features and copy the full token from logs"
  exit 1
fi

TOKEN="$1"
FILE_KEY="3JgSzy4U8gdIGm1oyHiovy"
NODE_ID="292:38"

echo "Testing Figma API access..."
echo "File: TaskFlow ($FILE_KEY)"
echo "Node: $NODE_ID"
echo ""

# Determine token type and set appropriate header
if [[ $TOKEN == figu_* ]]; then
  echo "Token type: OAuth (figu_...)"
  AUTH_HEADER="Authorization: Bearer $TOKEN"
elif [[ $TOKEN == figd_* ]]; then
  echo "Token type: PAT (figd_...)"
  AUTH_HEADER="X-Figma-Token: $TOKEN"
else
  echo "Token type: Unknown (setting as PAT)"
  AUTH_HEADER="X-Figma-Token: $TOKEN"
fi

echo ""
echo "Making request to Figma API..."
echo ""

curl -v \
  -H "$AUTH_HEADER" \
  "https://api.figma.com/v1/files/$FILE_KEY/nodes?ids=$(echo $NODE_ID | sed 's/:/%3A/g')"

echo ""
echo ""
echo "If you see 403, the token doesn't have access to this file."
echo "If you see 200, the token works and there's a bug in our code."
