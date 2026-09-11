import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: ["node_modules/", "coverage/", "dist/", "build/", "uploads/"],
  },

  eslint.configs.recommended,

  {
    plugins: {
      import: importPlugin,
    },

    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      "no-console": "off",

      "import/extensions": ["error", "always"],
    },
  },

  prettierConfig,
];
