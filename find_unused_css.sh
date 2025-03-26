#!/bin/bash

# Define paths
STYLE_FILE="styles/style.css"

# Find all JS files recursively
JS_FILES=$(find . -type f -name "*.js")

# Extract class and ID selectors (ignoring properties and colors)
CSS_SELECTORS=$(grep -oP '^\s*\.[a-zA-Z_-][a-zA-Z0-9_-]*|^\s*#[a-zA-Z_-][a-zA-Z0-9_-]*' "$STYLE_FILE" | tr -d ' ' | tr -d '.' | tr -d '#' | sort -u)

# Check each selector in JavaScript files
echo "Unused CSS selectors:"
for selector in $CSS_SELECTORS; do
    if ! grep -qR --include="*.js" "\b$selector\b" .; then
        echo ".$selector"
    fi
done
