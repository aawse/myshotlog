import { spawn } from "node:child_process";

const [count, ...args] = process.argv.slice(2);
if (
  !count ||
  !/^[1-9]\d?$/.test(count) ||
  args.some((arg) => arg.startsWith("--repeat-each"))
) {
  console.error(
    "Usage: npm run test:ui:repeat -- <1-99> [Playwright arguments without --repeat-each]",
  );
  process.exitCode = 1;
} else {
  const run = (command, env) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, command, { stdio: "inherit", env });
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  // Build with exactly the public settings used by the UI webServer config.
  const built = await run(
    ["node_modules/next/dist/bin/next", "build", "--webpack"],
    {
      ...process.env,
      VERCEL: "0",
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://ui.myshotlog.test",
    },
  );
  process.exitCode = built;
  if (built === 0) {
    for (let iteration = 0; iteration < Number(count); iteration++) {
      console.log(`UI repetition ${iteration + 1}/${count}`);
      // Each invocation creates a fresh bare Git database and rate-limit state.
      const result = await run(
        ["node_modules/@playwright/test/cli.js", "test", ...args],
        {
          ...process.env,
          UI_SKIP_BUILD: "1",
        },
      );
      if (result !== 0) {
        process.exitCode = result;
        break;
      }
    }
  }
}
