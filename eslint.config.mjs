import jsdoc from "eslint-plugin-jsdoc";

export default [
  {
    plugins: {
      jsdoc,
    },

    languageOptions: {
      globals: {
        global: "readonly",
      },

      ecmaVersion: 2020,
      sourceType: "module",
    },

    rules: {
      camelcase: [
        "error",
        {
          properties: "never",
          allow: ["^vfunc_", "^on_"],
        },
      ],

      "consistent-return": "error",
      eqeqeq: ["error", "smart"],
      "prefer-arrow-callback": "error",
      "jsdoc/require-param-description": "off",
      "jsdoc/require-jsdoc": [
        "error",
        {
          exemptEmptyFunctions: true,

          publicOnly: {
            esm: true,
          },
        },
      ],
    },
  },
];
