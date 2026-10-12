import { createHash, createHmac } from "node:crypto";
import { z } from "../validation";
import {
  DatabaseConflict,
  DatabaseUnavailable,
  validPath,
  type GitDatabase,
} from "../git-database/types";

export class RateLimited extends Error {
  constructor(public readonly retryAfter: number) {
    super("För många försök. Vänta och försök igen.");
  }
}
export class InvalidOAuthFlow extends Error {}
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const expiry = z.number().int().positive();
const stateSchema = z
  .object({
    version: z.literal(1),
    sessions: z.record(hashSchema, expiry),
    flows: z.record(hashSchema, expiry),
    rates: z.record(
      hashSchema,
      z.object({ count: z.number().int().positive(), exp: expiry }).strict(),
    ),
  })
  .strict();
type State = z.infer<typeof stateSchema>;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

// Shared atomic state. Never stores bearer cookies, OAuth codes or raw IP addresses.
export class GitSecurityStore {
  private readonly path: string;
  private readonly denied = new Map<string, number>();
  constructor(
    private readonly db: GitDatabase,
    private readonly prefix: string,
    private readonly secret: string,
    private readonly clock: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    this.path = validPath(prefix) + "/state.json";
  }
  private decode(content?: string): State {
    if (!content) return { version: 1, sessions: {}, flows: {}, rates: {} };
    if (Buffer.byteLength(content) > 1_000_000) throw new DatabaseUnavailable();
    const state = stateSchema.parse(JSON.parse(content));
    if (
      Object.keys(state.sessions).length > 1000 ||
      Object.keys(state.flows).length > 100 ||
      Object.keys(state.rates).length > 4000
    )
      throw new DatabaseUnavailable();
    return state;
  }
  private async change(edit: (state: State, now: number) => boolean) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const snapshot = await this.db.snapshot(this.prefix);
      const state = this.decode(snapshot.files.get(this.path)),
        now = this.clock();
      for (const field of [state.sessions, state.flows])
        for (const [key, exp] of Object.entries(field))
          if (exp <= now) delete field[key];
      for (const [key, rate] of Object.entries(state.rates))
        if (rate.exp <= now) delete state.rates[key];
      if (!edit(state, now)) return;
      try {
        await this.db.publish(snapshot, [
          {
            message: "Update authentication security state",
            changes: [{ path: this.path, content: JSON.stringify(state) }],
          },
        ]);
        return;
      } catch (error) {
        if (!(error instanceof DatabaseConflict) || attempt === 4) throw error;
      }
    }
  }
  private key(scope: string, subject: string) {
    return createHmac("sha256", this.secret)
      .update(scope + ":" + subject)
      .digest("hex");
  }
  private charge(
    state: State,
    now: number,
    scope: string,
    subject: string,
    limit: number,
    seconds: number,
  ) {
    const key = this.key(scope, subject),
      rate = state.rates[key];
    if (rate && rate.count >= limit)
      throw new RateLimited(Math.max(1, rate.exp - now));
    if (!rate && Object.keys(state.rates).length >= 4000)
      throw new RateLimited(seconds);
    state.rates[key] = {
      count: (rate?.count ?? 0) + 1,
      exp: rate?.exp ?? now + seconds,
    };
  }
  private async limited(
    scope: string,
    subject: string,
    edit: (state: State, now: number) => boolean,
  ) {
    const key = this.key(scope, subject),
      now = this.clock(),
      until = this.denied.get(key);
    if (until && until > now) throw new RateLimited(until - now);
    try {
      await this.change(edit);
    } catch (error) {
      if (error instanceof RateLimited) {
        // Denial-only cache; access is never granted from memory.
        if (this.denied.size >= 128) this.denied.clear();
        this.denied.set(key, this.clock() + error.retryAfter);
      }
      throw error;
    }
  }
  async registerFlow(state: string, exp: number, client: string) {
    await this.limited("login", client, (data, now) => {
      this.charge(data, now, "login", "global", 20, 600);
      this.charge(data, now, "login-client", client, 5, 600);
      if (
        exp <= now ||
        exp > now + 600 ||
        Object.keys(data.flows).length >= 100
      )
        throw new InvalidOAuthFlow();
      data.flows[hash(state)] = exp;
      return true;
    });
  }
  async consumeFlow(state: string, exp: number, client: string) {
    await this.limited("callback", client, (data, now) => {
      if (data.flows[hash(state)] !== exp || exp <= now)
        throw new InvalidOAuthFlow();
      this.charge(data, now, "callback", "global", 40, 600);
      this.charge(data, now, "callback-client", client, 10, 600);
      delete data.flows[hash(state)];
      return true;
    });
  }
  async addSession(token: string, exp: number) {
    await this.change((data, now) => {
      if (exp <= now || exp > now + 8 * 60 * 60)
        throw new DatabaseUnavailable();
      if (Object.keys(data.sessions).length >= 1000) throw new RateLimited(600);
      data.sessions[hash(token)] = exp;
      return true;
    });
  }
  async activeSession(token: string) {
    const snapshot = await this.db.snapshot(this.prefix);
    return (
      (this.decode(snapshot.files.get(this.path)).sessions[hash(token)] ?? 0) >
      this.clock()
    );
  }
  async revokeSession(token: string) {
    await this.change((data) => {
      if (!data.sessions[hash(token)]) return false;
      delete data.sessions[hash(token)];
      return true;
    });
  }
  async limitApi(owner: string, write: boolean) {
    const scope = write ? "api-write" : "api-read";
    await this.limited(scope, owner, (data, now) => {
      this.charge(data, now, scope, "global", write ? 120 : 300, 60);
      this.charge(data, now, scope + "-user", owner, write ? 30 : 60, 60);
      return true;
    });
  }
}
