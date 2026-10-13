import "server-only";
import type { MessageKey } from "@/lib/i18n";
import { allowedUsers, legacyMapping, journalOwner } from "@/lib/auth/session";
import { validBranch, validPath } from "@/lib/git-database/types";
import { GitHubUpdates, updateConfig, UpdateError } from "@/lib/updates/github";
export type InstallationCheck = {
  id: string;
  label: MessageKey;
  status: "ok" | "warning" | "error";
  message: MessageKey;
  variables?: string[];
};
export type InstallationReport = { checks: InstallationCheck[] };
const supplied = (value?: string) =>
  Boolean(value?.trim() && !/^YOUR_|^REPLACE_|^changeme$/i.test(value));
export async function checkInstallation(
  githubId: string,
  origin: string,
  request: typeof fetch = fetch,
): Promise<InstallationReport> {
  const env = process.env;
  const checks: InstallationCheck[] = [];
  const add = (
    id: string,
    label: MessageKey,
    status: InstallationCheck["status"],
    message: MessageKey,
    variables?: string[],
  ) => {
    checks.push({
      id,
      label,
      status,
      message,
      ...(variables ? { variables } : {}),
    });
  };
  const validate = (
    id: string,
    label: MessageKey,
    variables: string[],
    fn: () => boolean,
    optional = false,
  ) => {
    const missing = variables.filter((name) => !supplied(env[name]));
    let valid = false;
    try {
      valid = !missing.length && fn();
    } catch {
      /* Only fixed messages leave the server. */
    }
    add(
      id,
      label,
      valid ? "ok" : optional ? "warning" : "error",
      valid
        ? "installation.configured"
        : missing.length
          ? "installation.missing"
          : "installation.invalid",
      missing.length ? missing : variables,
    );
    return valid;
  };
  validate(
    "oauth",
    "installation.oauth",
    ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    () => true,
  );
  validate(
    "secret",
    "installation.secret",
    ["AUTH_SESSION_SECRET"],
    () =>
      env.AUTH_SESSION_SECRET!.length >= 32 &&
      Buffer.byteLength(env.AUTH_SESSION_SECRET!) >= 32,
  );
  validate("users", "installation.users", ["GITHUB_ALLOWED_USER_IDS"], () =>
    allowedUsers().includes(githubId),
  );
  validate("mapping", "installation.mapping", [], () => {
    const ids = allowedUsers(),
      map = legacyMapping();
    return new Set(ids.map((id) => journalOwner(id, map))).size === ids.length;
  });
  const siteValid = validate(
    "site",
    "installation.site",
    ["NEXT_PUBLIC_SITE_URL"],
    () => {
      const url = new URL(env.NEXT_PUBLIC_SITE_URL!);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/" &&
        (url.protocol === "https:" ||
          (env.NODE_ENV !== "production" &&
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)))
      );
    },
  );
  if (siteValid)
    add(
      "origin",
      "installation.origin",
      new URL(env.NEXT_PUBLIC_SITE_URL!).origin === origin ? "ok" : "warning",
      new URL(env.NEXT_PUBLIC_SITE_URL!).origin === origin
        ? "installation.originOk"
        : "installation.originMismatch",
      ["NEXT_PUBLIC_SITE_URL"],
    );
  add(
    "callback",
    "installation.callback",
    "warning",
    "installation.callbackManual",
  );
  validate(
    "provider",
    "installation.provider",
    [],
    () =>
      !env.GIT_DATABASE_PROVIDER ||
      ["github", "git"].includes(env.GIT_DATABASE_PROVIDER),
  );
  validate("storage-options", "installation.storageOptions", [], () => {
    validBranch(env.GIT_DATABASE_BRANCH ?? "main");
    validPath(env.GIT_DATABASE_PREFIX ?? "myshotlog/v1");
    const seconds = Number(env.GIT_DATABASE_READ_CACHE_SECONDS ?? "15");
    return Number.isInteger(seconds) && seconds >= 0 && seconds <= 300;
  });
  if (env.GIT_DATABASE_PROVIDER === "git") {
    validate(
      "remote",
      "installation.repository",
      ["GIT_DATABASE_REMOTE"],
      () =>
        !env.GIT_DATABASE_REMOTE!.startsWith("-") &&
        !/[\x00-\x1f]/.test(env.GIT_DATABASE_REMOTE!),
    );
    add(
      "remote-access",
      "installation.storageAccess",
      env.VERCEL ? "error" : "warning",
      "installation.remoteManual",
    );
  } else if (
    !env.GIT_DATABASE_PROVIDER ||
    env.GIT_DATABASE_PROVIDER === "github"
  ) {
    const repoValid = validate(
      "repository",
      "installation.repository",
      ["GIT_DATABASE_REPOSITORY", "GIT_DATABASE_TOKEN"],
      () =>
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GIT_DATABASE_REPOSITORY!),
    );
    const apiValid = validate("api", "installation.api", [], () => {
      const url = new URL(env.GIT_DATABASE_API_URL ?? "https://api.github.com");
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    });
    if (repoValid && apiValid) {
      const base =
        (env.GIT_DATABASE_API_URL ?? "https://api.github.com").replace(
          /\/$/,
          "",
        ) +
        "/repos/" +
        env.GIT_DATABASE_REPOSITORY;
      const get = (path: string) =>
        request(base + path, {
          headers: {
            Authorization: "Bearer " + env.GIT_DATABASE_TOKEN,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2026-03-10",
          },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        });
      try {
        const metadata = await get("");
        if (!metadata.ok) throw new Error();
        const data = await metadata.json();
        if (typeof data.private !== "boolean") throw new Error();
        add(
          "private",
          "installation.privacy",
          data.private ? "ok" : "error",
          data.private ? "installation.privateOk" : "installation.publicRepo",
        );
        add(
          "writable",
          "installation.writable",
          data.archived || data.disabled ? "error" : "warning",
          data.archived || data.disabled
            ? "installation.readOnly"
            : "installation.writeManual",
        );
        if (data.private) {
          const branch = validBranch(env.GIT_DATABASE_BRANCH ?? "main");
          const ref = await get(
            "/git/ref/heads/" +
              branch.split("/").map(encodeURIComponent).join("/"),
          );
          if (ref.ok) {
            const data = await ref.json();
            if (!/^[a-f0-9]{40}$/.test(data.object?.sha ?? ""))
              throw new Error();
            add(
              "storage-access",
              "installation.storageAccess",
              "ok",
              "installation.readOk",
            );
          } else if ([404, 409].includes(ref.status)) {
            const branches = await get("/branches?per_page=1");
            if (!branches.ok) throw new Error();
            const data = await branches.json();
            if (!Array.isArray(data)) throw new Error();
            add(
              "storage-access",
              "installation.storageAccess",
              data.length ? "error" : "warning",
              data.length
                ? "installation.branchMissing"
                : "installation.emptyRepo",
              ["GIT_DATABASE_BRANCH"],
            );
          } else throw new Error();
        }
      } catch {
        add(
          "storage-access",
          "installation.storageAccess",
          "error",
          "installation.accessFailed",
          ["GIT_DATABASE_REPOSITORY", "GIT_DATABASE_TOKEN"],
        );
      }
    }
  }
  try {
    const config = updateConfig();
    if (!config)
      add(
        "updates",
        "installation.updates",
        "warning",
        "updates.configuration",
      );
    else {
      const status = await new GitHubUpdates(config, request).inspect();
      const messages = {
        fork: "updates.forkHelp",
        configuration: "updates.configuration",
      } as const;
      add(
        "updates",
        "installation.updates",
        status.block ? "warning" : "ok",
        status.block ? messages[status.block] : "installation.updateOk",
      );
    }
  } catch (error) {
    add(
      "updates",
      "installation.updates",
      "warning",
      error instanceof UpdateError && error.code === "permissions"
        ? "updates.permissions"
        : error instanceof UpdateError && error.code === "configuration"
          ? "updates.configuration"
          : "updates.unavailable",
    );
  }
  add(
    "deployment",
    "installation.deployment",
    "warning",
    "installation.deploymentManual",
  );
  const relatedVariables: Record<string, string[]> = {
    mapping: ["GITHUB_USER_ID_MAP"],
    provider: ["GIT_DATABASE_PROVIDER"],
    "storage-options": [
      "GIT_DATABASE_BRANCH",
      "GIT_DATABASE_PREFIX",
      "GIT_DATABASE_READ_CACHE_SECONDS",
    ],
    api: ["GIT_DATABASE_API_URL"],
  };
  for (const check of checks) {
    if (!check.variables?.length && relatedVariables[check.id])
      check.variables = relatedVariables[check.id];
  }
  return { checks };
}
