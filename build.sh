#!/usr/bin/env bash
#
# build.sh — Génère le fichier ZIP pour le Chrome Web Store
#
# Usage : ./build.sh
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$ROOT_DIR/tenup-extension"
OUT_DIR="$ROOT_DIR/store-assets"
OUT_FILE="$OUT_DIR/tenup-extension-chrome.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"

cd "$SRC_DIR"
zip -r "$OUT_FILE" . -x ".*" "STORE_*" "PRIVACY*" > /dev/null

size=$(wc -c < "$OUT_FILE" | tr -d ' ')
echo "tenup-extension-chrome.zip ($size octets)"
echo "Contenu :"
unzip -l "$OUT_FILE" | grep -E "^\s+[0-9]" | awk '{print "  " $NF}'
echo ""
echo "Build terminé."
