const fs = require('fs');

/**
 * Creates a simple uncompressed ZIP buffer from a list of files.
 * @param {Array<{name: string, buffer: Buffer}>} files 
 * @returns {Buffer}
 */
function createZip(files) {
    const parts = [];
    let offset = 0;
    const centralDirectory = [];

    for (const file of files) {
        const nameBuf = Buffer.from(file.name, 'utf8');
        const data = file.buffer;

        // Local File Header
        const header = Buffer.alloc(30 + nameBuf.length);
        header.writeUInt32LE(0x04034b50, 0); // Signature
        header.writeUInt16LE(0x000A, 4); // Version needed
        header.writeUInt16LE(0, 6); // Flags
        header.writeUInt16LE(0, 8); // Compression method (0 = store)
        // Time/Date (minimal placeholder)
        header.writeUInt16LE(0, 10);
        header.writeUInt16LE(0, 12);
        header.writeUInt32LE(0, 14); // CRC32 (0 for now, or calc)
        header.writeUInt32LE(data.length, 18); // Compressed size
        header.writeUInt32LE(data.length, 22); // Uncompressed size
        header.writeUInt16LE(nameBuf.length, 26); // Filename length
        header.writeUInt16LE(0, 28); // Extra field length
        nameBuf.copy(header, 30);

        // CRC Calculation (crc32)
        const crc = crc32(data);
        header.writeUInt32LE(crc, 14);

        parts.push(header);
        parts.push(data);

        // Central Directory Record
        const cDir = Buffer.alloc(46 + nameBuf.length);
        cDir.writeUInt32LE(0x02014b50, 0); // Signature
        cDir.writeUInt16LE(0x000A, 4); // Version made by
        cDir.writeUInt16LE(0x000A, 6); // Version needed
        cDir.writeUInt16LE(0, 8); // Flags
        cDir.writeUInt16LE(0, 10); // Compression method
        cDir.writeUInt16LE(0, 12); // Time
        cDir.writeUInt16LE(0, 14); // Date
        cDir.writeUInt32LE(crc, 16); // CRC32
        cDir.writeUInt32LE(data.length, 20); // Compressed size
        cDir.writeUInt32LE(data.length, 24); // Uncompressed size
        cDir.writeUInt16LE(nameBuf.length, 28); // Filename length
        cDir.writeUInt16LE(0, 30); // Extra field length
        cDir.writeUInt16LE(0, 32); // Comment length
        cDir.writeUInt16LE(0, 34); // Disk start
        cDir.writeUInt16LE(0, 36); // Internal attrs
        cDir.writeUInt32LE(0, 38); // External attrs
        cDir.writeUInt32LE(offset, 42); // Offset of local header
        nameBuf.copy(cDir, 46);

        centralDirectory.push(cDir);

        offset += header.length + data.length;
    }

    const centralDirBuffer = Buffer.concat(centralDirectory);

    // End of Central Directory
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // Signature
    eocd.writeUInt16LE(0, 4); // Disk number
    eocd.writeUInt16LE(0, 6); // Disk w/ central dir
    eocd.writeUInt16LE(files.length, 8); // Entries on this disk
    eocd.writeUInt16LE(files.length, 10); // Total entries
    eocd.writeUInt32LE(centralDirBuffer.length, 12); // Size of central dir
    eocd.writeUInt32LE(offset, 16); // Offset of central dir
    eocd.writeUInt16LE(0, 20); // Comment length

    return Buffer.concat([...parts, centralDirBuffer, eocd]);
}

const crcTable = [];
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        if (c & 1) c = 0xedb88320 ^ (c >>> 1);
        else c = c >>> 1;
    }
    crcTable[n] = c;
}

function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
}

module.exports = createZip;
