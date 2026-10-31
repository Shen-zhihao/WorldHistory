import { createHash } from "node:crypto";

export function contentHash(title: string, summary: string): string {
  return createHash("sha256").update(title + "\0" + summary).digest("hex");
}
