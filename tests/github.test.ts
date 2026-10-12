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

it.each([404, 409])(
  "reads a confirmed empty repository without creating files (%s)",
  async (status) => {
    const { db, request } = provider([
      { private: true },
      new Response(null, { status }),
      [],
    ]);
    expect(await db.snapshot("users/a")).toEqual({
      head: null,
      files: new Map(),
    });
    expect(request.mock.calls.at(-1)?.[0]).toContain("/branches?per_page=1");
    expect(
      request.mock.calls.every(([, options]) => options.method === "GET"),
    ).toBe(true);
  },
);
it("does not mistake a wrong branch, inaccessible repo or public repo for an empty journal", async () => {
  for (const responses of [
    [
      { private: true },
      new Response(null, { status: 404 }),
      [{ name: "existing" }],
    ],
    [new Response(null, { status: 403 })],
    [{ private: false }],
    [
      { private: true },
      new Response(null, { status: 404 }),
      new Response(null, { status: 403 }),
    ],
  ]) {
    const { db, request } = provider(responses);
    await expect(db.snapshot("users/a")).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
    expect(
      request.mock.calls.every(([, options]) => options.method === "GET"),
    ).toBe(true);
  }
});
it("bootstraps only metadata before atomically publishing a first transaction", async () => {
  const { db, request } = provider([
    { private: true },
    new Response(null, { status: 409 }),
    [],
    { commit: { sha: a } },
    { sha: a, tree: { sha: b } },
    { sha: c },
    { sha: d },
    { sha: b },
    { sha: c },
    { object: { sha: c } },
  ]);
  const receipt = await db.publish({ head: null, files: new Map() }, [
    {
      message: "profile",
      changes: [{ path: "users/a/profile.json", content: "{}" }],
    },
    {
      message: "session",
      changes: [{ path: "users/a/session.json", content: "{}" }],
    },
  ]);
  expect(receipt.commits).toEqual([d, c]);
  const calls = request.mock.calls;
  expect(calls[3][0]).toContain("/contents/.myshotlog.json");
  const bootstrap = JSON.parse(calls[3][1].body as string);
  expect(bootstrap.branch).toBe("main");
  expect(
    JSON.parse(Buffer.from(bootstrap.content, "base64").toString()),
  ).toEqual({ app: "myshotlog", version: 1 });
  expect(JSON.parse(calls[6][1].body as string).parents).toEqual([a]);
  expect(
    calls.filter(([, options]) => options.method === "PATCH"),
  ).toHaveLength(1);
  expect(JSON.parse(calls.at(-1)![1].body as string)).toEqual({
    sha: c,
    force: false,
  });
});
it("retries concurrent initialization and does not hide bootstrap permission failures", async () => {
  for (const status of [409, 422, 403]) {
    const { db, request } = provider([
      { private: true },
      new Response(null, { status: 404 }),
      [],
      new Response(null, { status }),
    ]);
    await expect(
      db.publish({ head: null, files: new Map() }, [
        {
          message: "profile",
          changes: [{ path: "users/a/profile.json", content: "{}" }],
        },
      ]),
    ).rejects.toBeInstanceOf(
      status === 403 ? DatabaseUnavailable : DatabaseConflict,
    );
    expect(
      request.mock.calls.some(([, options]) => options.method === "PATCH"),
    ).toBe(false);
  }
  const { db, request } = provider([{ private: true }, { object: { sha: a } }]);
  await expect(
    db.publish({ head: null, files: new Map() }, [
      { message: "profile", changes: [] },
    ]),
  ).rejects.toBeInstanceOf(DatabaseConflict);
  expect(
    request.mock.calls.some(([, options]) => options.method === "PUT"),
  ).toBe(false);
});
