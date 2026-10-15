import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    testTimeout: 30000,
    exclude: [...configDefaults.exclude, "tests/ui/**"],
  },
});
