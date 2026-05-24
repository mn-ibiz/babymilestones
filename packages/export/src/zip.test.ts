import { describe, expect, it } from "vitest";
import { createZip, crc32, listZipEntryNames } from "./zip.js";

/** Parse a STORE-method ZIP member back out by reading its local file header. */
function readStoredMember(zip: Buffer, name: string): Buffer | null {
  let i = 0;
  while (i <= zip.length - 4) {
    if (zip.readUInt32LE(i) === 0x04034b50) {
      const size = zip.readUInt32LE(i + 18); // compressed size (== size for STORE)
      const nameLen = zip.readUInt16LE(i + 26);
      const extraLen = zip.readUInt16LE(i + 28);
      const entryName = zip.toString("utf8", i + 30, i + 30 + nameLen);
      const dataStart = i + 30 + nameLen + extraLen;
      if (entryName === name) return zip.subarray(dataStart, dataStart + size);
      i = dataStart + size;
    } else {
      i += 1;
    }
  }
  return null;
}

describe("zip writer", () => {
  it("computes the standard CRC-32 of known input", () => {
    // CRC-32 of "123456789" is the well-known check value 0xCBF43926.
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("lists every entry name in the central directory", () => {
    const zip = createZip([
      { name: "a.json", data: Buffer.from("{}") },
      { name: "nested/b.txt", data: Buffer.from("hello") },
    ]);
    expect(listZipEntryNames(zip)).toEqual(["a.json", "nested/b.txt"]);
  });

  it("stores member data so it reads back byte-for-byte", () => {
    const payload = JSON.stringify({ hello: "world", n: 42 });
    const zip = createZip([{ name: "data.json", data: Buffer.from(payload) }]);
    const member = readStoredMember(zip, "data.json");
    expect(member?.toString("utf8")).toBe(payload);
  });

  it("round-trips arbitrary bytes (incl. nulls/high bytes) unchanged", () => {
    const bytes = Buffer.from([0, 1, 2, 255, 128, 64, 10, 13]);
    const zip = createZip([{ name: "raw.bin", data: bytes }]);
    const member = readStoredMember(zip, "raw.bin");
    expect(member && Buffer.compare(member, bytes)).toBe(0);
  });

  it("writes a valid end-of-central-directory entry count", () => {
    const zip = createZip([
      { name: "a", data: Buffer.from("x") },
      { name: "b", data: Buffer.from("yy") },
      { name: "c", data: Buffer.from("zzz") },
    ]);
    // EOCD signature is the last 22 bytes; total-entries field is at offset 10.
    const eocd = zip.subarray(zip.length - 22);
    expect(eocd.readUInt32LE(0)).toBe(0x06054b50);
    expect(eocd.readUInt16LE(10)).toBe(3);
  });
});
