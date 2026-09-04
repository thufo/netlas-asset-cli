import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ["dist/**", "release/**", "node_modules/**", ".venv/**"] },
  { rules: { "no-undef": "off" } },
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "vite.config.ts"],
    languageOptions: {
      globals: {
        document: "readonly", window: "readonly", navigator: "readonly",
        HTMLElement: "readonly", HTMLInputElement: "readonly", HTMLSelectElement: "readonly",
        HTMLTextAreaElement: "readonly", HTMLButtonElement: "readonly", Event: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  }
);
