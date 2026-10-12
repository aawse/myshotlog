import { it, expect, vi } from "vitest";
import { GitHubDatabase } from "../lib/git-database/github";
import {
  DatabaseConflict,
  DatabaseUnavailable,
} from "../lib/git-database/types";
const a = "a".repeat(40),
  b = "b".repeat(40),
  c = "c".repeat(40),
  d = "d".repeat(40);
function provider(responses: unknown[]) {
  const request = vi.fn(async (_url: string, _options: RequestInit) => {
    const value = responses.shift();
    return value instanceof Response ? value : Response.json(value);
  });
  return {
    db: new GitHubDatabase({
      repository: "owner/private",
      branch: "main",
      token: "secret-token",
      fetch: request as typeof fetch,
    }),
    request,
  };
}
it("reads only the requested user namespace and rejects public or truncated repositories", async () => {
  const { db, request } = provider([
    { private: true },
    { object: { sha: a } },
    { sha: a, tree: { sha: b } },
    {
      sha: b,
      tree: [
        { path: "users/a/profile.json", type: "blob", sha: c },
        { path: "users/b/profile.json", type: "blob", sha: d },
      ],
    },
    { encoding: "base64", content: Buffer.from("data").toString("base64") },
  ]);
  expect((await db.snapshot("users/a")).files.get("users/a/profile.json")).toBe(
    "data",
  );
  expect(request).toHaveBeenCalledTimes(5);
  expect(request.mock.calls[0]?.[1]).toMatchObject({
    cache: "no-store",
    headers: { Authorization: "Bearer secret-token" },
  });
  await expect(
    provider([{ private: false }]).db.snapshot("users/a"),
  ).rejects.toBeInstanceOf(DatabaseUnavailable);
  await expect(
    provider([
      { private: true },
      { object: { sha: a } },
      { sha: a, tree: { sha: b } },
      { sha: b, truncated: true, tree: [] },
    ]).db.snapshot("users/a"),
  ).rejects.toBeInstanceOf(DatabaseUnavailable);
});
it("builds one commit per entry and publishes the entire chain with one non-force ref update", async () => {
  const { db, request } = provider([
    { sha: a, tree: { sha: b } },
    { sha: c },
    { sha: d },
    { sha: b },
    { sha: c },
    { object: { sha: c } },
  ]);
  const receipt = await db.publish({ head: a, files: new Map() }, [
    { message: "one", changes: [{ path: "users/a/one.json", content: "{}" }] },
    { message: "two", changes: [{ path: "users/a/two.json", content: null }] },
  ]);
  expect(receipt.commits).toEqual([d, c]);
  const calls = request.mock.calls as unknown as [string, RequestInit][];
  expect(JSON.parse(calls[1][1].body as string)).toEqual({
    base_tree: b,
    tree: [
      { path: "users/a/one.json", mode: "100644", type: "blob", content: "{}" },
    ],
  });
  expect(JSON.parse(calls[4][1].body as string).parents).toEqual([d]);
  expect(calls.filter(([, opts]) => opts.method === "PATCH")).toHaveLength(1);
  expect(JSON.parse(calls[5][1].body as string)).toEqual({
    sha: c,
    force: false,
  });
});
it("never publishes a partially failed chain and sanitizes upstream errors", async () => {
  const { db, request } = provider([
    { sha: a, tree: { sha: b } },
    { sha: c },
    { sha: d },
    new Response("secret-token", { status: 500 }),
  ]);
  await expect(
    db.publish({ head: a, files: new Map() }, [
      { message: "one", changes: [] },
      { message: "two", changes: [] },
    ]),
  ).rejects.toBeInstanceOf(DatabaseUnavailable);
  expect(
    (request.mock.calls as unknown as [string, RequestInit][]).some(
      ([, opts]) => opts.method === "PATCH",
    ),
  ).toBe(false);
  const conflict = provider([
    { sha: a, tree: { sha: b } },
    { sha: c },
    { sha: d },
    new Response("secret-token", { status: 409 }),
  ]);
  await expect(
    conflict.db.publish({ head: a, files: new Map() }, [
      { message: "one", changes: [] },
    ]),
  ).rejects.toBeInstanceOf(DatabaseConflict);
});
