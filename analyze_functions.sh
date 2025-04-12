#!/bin/bash
echo "🧠 JS Project Analyzer"

read -rp "🔍 Check exported functions? (y/n): " check_exported_funcs
read -rp "🔍 Check exported variables? (y/n): " check_exported_vars
read -rp "🧪 Check local functions? (y/n): " check_local_funcs
read -rp "🧪 Check local variables? (y/n): " check_local_vars
read -rp "📁 Check unused JS files? (y/n): " check_files

all_js_files=()
unused_local=()
unused_exported=()
unnecessary_exports=()
unused_files=()
exported_names=()

EXCLUDE_PATTERNS=(
    "index.js"
    "*test.js"
    "*spec.js"
    "*stories.js"
    "*.d.ts"
)

# Get all .js files
while IFS= read -r file; do
    all_js_files+=("$file")
done < <(find . -type f -name "*.js" \
    ! -name "index.js" \
    ! -name "*test.js" \
    ! -name "*spec.js" \
    ! -name "*stories.js")

is_excluded() {
    local file="$1"
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        [[ "$file" == $pattern ]] && return 0
    done
    return 1
}

for file in "${all_js_files[@]}"; do
    [[ ! -f "$file" ]] && continue
    echo "📄 Scanning: $file"

    if [[ "$check_exported_funcs" == "y" ]]; then
        # Exported Functions
        while IFS= read -r match; do
            func=$(echo "$match" | sed -E 's/.*function\s+([a-zA-Z0-9_]+)\s*\(.*/\1/')
            line_number=$(echo "$match" | cut -d: -f1)

            used_elsewhere=$(grep -Rw --include="*.js" "\b$func\b" . | grep -v "$file" | wc -l)
            used_locally=$(grep -w "$func" "$file" | grep -vE "^\s*export|function\s+$func" | wc -l)

            if [[ "$used_elsewhere" -eq 0 && "$used_locally" -gt 0 ]]; then
                echo "⚠️ $file:$line_number — Exported function '$func' only used locally."
                unnecessary_exports+=("$file:$line_number $func")
            elif [[ "$used_elsewhere" -eq 0 && "$used_locally" -eq 0 ]]; then
                echo "⚠️ $file:$line_number — Exported function '$func' appears unused."
                unused_exported+=("$file:$line_number $func")
            fi
            exported_names+=("$func")
        done < <(grep -nE "export\s+(async\s+)?function\s+[a-zA-Z0-9_]+\s*\(" "$file")
    fi

    if [[ "$check_exported_vars" == "y" ]]; then
        # Exported Variables
        while IFS= read -r match; do
            var=$(echo "$match" | sed -E 's/.*(const|let|var)\s+([a-zA-Z0-9_]+).*/\2/')
            line_number=$(echo "$match" | cut -d: -f1)

            used_elsewhere=$(grep -Rw --include="*.js" "\b$var\b" . | grep -v "$file" | wc -l)
            used_locally=$(grep -w "$var" "$file" | grep -vE "^\s*export|$var\s*=" | wc -l)

            if [[ "$used_elsewhere" -eq 0 && "$used_locally" -gt 0 ]]; then
                echo "⚠️ $file:$line_number — Exported variable '$var' only used locally."
                unnecessary_exports+=("$file:$line_number $var (var)")
            elif [[ "$used_elsewhere" -eq 0 && "$used_locally" -eq 0 ]]; then
                echo "⚠️ $file:$line_number — Exported variable '$var' appears unused."
                unused_exported+=("$file:$line_number $var (var)")
            fi
            exported_names+=("$var")
        done < <(grep -nE "export\s+(const|let|var)\s+[a-zA-Z0-9_]+" "$file")
    fi

    if [[ "$check_local_funcs" == "y" ]]; then
        while IFS= read -r match; do
            func=$(echo "$match" | sed -E 's/.*function\s+([a-zA-Z0-9_]+)\s*\(.*/\1/')
            line_number=$(echo "$match" | cut -d: -f1)

            [[ " ${exported_names[*]} " =~ " $func " ]] && continue

            used=$(grep -w "$func" "$file" | grep -vE "function\s+$func" | wc -l)
            if [[ "$used" -eq 0 ]]; then
                echo "⚠️ $file:$line_number — Local function '$func' appears unused."
                unused_local+=("$file:$line_number $func")
            fi
        done < <(grep -nE "function\s+[a-zA-Z0-9_]+\s*\(" "$file" | grep -v "export")
    fi

    if [[ "$check_local_vars" == "y" ]]; then
        while IFS= read -r match; do
            var=$(echo "$match" | sed -E 's/.*(const|let|var)\s+([a-zA-Z0-9_]+).*/\2/')
            line_number=$(echo "$match" | cut -d: -f1)

            [[ " ${exported_names[*]} " =~ " $var " ]] && continue

            used=$(grep -w "$var" "$file" | grep -vE "^\s*(const|let|var)\s+$var" | wc -l)
            if [[ "$used" -eq 0 ]]; then
                echo "⚠️ $file:$line_number — Local variable '$var' appears unused."
                unused_local+=("$file:$line_number $var (var)")
            fi
        done < <(grep -nE "^\s*(const|let|var)\s+[a-zA-Z0-9_]+(\s*=|\s*;)" "$file" | grep -v "export")
    fi
done

if [[ "$check_files" == "y" ]]; then
    echo -e "\n📁 Checking for unused files..."
    for file in "${all_js_files[@]}"; do
        base=$(basename "$file")
        base_no_ext="${base%.js}"

        is_excluded "$base" && continue

        import_count=$(grep -Rl --include="*.js" -E "(import|require)[^'\"]*(['\"]([^'\"]*/)?($base|$base_no_ext)['\"])" . | grep -v "$file" | wc -l)
        content_match=$(grep -Rl --include="*.js" "$base" . | grep -v "$file" | wc -l)

        if [[ "$import_count" -eq 0 && "$content_match" -eq 0 ]]; then
            echo "⚠️ File '$file' appears to be unused."
            unused_files+=("$file")
        fi
    done
fi

# === 📋 Summary ===
echo -e "\n✅ Scan complete."

[[ "$check_exported_funcs" == "y" || "$check_exported_vars" == "y" ]] && {
    echo -e "\n🔸 Unused Exported Functions / Variables:"
    printf "%s\n" "${unused_exported[@]}" | sort -u

    echo -e "\n🔸 Exported But Only Used Locally:"
    printf "%s\n" "${unnecessary_exports[@]}" | sort -u
}

[[ "$check_local_funcs" == "y" || "$check_local_vars" == "y" ]] && {
    echo -e "\n🔸 Unused Local (Non-exported) Functions / Variables:"
    printf "%s\n" "${unused_local[@]}" | sort -u
}

[[ "$check_files" == "y" ]] && {
    echo -e "\n🔸 Unused Files:"
    printf "%s\n" "${unused_files[@]}" | sort -u
}
