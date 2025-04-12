#!/bin/bash
# Comprehensive script to find potentially unused functions and variables and unused files in a JavaScript project.

echo "Scanning project for .js files..."

unused_functions=()
unused_exported_functions=()
exported_function_names=()
all_js_files=()

# Configuration for file exclusions
EXCLUDE_PATTERNS=(
    "index.js"
    "*test.js"
    "*spec.js"
    "*stories.js"
    "*.d.ts"
)

# Collect all .js files in an array
while IFS= read -r file; do
    all_js_files+=("$file")
done < <(
    find . -type f -name "*.js" \
    ! -name "index.js" \
    ! -name "*test.js" \
    ! -name "*spec.js" \
    ! -name "*stories.js"
)

# Process each file for functions and variables
for file in "${all_js_files[@]}"; do
    echo "Processing: $file"

    # -- Detect Exported Functions (including async ones) --
    while IFS= read -r line; do
        func=$(echo "$line" | sed -E 's/.*export\s+(async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(.*/\2/')
        if [[ -z "$func" ]]; then continue; fi
        line_number=$(grep -nE "export\s+(async\s+)?function\s+$func\s*\(" "$file" | cut -d: -f1 | head -n 1)
        count=$(grep -R --include="*.js" -w "\b$func\b" . | wc -l)
        if [ "$count" -le 1 ]; then
            echo "⚠️ Exported function '$func' in $file (Line: $line_number) appears unused."
            unused_exported_functions+=("$file:$line_number $func")
        fi
        exported_function_names+=("$func")
    done < <(grep -E "export\s+(async\s+)?function\s+[a-zA-Z0-9_]+\s*\(" "$file")

    # -- Detect Functions in Export Lists --
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

    # -- Detect Exported Variables (const, let, var) --
    while IFS= read -r line; do
        var_name=$(echo "$line" | sed -E 's/.*export\s+(const|let|var)\s+([a-zA-Z0-9_]+).*/\2/')
        if [[ -z "$var_name" ]]; then continue; fi
        line_number=$(grep -nE "export\s+(const|let|var)\s+$var_name" "$file" | cut -d: -f1 | head -n 1)
        count=$(grep -R --include="*.js" -w "\b$var_name\b" . | wc -l)
        if [ "$count" -le 1 ]; then
            echo "⚠️ Exported variable '$var_name' in $file (Line: $line_number) appears unused."
            unused_exported_functions+=("$file:$line_number $var_name (var)")
        fi
        exported_function_names+=("$var_name")
    done < <(grep -E "export\s+(const|let|var)\s+[a-zA-Z0-9_]+" "$file")

    # -- Detect Named Functions (Non-Exported) --
    while IFS= read -r line; do
        func=$(echo "$line" | sed -E 's/.*function\s+([a-zA-Z0-9_]+)\s*\(.*/\1/')
        if [[ " ${exported_function_names[@]} " =~ " $func " ]]; then
            continue
        fi
        line_number=$(grep -nE "function\s+$func\s*\(" "$file" | cut -d: -f1 | head -n 1)
        count=$(grep -E "\b$func\b" "$file" | wc -l)
        if [ "$count" -le 1 ]; then
            echo "⚠️ Non-exported function '$func' in $file (Line: $line_number) appears unused."
            unused_functions+=("$file:$line_number $func")
        fi
    done < <(grep -E "function\s+[a-zA-Z0-9_]+\s*\(" "$file" | grep -v "export\s\+")

    # -- Detect Local (Non-Exported) Variables (const, let, var) --
    while IFS= read -r line; do
        var_name=$(echo "$line" | sed -E 's/.*(const|let|var)\s+([a-zA-Z0-9_]+).*/\2/')
        if [[ -z "$var_name" ]]; then continue; fi
        if [[ " ${exported_function_names[@]} " =~ " $var_name " ]]; then
            continue
        fi
        line_number=$(grep -nE "(const|let|var)\s+$var_name" "$file" | cut -d: -f1 | head -n 1)
        count=$(grep -w "\b$var_name\b" "$file" | wc -l)
        if [ "$count" -le 1 ]; then
            echo "⚠️ Non-exported variable '$var_name' in $file (Line: $line_number) appears unused."
            unused_functions+=("$file:$line_number $var_name (var)")
        fi
    done < <(grep -E "^\s*(const|let|var)\s+[a-zA-Z0-9_]+(\s*=|\s*;)" "$file" | grep -v "export\s\+")
done

# --- Detect Unused Files ---
unused_files=()
echo -e "\nScanning for unused files..."

is_excluded() {
    local file="$1"
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        if [[ "$file" == $pattern ]]; then
            return 0
        fi
    done
    return 1
}

for file in "${all_js_files[@]}"; do
    if is_excluded "$(basename "$file")"; then
        continue
    fi

    base=$(basename "$file")
    base_no_ext="${base%.js}"
    escaped_base=$(echo "$base" | sed 's/[][\\.^$*+?()|]/\\&/g')
    escaped_base_no_ext=$(echo "$base_no_ext" | sed 's/[][\\.^$*+?()|]/\\&/g')

    import_count=$(grep -R --include="*.js" -E "(import|require)[^'\"]*(['\"]([^'\"]*/)?($escaped_base|$escaped_base_no_ext)['\"])" . | grep -v "$file" | wc -l)
    if [ "$import_count" -eq 0 ]; then
        content_match_count=$(grep -R --include="*.js" -l "$base" . | grep -v "$file" | wc -l)
        if [ "$content_match_count" -eq 0 ]; then
            echo "⚠️ File '$file' appears to be unused."
            unused_files+=("$file")
        fi
    fi
done

echo -e "\n✅ Scan complete."

# Print summary
echo -e "\nUnused Functions / Variables (Non-exported):"
printf "%s\n" "${unused_functions[@]}" | sort -u

echo -e "\nUnused Exported Functions / Variables:"
printf "%s\n" "${unused_exported_functions[@]}" | sort -u

echo -e "\nUnused Files:"
printf "%s\n" "${unused_files[@]}" | sort -u

echo -e "\nTotal Unused Non-exported Functions/Variables: ${#unused_functions[@]}"
echo -e "Total Unused Exported Functions/Variables: ${#unused_exported_functions[@]}"
echo -e "Total Unused Files: ${#unused_files[@]}"
