#!/bin/bash
# Comprehensive script to find potentially unused functions and unused files in a JavaScript project.

echo "Scanning project for .js files..."

unused_functions=()
unused_exported_functions=()
exported_function_names=()  # Track exported function names
all_js_files=()

# Configuration for file exclusions
EXCLUDE_PATTERNS=(
    "index.js"  # Exclude index files
    "*test.js"  # Exclude test files
    "*spec.js"  # Exclude spec files
    "*stories.js"  # Exclude Storybook files
    "*.d.ts"    # Exclude TypeScript declaration files
)

# Collect all .js files in an array
while IFS= read -r file; do
    all_js_files+=("$file")
done < <(find . -type f -name "*.js")

# Process each file for functions
for file in "${all_js_files[@]}"; do
    echo "Processing: $file"

    # -- Detect Exported Functions (including async ones) --
    while IFS= read -r line; do
        func=$(echo "$line" | sed -E 's/.*export\s+(async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(.*/\2/')
        if [[ -z "$func" ]]; then continue; fi  # Skip empty matches

        line_number=$(grep -nE "export\s+(async\s+)?function\s+$func\s*\(" "$file" | cut -d: -f1 | head -n 1)

        # Check function usage across the entire project
        count=$(grep -R --include="*.js" -E "\b$func\b" . | wc -l)
        if [ "$count" -le 1 ]; then
            echo "⚠️ Exported function '$func' in $file (Line: $line_number) appears unused."
            unused_exported_functions+=("$file:$line_number $func")
        fi

        exported_function_names+=("$func")
    done < <(grep -E "export\s+(async\s+)?function\s+[a-zA-Z0-9_]+\s*\(" "$file")

    # -- Detect Functions in Export Lists (export { funcName }) --
    while IFS= read -r line; do
        func_names=$(echo "$line" | sed -E 's/.*export\s+\{([^}]*)\}.*/\1/' | tr ',' '\n' | sed 's/ //g')
        for func in $func_names; do
            if [[ -n "$func" ]]; then
                exported_function_names+=("$func")
            fi
        done
    done < <(grep -E "export\s+\{[^}]+\}" "$file")

    # -- Detect Default Exported Functions --
    while IFS= read -r line; do
        func=$(echo "$line" | sed -E 's/.*export\s+default\s+function\s+([a-zA-Z0-9_]+)\s*\(.*/\1/')
        if [[ -n "$func" ]]; then
            exported_function_names+=("$func")
        fi
    done < <(grep -E "export\s+default\s+function\s+[a-zA-Z0-9_]+\s*\(" "$file")

    # -- Detect Named Functions (Non-Exported) --
    while IFS= read -r line; do
        func=$(echo "$line" | sed -E 's/.*function\s+([a-zA-Z0-9_]+)\s*\(.*/\1/')

        # Skip if function is already tracked as exported
        if [[ " ${exported_function_names[@]} " =~ " $func " ]]; then
            continue
        fi

        line_number=$(grep -nE "function\s+$func\s*\(" "$file" | cut -d: -f1 | head -n 1)

        # Check usage only within the same file
        count=$(grep -E "\b$func\b" "$file" | wc -l)
        if [ "$count" -le 1 ]; then
            echo "⚠️ Non-exported function '$func' in $file (Line: $line_number) appears unused."
            unused_functions+=("$file:$line_number $func")
        fi
    done < <(grep -E "function\s+[a-zA-Z0-9_]+\s*\(" "$file" | grep -v "export\s\+(async\s\+)?function")
done

# --- Detect Unused Files ---
unused_files=()

echo -e "\nScanning for unused files..."

# Function to check if a file should be excluded
is_excluded() {
    local file="$1"
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        if [[ "$file" == $pattern ]]; then
            return 0  # True in bash means excluded
        fi
    done
    return 1  # False means not excluded
}

for file in "${all_js_files[@]}"; do
    # Check if file is excluded first
    if is_excluded "$(basename "$file")"; then
        continue
    fi

    # Get the basename of the file, e.g. documentConverter.js
    base=$(basename "$file")
    # Escape any regex special characters
    escaped_base=$(echo "$base" | sed 's/[][\\.^$*+?()|]/\\&/g')
    
    # Look for import or require references that mention the escaped base name
    import_count=$(grep -R --include="*.js" -E "(import|require)\s*(\(|\s+)(['\"]([^'\"]*\/)?$escaped_base['\"])" . | grep -v "$file" | wc -l)
    
    if [ "$import_count" -eq 0 ]; then
        # Additional content-based check
        content_match_count=$(grep -R --include="*.js" -l "$base" . | grep -v "$file" | wc -l)
        
        if [ "$content_match_count" -eq 0 ]; then
            echo "⚠️ File '$file' appears to be unused."
            unused_files+=("$file")
        fi
    fi
done

echo -e "\n✅ Scan complete."

# Print summary with file paths and line numbers for functions
echo -e "\nUnused Functions (Non-exported):"
printf "%s\n" "${unused_functions[@]}" | sort -u

echo -e "\nUnused Exported Functions:"
printf "%s\n" "${unused_exported_functions[@]}" | sort -u

# Print summary of unused files
echo -e "\nUnused Files:"
printf "%s\n" "${unused_files[@]}" | sort -u

# Optional: Counts
echo -e "\nTotal Unused Non-exported Functions: ${#unused_functions[@]}"
echo -e "Total Unused Exported Functions: ${#unused_exported_functions[@]}"
echo -e "Total Unused Files: ${#unused_files[@]}"