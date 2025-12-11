#!/bin/bash
# Migration script: Clear entire Figma file cache
# Run this once during deployment to force regeneration with new filename format

CACHE_DIR="${CACHE_DIR:-./cache/figma-files}"

echo "🧹 Clearing entire Figma file cache from: $CACHE_DIR"

if [ ! -d "$CACHE_DIR" ]; then
  echo "   Cache directory does not exist, nothing to clean"
  exit 0
fi

# Remove entire cache directory and recreate it empty
rm -rf "$CACHE_DIR"
mkdir -p "$CACHE_DIR"

echo "✅ Cache cleared successfully"
echo "   All cached Figma files will be regenerated on next request"
