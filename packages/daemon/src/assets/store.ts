import { createHash } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const TYPE = Object.fromEntries(Object.entries(EXT).map(([mime, ext]) => [ext, mime]));
export const MAX_ASSET = 10 * 1024 * 1024;
const ID = /^[0-9a-f]{64}$/;

/** A client error: the route answers its status and message. */
export class AssetError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Width and height read from the file header; undefined when the bytes are not that format. */
export function imageSize(b: Buffer, mime: string): { width: number; height: number } | undefined {
  const size = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : undefined);
  try {
    if (mime === "image/png") {
      return b.toString("latin1", 1, 4) === "PNG" && b.toString("latin1", 12, 16) === "IHDR" ? size(b.readUInt32BE(16), b.readUInt32BE(20)) : undefined;
    }
    if (mime === "image/gif") return b.toString("latin1", 0, 3) === "GIF" ? size(b.readUInt16LE(6), b.readUInt16LE(8)) : undefined;
    if (mime === "image/jpeg") {
      if (b.readUInt16BE(0) !== 0xffd8) return undefined;
      // Walk the segments to the first start-of-frame marker (C0 to CF, but not DHT C4, JPG C8, DAC CC).
      for (let i = 2; i + 4 <= b.length; ) {
        if (b[i] !== 0xff) return undefined;
        const marker = b[i + 1]!;
        if (marker === 0xff) { i++; continue; }
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return size(b.readUInt16BE(i + 7), b.readUInt16BE(i + 5));
        i += 2 + b.readUInt16BE(i + 2);
      }
      return undefined;
    }
    if (mime === "image/webp") {
      if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") return undefined;
      const kind = b.toString("latin1", 12, 16);
      if (kind === "VP8X") return size(b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
      if (kind === "VP8L") {
        const bits = b.readUInt32LE(21);
        return b[20] === 0x2f ? size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1) : undefined;
      }
      if (kind === "VP8 ") return b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a ? size(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff) : undefined;
    }
  } catch {
    // a header cut short reads past the end
  }
  return undefined;
}

/** Images stored by content hash: `<sha256>.<ext>` under one directory. */
export class AssetStore {
  constructor(private readonly dir: string) {}

  async put(bytes: Buffer, contentType: string): Promise<{ id: string; width: number; height: number }> {
    const ext = EXT[contentType];
    if (!ext) throw new AssetError(415, "only png, jpeg, gif and webp images are accepted");
    if (bytes.length > MAX_ASSET) throw new AssetError(413, "image is over 10 MB");
    const dims = imageSize(bytes, contentType);
    if (!dims) throw new AssetError(400, `not a valid ${contentType} image`);
    const id = createHash("sha256").update(bytes).digest("hex");
    const file = join(this.dir, `${id}.${ext}`);
    if (!(await stat(file).catch(() => null))) {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      await writeFile(`${file}.tmp`, bytes);
      await rename(`${file}.tmp`, file);
    }
    return { id, ...dims };
  }

  async get(id: string): Promise<{ path: string; contentType: string } | undefined> {
    if (!ID.test(id)) return undefined;
    for (const [ext, contentType] of Object.entries(TYPE)) {
      const path = join(this.dir, `${id}.${ext}`);
      if (await stat(path).catch(() => null)) return { path, contentType };
    }
    return undefined;
  }
}
