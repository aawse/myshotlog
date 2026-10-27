import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture(fail = false) {
  const directory = await mkdtemp(join(tmpdir(), "myshotlog-repeat-test-"));
  directories.push(directory);
  await copyFile(
    new URL("../scripts/repeat-ui.mjs", import.meta.url),
    join(directory, "repeat-ui.mjs"),
  );
  for (const [path, kind] of [
    ["node_modules/next/dist/bin/next", "build"],
    ["node_modules/@playwright/test/cli.js", "test"],
  ] as const) {
    const target = join(directory, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(
      target,
      `
      const fs = require('node:fs');
      fs.appendFileSync('calls.jsonl', JSON.stringify({
        kind: ${JSON.stringify(kind)}, args: process.argv.slice(2),
        site: process.env.NEXT_PUBLIC_SITE_URL, vercel: process.env.VERCEL,
        skip: process.env.UI_SKIP_BUILD
      }) + '\\n');
      if (${fail} && ${JSON.stringify(kind)} === 'test') process.exitCode = 7;
    `,
    );
  }
  return directory;
}

it("builds once with UI settings and invokes a fresh test process per repetition", async () => {
  const cwd = await fixture();
  await promisify(execFile)(
    process.execPath,
    ["repeat-ui.mjs", "3", "tests/ui/login.spec.ts"],
    { cwd },
  );
  const calls = (await readFile(join(cwd, "calls.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
  expect(calls).toHaveLength(4);
  expect(calls[0]).toMatchObject({
    kind: "build",
    site: "https://ui.myshotlog.test",
    vercel: "0",
    args: ["build", "--webpack"],
  });
  for (const call of calls.slice(1))
    expect(call).toMatchObject({
      kind: "test",
      skip: "1",
      args: ["test", "tests/ui/login.spec.ts"],
    });
});

it("stops and preserves a failing test exit status", async () => {
  const cwd = await fixture(true);
  await expect(
    promisify(execFile)(process.execPath, ["repeat-ui.mjs", "3"], { cwd }),
  ).rejects.toMatchObject({ code: 7 });
  expect(
    (await readFile(join(cwd, "calls.jsonl"), "utf8")).trim().split("\n"),
  ).toHaveLength(2);
});

it("rejects invalid repetition counts and shared-server repeats before building", async () => {
  const cwd = await fixture();
  for (const args of [["0"], ["100"], ["2", "--repeat-each=20"]]) {
    await expect(
      promisify(execFile)(process.execPath, ["repeat-ui.mjs", ...args], {
        cwd,
      }),
    ).rejects.toMatchObject({ code: 1 });
  }
  await expect(readFile(join(cwd, "calls.jsonl"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
