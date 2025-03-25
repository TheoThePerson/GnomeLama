#!/bin/bash
# Script to find potentially unused functions in a JavaScript project.

echo "Scanning project for .js files..."

unused_functions=()
unused_exported_functions=()
exported_function_names=()  # Track exported function names

# Recursively iterate over all .js files
while read -r file; do
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
    done < <(grep -E "function\s+[a-zA-Z0-9_]+\s*\(" "$file" | grep -v "export\s+(async\s+)?function")

done < <(find . -type f -name "*.js")

echo -e "\n✅ Scan complete."

# Print summary with file paths and line numbers
echo -e "\nUnused Functions:"
printf "%s\n" "${unused_functions[@]}" | sort -u

echo -e "\nUnused Exported Functions:"
printf "%s\n" "${unused_exported_functions[@]}" | sort -u
