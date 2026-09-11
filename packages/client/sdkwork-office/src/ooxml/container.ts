/**
 * Which container a file actually is.
 *
 * Office files reach a preview by extension, but the extension is a claim rather
 * than a fact: a `.doc` renamed to `.docx` still holds an OLE2 compound file,
 * and reporting it as a corrupt OOXML package tells the reader the wrong thing.
 * The container signature is the fact worth branching on.
 */

/** Length of the OLE2 compound-file signature, which is all detection needs. */
const OLE2_SIGNATURE_LENGTH = 8

/** The OLE2 compound-file signature, shared by every legacy binary Office format. */
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const

/**
 * Whether a file is an OLE2 compound document.
 *
 * Every legacy binary Office format — Word 97-2003, Excel 97-2003, PowerPoint
 * 97-2003, and the container Message and Project formats use — begins with this
 * signature and none of them is a ZIP package.
 * @param bytes - the complete file.
 * @returns true when the file is an OLE2 container.
 */
export function isOle2Container(bytes: Uint8Array): boolean {
  if (bytes.byteLength < OLE2_SIGNATURE_LENGTH) return false
  return OLE2_SIGNATURE.every((byte, index) => bytes[index] === byte)
}
