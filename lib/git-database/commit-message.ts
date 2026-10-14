import { randomUUID } from "node:crypto";
// Distinct attempts must have distinct commit IDs, even with identical trees,
// parents and second-resolution timestamps. Otherwise an already-up-to-date
// push can bypass the optimistic conflict check and replay a one-time flow.
export function commitMessage(message: string) {
  return message + "\n\nMyShotLog-Transaction: " + randomUUID() + "\n";
}
