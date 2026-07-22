#!/bin/bash
set -e
echo "🦴 Installing LaikaCode..."
npm install
npm link
echo ""
echo "✓ Done! Commands available:"
echo "    laikacode / laika"
echo ""
echo "  Next step:"
echo "    laikacode config set apiKey sk-or-..."
echo "    laika"
