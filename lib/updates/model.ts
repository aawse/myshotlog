export type UpdateStatus = {
  configured: boolean;
  repository?: string;
  branch?: string;
  deployedSha?: string;
  upstreamSha?: string;
  forkSha?: string;
  upstreamAhead: number;
  forkAhead: number;
  canSync: boolean;
  block?: "configuration" | "token" | "owner" | "preview" | "fork";
  checkedAt?: string;
  commits: { sha: string; message: string }[];
};
export type UpdateErrorCode =
  | "configuration"
  | "forbidden"
  | "unavailable"
  | "permissions"
  | "conflict"
  | "changed"
  | "rateLimited";
