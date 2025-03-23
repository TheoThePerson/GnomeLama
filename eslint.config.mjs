import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs}"] },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
  },
  {
    files: ["ui/**/*.js"],
    languageOptions: {
      // Define the GNOME Shell globals at the language level
      globals: {
        ...globals.browser,
        global: true,
        imports: true,
      },
    },
    rules: {
      // Disable no-redeclare errors for global and imports
      "no-redeclare": "off",
      // Configure no-unused-vars to ignore specific variables
      "no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "hadFilesAttached",
        },
      ],
    },
  },
]);
