import { constants } from "node:fs";
import { link, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  allowedUsers,
  githubIdSchema,
  journalOwner,
  legacyMapping,
} from "../lib/auth/session";
import { database, databasePrefix } from "../lib/git-database/config";
import { journalPrefix } from "../lib/git-database/journal-prefix";
import { GitJournalStore } from "../lib/git-database/store";
import { DatabaseConflict } from "../lib/git-database/types";
import { languageOrDefault, t } from "../lib/i18n";
import { validatePhotoAsset } from "../lib/photos/server";
import { exportRecords, exportSchema } from "../lib/portability";
import { operationSchema } from "../lib/sync/model";
import { browserScope, synchronize, SyncConflict } from "../lib/sync/server";
import { TRANSFER_MAX_BYTES } from "../lib/transfer-limits";
import { z } from "../lib/validation";
import { validateSignoff } from "../lib/witness/store";
import { PurgeIncomplete, truncateJournal } from "./truncate-journal";

const pendingSchema = z
  .object({
    format: z.literal("myshotlog-pending"),
    version: z.literal(1),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    operations: z.array(operationSchema).min(1).max(200),
    photos: z.record(z.string(), z.string()),
  })
  .strict()
  .refine(
    ({ operations }) =>
      new Set(operations.map(({ id }) => id)).size === operations.length,
  );

async function readBackup(path: string): Promise<unknown> {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    const { size } = stat;
    if (!stat.isFile() || size > TRANSFER_MAX_BYTES || size === 0)
      throw new Error();
    const bytes = Buffer.alloc(size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(
        bytes,
        offset,
        bytes.length - offset,
      );
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== size) throw new Error();
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)),
    );
  } finally {
    await file.close();
  }
}

async function writeBackup(path: string, contents: string) {
  const destination = resolve(path);
  const temporary = await mkdtemp(join(dirname(destination), ".myshotlog-"));
  const file = join(temporary, "backup.json");
  try {
    await writeFile(file, contents, { flag: "wx", mode: 0o600 });
    // Publish a complete file and refuse to replace any existing destination.
    await link(file, destination);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  let language = languageOrDefault(undefined);
  let failure:
    | "cli.usage"
    | "cli.config"
    | "cli.syncError"
    | "cli.exportError"
    | "cli.truncateError"
    | "cli.truncateUnsupported" = "cli.usage";
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        help: { type: "boolean", short: "h" },
        "github-id": { type: "string" },
        "confirm-repository": { type: "string" },
        "env-file": { type: "string" },
        language: { type: "string" },
      },
    });
    language = languageOrDefault(values.language);
    if (values.help) {
      console.log(t(language, "cli.usage"));
      return;
    }
    const [command, path] = positionals;
    if (command === "truncate") {
      const confirmation = values["confirm-repository"];
      if (
        positionals.length !== 1 ||
        values["github-id"] !== undefined ||
        !confirmation
      )
        throw new Error();
      failure = "cli.config";
      if (values["env-file"]) process.loadEnvFile(values["env-file"]);
      const repository = process.env.GIT_DATABASE_REMOTE;
      failure = "cli.truncateUnsupported";
      if (
        process.env.GIT_DATABASE_PROVIDER !== "git" ||
        !repository ||
        !isAbsolute(repository)
      )
        throw new Error();
      failure = "cli.truncateError";
      await truncateJournal(repository, confirmation);
      console.log(t(language, "cli.truncated"));
      return;
    }
    if (
      (command !== "sync" && command !== "export") ||
      !path ||
      positionals.length !== 2 ||
      values["confirm-repository"] !== undefined ||
      !values["github-id"]
    )
      throw new Error();

    failure = "cli.config";
    if (values["env-file"]) process.loadEnvFile(values["env-file"]);
    const githubId = githubIdSchema.parse(values["github-id"]);
    const allowed = allowedUsers();
    const mapping = legacyMapping();
    if (
      !allowed.includes(githubId) ||
      new Set(allowed.map((id) => journalOwner(id, mapping))).size !==
        allowed.length
    )
      throw new Error();
    const owner = journalOwner(githubId, mapping);
    const provider = database();
    const configuredPrefix = databasePrefix();
    failure = command === "sync" ? "cli.syncError" : "cli.exportError";
    const prefix = await journalPrefix(
      provider,
      owner,
      configuredPrefix,
      process.env.GIT_DATABASE_PREFIX !== undefined,
    );
    const store = new GitJournalStore(provider, owner, prefix);

    if (command === "sync") {
      const value = await readBackup(path);
      if (
        value &&
        typeof value === "object" &&
        "format" in value &&
        value.format === "myshotlog-pending"
      ) {
        const backup = pendingSchema.parse(value);
        if (backup.scope !== browserScope(owner)) {
          console.error(t(language, "cli.scope"));
          process.exitCode = 1;
          return;
        }
        await synchronize(provider, owner, prefix, backup.operations);
      } else {
        await store.mutate("import", value);
      }
      console.log(t(language, "cli.synced"));
    } else {
      const backup = exportSchema.parse(
        exportRecords(await store.exportSnapshot()),
      );
      const contents = JSON.stringify(backup);
      if (Buffer.byteLength(contents) > TRANSFER_MAX_BYTES) throw new Error();
      for (const photo of backup.photos) await validatePhotoAsset(photo);
      for (const signoff of backup.witnessSignoffs)
        await validateSignoff(signoff);
      await writeBackup(path, contents);
      console.log(t(language, "profile.exportReady"));
    }
  } catch (error) {
    console.error(
      t(
        language,
        error instanceof SyncConflict || error instanceof DatabaseConflict
          ? "cli.conflict"
          : error instanceof PurgeIncomplete
            ? "cli.truncateIncomplete"
            : failure,
      ),
    );
    process.exitCode = 1;
  }
}

await main();
