/**
 * Minimal, dependency-free ZIP writer using the STORE (uncompressed) method.
 * Produces a spec-valid .zip that any standard tool can open. We avoid pulling
 * in a compression dependency at launch — the export payloads are small JSON
 * documents and a stored archive is sufficient and deterministic.
 *
 * Layout: [local file header + data]* then [central directory]* then
 * [end-of-central-directory]. All multi-byte integers are little-endian.
 */

export interface ZipEntry {
  /** Path within the archive, e.g. "parent.json". */
  name: string;
  /** Raw file contents. */
  data: Buffer;
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** Standard CRC-32 (as used by the ZIP format). */
export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]!)! & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a complete ZIP archive (STORE method) from the given entries. */
export function createZip(entries: ZipEntry[]): Buffer {
  const fileChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header (signature 0x04034b50).
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method 0 = store
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // compressed size
    local.writeUInt32LE(size, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    fileChunks.push(local, nameBuf, entry.data);

    // Central directory record (signature 0x02014b50).
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // method
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset

    centralChunks.push(central, nameBuf);
    offset += local.length + nameBuf.length + entry.data.length;
  }

  const centralDir = Buffer.concat(centralChunks);
  const centralSize = centralDir.length;
  const centralOffset = offset;

  // End of central directory record (signature 0x06054b50).
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // central dir start disk
  end.writeUInt16LE(entries.length, 8); // entries on this disk
  end.writeUInt16LE(entries.length, 10); // total entries
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...fileChunks, centralDir, end]);
}

/** Read the file names listed in a ZIP's central directory (test helper). */
export function listZipEntryNames(zip: Buffer): string[] {
  const names: string[] = [];
  let i = 0;
  while (i <= zip.length - 4) {
    if (zip.readUInt32LE(i) === 0x02014b50) {
      const nameLen = zip.readUInt16LE(i + 28);
      const extraLen = zip.readUInt16LE(i + 30);
      const commentLen = zip.readUInt16LE(i + 32);
      const name = zip.toString("utf8", i + 46, i + 46 + nameLen);
      names.push(name);
      i += 46 + nameLen + extraLen + commentLen;
    } else {
      i += 1;
    }
  }
  return names;
}
