#!/bin/bash
# Quick test script for Google Drive to Markdown converter MVP
# Usage: ./test-mvp.sh YOUR_GOOGLE_DOC_ID

set -e

DOC_ID="${1:-}"
if [ -z "$DOC_ID" ]; then
  echo "❌ Error: Missing document ID"
  echo ""
  echo "Usage: ./test-mvp.sh YOUR_GOOGLE_DOC_ID"
  echo ""
  echo "Example:"
  echo "  ./test-mvp.sh 1a2b3c4d5e6f7g8h9i0j"
  echo ""
  echo "Or with full URL:"
  echo "  ./test-mvp.sh https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit"
  exit 1
fi

# Check if google.json exists
if [ ! -f "google.json" ]; then
  echo "❌ Error: google.json not found"
  echo ""
  echo "Please create a Google Service Account and save the JSON file as 'google.json'"
  echo "See: docs/google-service-account.md"
  exit 1
fi

# Check if server is running
if ! curl -s http://localhost:3000/api/config > /dev/null 2>&1; then
  echo "❌ Error: Server not running"
  echo ""
  echo "Start the server first:"
  echo "  npm run start-local"
  exit 1
fi

# Extract document ID from URL if full URL provided
if [[ "$DOC_ID" =~ /document/d/([^/]+) ]]; then
  DOC_ID="${BASH_REMATCH[1]}"
  echo "📄 Extracted document ID: $DOC_ID"
fi

URL="https://docs.google.com/document/d/$DOC_ID/edit"

echo ""
echo "🧪 Testing Google Drive to Markdown Converter MVP"
echo "=================================================="
echo ""
echo "Document URL: $URL"
echo ""

# Test: Convert document
echo "📥 Converting document to markdown..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/drive-doc-to-markdown \
  -H "Content-Type: application/json" \
  -H "X-Google-Json: $(cat google.json | jq -c)" \
  -d "{\"url\": \"$URL\"}")

# Check for errors
if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "❌ Error occurred:"
  echo "$RESPONSE" | jq '.'
  exit 1
fi

TITLE=$(echo "$RESPONSE" | jq -r '.metadata.title')
PROCESSING_TIME=$(echo "$RESPONSE" | jq -r '.processingTimeMs')
MARKDOWN_LENGTH=$(echo "$RESPONSE" | jq -r '.markdown | length')

# Save markdown to cache folder for reference
CACHE_DIR="cache/google-docs/$DOC_ID"
mkdir -p "$CACHE_DIR"
echo "$RESPONSE" | jq -r '.markdown' > "$CACHE_DIR/content.md"
echo "💾 Saved to: $CACHE_DIR/content.md"

echo "✅ Conversion successful!"
echo "   Title: $TITLE"
echo "   Processing time: ${PROCESSING_TIME}ms"
echo "   Markdown length: $MARKDOWN_LENGTH characters"
echo ""

# Summary
echo "=================================================="
echo "🎉 MVP Test Complete!"
echo ""
echo "   Document converted: ${PROCESSING_TIME}ms"
echo ""
echo ""
echo "To view the markdown:"
echo "  cat cache/google-docs/$DOC_ID/content.md"
echo ""
