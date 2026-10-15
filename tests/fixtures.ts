import {
  readRepoSnapshot,
  type RepoSnapshot
} from "../src/checks/repo-snapshot";

type Dependencies = Record<string, string>;

export const OPENNEXT_LATEST = { "@opennextjs/cloudflare": "^1.20.11" };

/** A package.json for a Next.js app; `next` is always present. */
export function packageJson(
  dependencies: Dependencies = {},
  devDependencies: Dependencies = {}
): string {
  return JSON.stringify({
    name: "fixture",
    dependencies: { next: "^16.3.8", ...dependencies },
    devDependencies
  });
}

export function snapshotOf(files: Record<string, string>): RepoSnapshot {
  return readRepoSnapshot(new Map(Object.entries(files)));
}

/** An OpenNext app with the latest adapter plus the given files and runtime dependencies. */
export function openNextApp(
  files: Record<string, string> = {},
  dependencies: Dependencies = {}
): RepoSnapshot {
  return snapshotOf({
    "package.json": packageJson({ ...OPENNEXT_LATEST, ...dependencies }),
    ...files
  });
}

/** A wrangler.jsonc built from a plain object. */
export function wranglerJsonc(config: Record<string, unknown>): string {
  return JSON.stringify(config, null, 2);
}

// ── Tar archives ─────────────────────────────────────────────────────

/** One archive member; `type` is the tar typeflag ("0" file, "5" directory, "x"/"g" pax). */
export type TarEntry = {
  readonly path: string;
  readonly content?: string;
  readonly type?: string;
};

const TAR_BLOCK_BYTES = 512;
const encoder = new TextEncoder();

/** A ustar archive with valid header checksums, ending in two zero blocks. */
export function buildTar(
  entries: readonly TarEntry[]
): Uint8Array<ArrayBuffer> {
  const parts = entries.flatMap((entry) => {
    const body = encoder.encode(entry.content ?? "");
    return [
      tarHeader(entry.path, body.byteLength, entry.type ?? "0"),
      padToBlock(body)
    ];
  });
  return concatBytes([...parts, new Uint8Array(TAR_BLOCK_BYTES * 2)]);
}

/** A pax record "<length> key=value\n"; the length counts the whole record, itself included. */
export function paxRecord(key: string, value: string): string {
  const rest = ` ${key}=${value}\n`;
  let length = rest.length + 1;
  while (String(length).length + rest.length !== length) length += 1;
  return `${length}${rest}`;
}

/** Streams `bytes` in fixed-size chunks so parsers meet awkward chunk boundaries. */
export function streamOf(
  bytes: Uint8Array<ArrayBuffer>,
  chunkBytes: number
): ReadableStream<Uint8Array<ArrayBuffer>> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + chunkBytes));
      offset += chunkBytes;
    }
  });
}

export async function gzip(
  bytes: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const compressed = streamOf(bytes, bytes.byteLength || 1).pipeThrough(
    new CompressionStream("gzip")
  );
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

function tarHeader(path: string, sizeBytes: number, type: string): Uint8Array {
  const header = new Uint8Array(TAR_BLOCK_BYTES);
  const write = (offset: number, text: string) =>
    header.set(encoder.encode(text), offset);
  write(0, path.slice(0, 100));
  write(100, "0000644\0");
  write(124, `${sizeBytes.toString(8).padStart(11, "0")}\0`);
  write(148, " ".repeat(8));
  write(156, type);
  write(257, "ustar\0");
  write(263, "00");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  write(148, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

function padToBlock(body: Uint8Array): Uint8Array<ArrayBuffer> {
  const padded = new Uint8Array(
    Math.ceil(body.byteLength / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES
  );
  padded.set(body);
  return padded;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0)
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}
