/**
 * CRC-32 (IEEE 802.3), the checksum every ZIP entry carries.
 */

/** CRC-32 lookup table, built once. */
const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 0
    }
    table[index] = value >>> 0
  }
  return table
})()

/**
 * Compute the CRC-32 of a byte range.
 * @param data - the bytes to checksum.
 * @returns the unsigned checksum.
 */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xffffffff) >>> 0
}
