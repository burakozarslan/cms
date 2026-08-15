import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [".next/**", "node_modules/**", "data/**"],
  },
  {
    // FlyonUI must stay isolated behind the @frontend/ui boundary so the rest of
    // the app never depends on it directly.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "flyonui",
              message:
                "Import UI from '@frontend/ui' instead. FlyonUI may only be imported inside src/frontend/ui/.",
            },
          ],
          patterns: [
            {
              group: ["flyonui/*"],
              message:
                "Import UI from '@frontend/ui' instead. FlyonUI may only be imported inside src/frontend/ui/.",
            },
          ],
        },
      ],
    },
  },
  {
    // The boundary itself is allowed to import FlyonUI.
    files: ["src/frontend/ui/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];

export default eslintConfig;
