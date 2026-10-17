import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer, request } from "node:http";

// Browser routing cannot reliably intercept redirected requests. Forward the
// real OAuth response to a local provider on another origin, preserving CSP.
const directory = await mkdtemp(join(tmpdir(), "myshotlog-ui-"));
const provider = createServer((incoming, response) => {
  if (
    incoming.method !== "GET" ||
    new URL(incoming.url, "http://localhost").pathname !==
      "/login/oauth/authorize"
  ) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": "text/html",
    "Cache-Control": "no-store",
  });
  response.end("<main>Fictional GitHub authorization</main>");
});
const listen = (server, port) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
let child;
let frontend;
try {
  await promisify(execFile)("git", [
    "init",
    "--bare",
    "--initial-branch=main",
    directory,
  ]);
  await listen(provider, 0);
  const address = provider.address();
  if (!address || typeof address === "string")
    throw new Error("Missing local provider");
  frontend = createServer((incoming, response) => {
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port: 3098,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (result) => {
        const headers = { ...result.headers };
        const location = headers.location;
        if (incoming.url?.split("?")[0] === "/auth/github/" && location) {
          const target = new URL(location);
          if (
            target.origin !== "https://github.com" ||
            target.pathname !== "/login/oauth/authorize"
          ) {
            result.resume();
            response.writeHead(502).end();
            return;
          }
          headers.location = `http://127.0.0.1:${address.port}${target.pathname}${target.search}`;
        }
        response.writeHead(result.statusCode ?? 502, headers);
        result.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(503);
      response.end();
    });
    incoming.on("error", () => upstream.destroy());
    response.on("close", () => upstream.destroy());
    incoming.pipe(upstream);
  });
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3098",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, GIT_DATABASE_REMOTE: directory },
    },
  );
  const stop = () => child?.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  // Playwright waits for a successful response from the frontend before testing.
  await listen(frontend, 3096);
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 0));
  });
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
} finally {
  frontend?.closeAllConnections();
  frontend?.close();
  provider.closeAllConnections();
  provider.close();
  child?.kill("SIGTERM");
  await rm(directory, { recursive: true, force: true });
}
