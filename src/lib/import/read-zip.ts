import { inflateRawSync } from "node:zlib";

const MAX_EXPANDED = 20 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;

/** Bounded, memory-only reader for single-volume, non-encrypted CSV exports. */
export function readCsvZip(input: Uint8Array): Map<string, string> {
  const zip = Buffer.from(input);
  const invalid = () => new Error("invalidArchive");
  if (zip.length < 22 || zip.length > MAX_ARCHIVE_BYTES) throw invalid();
  let end = zip.length - 22;
  while (end >= Math.max(0, zip.length - 65557)) {
    if (zip.readUInt32LE(end) === 0x06054b50 && end + 22 + zip.readUInt16LE(end + 20) === zip.length) break;
    end--;
  }
  if (end < Math.max(0, zip.length - 65557)) throw invalid();
  const count = zip.readUInt16LE(end + 10);
  const start = zip.readUInt32LE(end + 16);
  if (zip.readUInt16LE(end + 4) || zip.readUInt16LE(end + 6) || count !== zip.readUInt16LE(end + 8) || count > 1000 || start + zip.readUInt32LE(end + 12) !== end) throw invalid();
  const files = new Map<string, string>();
  let cursor = start;
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || zip.readUInt32LE(cursor) !== 0x02014b50) throw invalid();
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const compressed = zip.readUInt32LE(cursor + 20);
    const size = zip.readUInt32LE(cursor + 24);
    const nameSize = zip.readUInt16LE(cursor + 28);
    const next = cursor + 46 + nameSize + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
    const local = zip.readUInt32LE(cursor + 42);
    if (next > end || local + 30 > start || flags & 1 || ![0, 8].includes(method)) throw invalid();
    const nameBytes = zip.subarray(cursor + 46, cursor + 46 + nameSize);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    if (!name || name.includes("\\") || name.startsWith("/") || name.includes("\0") || name.split("/").includes("..") || files.has(name)) throw invalid();
    if (zip.readUInt32LE(local) !== 0x04034b50 || zip.readUInt16LE(local + 8) !== method || zip.readUInt16LE(local + 6) !== flags) throw invalid();
    const localNameSize = zip.readUInt16LE(local + 26);
    const dataStart = local + 30 + localNameSize + zip.readUInt16LE(local + 28);
    if (!zip.subarray(local + 30, local + 30 + localNameSize).equals(nameBytes) || dataStart + compressed > start) throw invalid();
    expanded += size;
    if (expanded > MAX_EXPANDED) throw new Error("archiveTooLarge");
    const content = zip.subarray(dataStart, dataStart + compressed);
    const bytes = method === 8 ? inflateRawSync(content, { maxOutputLength: Math.max(1, size) }) : content;
    if (bytes.length !== size) throw invalid();
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== zip.readUInt32LE(cursor + 16)) throw invalid();
    files.set(name, name.endsWith(".csv") ? new TextDecoder("utf-8", { fatal: true }).decode(bytes) : "");
    cursor = next;
  }
  if (cursor !== end) throw invalid();
  return files;
}
