import { readFile, writeFile } from "node:fs/promises";
const versions = JSON.parse(
  await readFile(
    new URL("../lib/rules/versions.json", import.meta.url),
    "utf8",
  ),
);
await writeFile(
  new URL("../public/rule-versions.json", import.meta.url),
  JSON.stringify(
    { format: "myshotlog-rules", version: 1, rules: versions },
    null,
    2,
  ) + "\n",
);
console.log(
  "Rule metadata synchronized. Deploy the application; no database migration is needed.",
);
