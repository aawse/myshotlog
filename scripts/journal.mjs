import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import ts from "@typescript/typescript6";

const root = new URL("../", import.meta.url);
const source = (url) =>
  url?.startsWith(new URL("lib/", root).href) ||
  url?.startsWith(new URL("scripts/", root).href);

// The app uses Next's extensionless imports, aliases and server-only marker.
// Resolve those conventions for this Node entry point without changing app imports.
registerHooks({
  resolve(specifier, context, next) {
    if (!source(context.parentURL)) return next(specifier, context);
    if (specifier === "server-only")
      return next("next/dist/compiled/server-only/empty.js", context);
    if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      const url = specifier.startsWith("@/")
        ? new URL(specifier.slice(2), root)
        : new URL(specifier, context.parentURL);
      const typescript = new URL(url.href + ".ts");
      if (source(url.href) && existsSync(typescript))
        return next(typescript.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (source(url) && url.endsWith(".json"))
      return next(url, { ...context, importAttributes: { type: "json" } });
    if (!source(url) || !url.endsWith(".ts")) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    };
  },
});

await import("./journal-cli.ts");
