import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Express only recognizes an error-handling middleware by its 4-arg
      // signature (err, req, res, next) — unused params in that signature
      // (e.g. `_req`, `_next`) are structural, not dead code.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
