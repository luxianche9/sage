import { defineConfig } from "vitest/config";

// Resolve @sage/* workspace packages from TypeScript source (see the
// "sage-source" exports condition in each package's package.json).
const conditions = ["sage-source", "module", "node", "import", "default"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } }
});
