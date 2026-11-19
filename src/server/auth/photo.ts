// A student's own profile picture. The browser crops it to a square PNG; the server checks the size
// before decoding (so a crafted file can't make it allocate gigabytes), then decodes and re-encodes
// the pixels. Only the picture survives: no EXIF, GPS, comments or other hidden chunks.
import { PNG } from "pngjs";

export const PHOTO_SIZE = 256;
/** The largest upload accepted, in bytes (before base64). A 256×256 PNG is usually 30–150 kB. */
export const PHOTO_MAX_BYTES = 600_000;

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class PhotoError extends Error {}

/** Takes a data URL or base64 PNG and returns a clean 256×256 PNG. Throws PhotoError when it isn't one. */
export function cleanPhoto(input: string): Buffer {
  const b64 = input.startsWith("data:image/png;base64,") ? input.slice("data:image/png;base64,".length) : input;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new PhotoError("That picture couldn't be read.");
  const raw = Buffer.from(b64, "base64");
  if (raw.length > PHOTO_MAX_BYTES) throw new PhotoError("That picture is too big.");
  // PNG header: signature, then the IHDR chunk with width and height.
  if (raw.length < 33 || !raw.subarray(0, 8).equals(SIGNATURE) || raw.toString("latin1", 12, 16) !== "IHDR") {
    throw new PhotoError("Please use a PNG made by the app.");
  }
  const width = raw.readUInt32BE(16);
  const height = raw.readUInt32BE(20);
  if (width !== PHOTO_SIZE || height !== PHOTO_SIZE) throw new PhotoError(`The picture must be ${PHOTO_SIZE}×${PHOTO_SIZE}.`);
  let decoded: PNG;
  try {
    decoded = PNG.sync.read(raw);
  } catch {
    throw new PhotoError("That picture couldn't be read.");
  }
  const out = new PNG({ width: PHOTO_SIZE, height: PHOTO_SIZE });
  decoded.data.copy(out.data);
  return PNG.sync.write(out, { colorType: 6 });
}
