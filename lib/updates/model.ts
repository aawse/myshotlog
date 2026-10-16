export type UpdateStatus = {
  configured: boolean;
  repository?: string;
  branch?: string;
  deployedSha?: string;
  upstreamSha?: string;
  forkSha?: string;
  upstreamAhead: number;
  forkAhead: number;
  block?: "configuration" | "fork";
  checkedAt?: string;
  commits: { sha: string; message: string }[];
};
export type UpdateErrorCode =
  "configuration" | "unavailable" | "permissions" | "rateLimited";
