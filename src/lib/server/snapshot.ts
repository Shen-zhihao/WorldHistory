import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { seedSnapshot, todayShanghai } from "./db";

export interface DataManifest {
  schemaVersion: number;
  cutoff: string;
  generatedAt: string;
  selectedEvents: number;
  archiveRecords: number;
  months: number;
  files: { path: string; bytes: number; sha256: string }[];
}

/** Export every retained record plus reproducible hashes for the Git-distributed assets. */
export async function writeSnapshot() {
  const snapshot = seedSnapshot();
  const target = join(process.cwd(), "data", "events.json.gz");
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, gzipSync(JSON.stringify(snapshot), { level: 9 }));
  await rename(temporary, target);
  const paths = ["data/events.json.gz", "data/supplemental-events.json.gz", "public/geo/countries-110m.json"];
  for (const directory of ["public/geo/history", "public/images/events", "public/fonts"]) {
    for (const file of await readdir(join(process.cwd(), directory))) {
      if (/\.(gz|webp|woff2|json)$/.test(file)) paths.push(`${directory}/${file}`);
    }
  }
  const files: DataManifest["files"] = [];
  for (const path of paths.sort()) {
    const bytes = await readFile(join(process.cwd(), path));
    files.push({ path, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const manifest: DataManifest = {
    schemaVersion: 1,
    cutoff: todayShanghai(),
    generatedAt: new Date().toISOString(),
    selectedEvents: snapshot.events.length,
    archiveRecords: snapshot.candidates.length,
    months: snapshot.months.length,
    files,
  };
  await writeFile(join(process.cwd(), "data", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
