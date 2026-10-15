import { RepoNotScannableError } from "../checks/repo-snapshot";

/** A regular file read from a tar archive, with its path as stored in the archive. */
export type TarFile = { readonly path: string; readonly bytes: Uint8Array };

/** The kept files, plus the pax global `comment` (GitHub puts the commit SHA there). */
export type TarContents = {
  readonly files: TarFile[];
  readonly globalComment: string | null;
};

type TarHeader = {
  readonly name: string;
  readonly size: number;
  readonly type: string;
};

const BLOCK_BYTES = 512;
const MAX_METADATA_BYTES = 64 * 1024;
const REGULAR_FILE_TYPES = new Set(["0", "\0"]);
const PAX_LOCAL = "x";
const PAX_GLOBAL = "g";
const GNU_LONG_NAME = "L";

/**
 * Reads regular files from an uncompressed tar stream, keeping those `keep(path, size)` accepts.
 * Skipped file bodies are discarded as they stream past, so memory holds only kept files.
 * Understands ustar name prefixes, pax `path`/`comment` records and GNU long names.
 */
export async function readTar(
  stream: ReadableStream<Uint8Array>,
  keep: (path: string, sizeBytes: number) => boolean
): Promise<TarContents> {
  const source = stream.getReader();
  const reader = new ByteReader(source);
  const files: TarFile[] = [];
  let globalComment: string | null = null;
  let overridePath: string | null = null;
  try {
    for (;;) {
      const block = await reader.read(BLOCK_BYTES);
      if (block === null || isZeroBlock(block)) break;
      const header = parseHeader(block);
      const paddedSize = Math.ceil(header.size / BLOCK_BYTES) * BLOCK_BYTES;
      if (
        header.type === PAX_LOCAL ||
        header.type === PAX_GLOBAL ||
        header.type === GNU_LONG_NAME
      ) {
        const metadata = await readMetadata(reader, header, paddedSize);
        if (header.type === GNU_LONG_NAME)
          overridePath = metadata.split("\0", 1)[0];
        else if (header.type === PAX_LOCAL)
          overridePath = paxRecords(metadata).get("path") ?? overridePath;
        else
          globalComment = paxRecords(metadata).get("comment") ?? globalComment;
        continue;
      }
      const path = overridePath ?? header.name;
      overridePath = null;
      if (REGULAR_FILE_TYPES.has(header.type) && keep(path, header.size)) {
        const body = await reader.readExactly(paddedSize);
        files.push({ path, bytes: body.subarray(0, header.size) });
      } else {
        await reader.skip(paddedSize);
      }
    }
  } catch (error) {
    // Stop the download; the original error is the one worth reporting.
    await source.cancel().catch(() => undefined);
    throw error;
  }
  return { files, globalComment };
}

async function readMetadata(
  reader: ByteReader,
  header: TarHeader,
  paddedSize: number
): Promise<string> {
  if (header.size > MAX_METADATA_BYTES) {
    throw new RepoNotScannableError(
      `Expected tar metadata under ${MAX_METADATA_BYTES} bytes, but found ${header.size}.`
    );
  }
  const body = await reader.readExactly(paddedSize);
  return new TextDecoder().decode(body.subarray(0, header.size));
}

function parseHeader(block: Uint8Array): TarHeader {
  const storedChecksum = parseOctal(block.subarray(148, 156));
  if (storedChecksum !== headerChecksum(block)) {
    throw new RepoNotScannableError(
      "Expected a valid tar header, but its checksum does not match."
    );
  }
  const name = cString(block.subarray(0, 100));
  const prefix = cString(block.subarray(345, 500));
  return {
    name: prefix ? `${prefix}/${name}` : name,
    size: parseOctal(block.subarray(124, 136)),
    type: String.fromCharCode(block[156])
  };
}

// The checksum is the byte sum of the header with its own 8-byte field read as spaces.
function headerChecksum(block: Uint8Array): number {
  let sum = 0;
  for (let index = 0; index < BLOCK_BYTES; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : block[index];
  }
  return sum;
}

function parseOctal(field: Uint8Array): number {
  const text = cString(field).trim();
  const value = Number.parseInt(text || "0", 8);
  if (Number.isNaN(value)) {
    throw new RepoNotScannableError(
      `Expected an octal number in a tar header, but found ${JSON.stringify(text)}.`
    );
  }
  return value;
}

function cString(field: Uint8Array): string {
  const end = field.indexOf(0);
  return new TextDecoder().decode(end === -1 ? field : field.subarray(0, end));
}

// Pax records look like "<length> <key>=<value>\n".
function paxRecords(text: string): Map<string, string> {
  const records = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^\d+ ([^=]+)=(.*)$/.exec(line);
    if (match) records.set(match[1], match[2]);
  }
  return records;
}

function isZeroBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

/** Reads exact byte counts from a stream whose chunks arrive in arbitrary sizes. */
class ByteReader {
  private readonly chunks: Uint8Array[] = [];
  private availableBytes = 0;

  constructor(
    private readonly source: ReadableStreamDefaultReader<Uint8Array>
  ) {}

  /** `count` bytes, or null if the stream ended cleanly before any of them arrived. */
  async read(count: number): Promise<Uint8Array | null> {
    while (this.availableBytes < count) {
      if (await this.pull()) continue;
      if (this.availableBytes === 0) return null;
      throw truncatedError(count, this.availableBytes);
    }
    return this.take(count);
  }

  async readExactly(count: number): Promise<Uint8Array> {
    const bytes = await this.read(count);
    if (bytes === null) throw truncatedError(count, 0);
    return bytes;
  }

  async skip(count: number): Promise<void> {
    let remaining = count;
    while (remaining > 0) {
      if (this.availableBytes === 0 && !(await this.pull()))
        throw truncatedError(remaining, 0);
      remaining -= this.discard(remaining);
    }
  }

  private async pull(): Promise<boolean> {
    const { done, value } = await this.source.read();
    if (done) return false;
    this.chunks.push(value);
    this.availableBytes += value.byteLength;
    return true;
  }

  private take(count: number): Uint8Array {
    const output = new Uint8Array(count);
    let offset = 0;
    while (offset < count) {
      const length = Math.min(this.chunks[0].byteLength, count - offset);
      output.set(this.chunks[0].subarray(0, length), offset);
      this.consumeFront(length);
      offset += length;
    }
    return output;
  }

  private discard(maxBytes: number): number {
    let discarded = 0;
    while (discarded < maxBytes && this.chunks.length > 0) {
      const length = Math.min(this.chunks[0].byteLength, maxBytes - discarded);
      this.consumeFront(length);
      discarded += length;
    }
    return discarded;
  }

  private consumeFront(length: number): void {
    const front = this.chunks[0];
    if (length === front.byteLength) this.chunks.shift();
    else this.chunks[0] = front.subarray(length);
    this.availableBytes -= length;
  }
}

function truncatedError(
  expectedBytes: number,
  receivedBytes: number
): RepoNotScannableError {
  return new RepoNotScannableError(
    `Expected ${expectedBytes} more bytes of the repository archive, but it ended after ${receivedBytes}.`
  );
}
