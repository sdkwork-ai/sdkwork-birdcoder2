/**
 * The relationship kinds this format defines on top of the shared suffixes.
 *
 * A presentation reaches its slides, layouts, masters, and notes through these;
 * the theme and image suffixes it also uses belong to the shared OOXML set.
 */
export const REL_SLIDE = '/relationships/slide'
/** Relationship type suffix ending a slide-layout reference. */
export const REL_SLIDE_LAYOUT = '/relationships/slideLayout'
/** Relationship type suffix ending a slide-master reference. */
export const REL_SLIDE_MASTER = '/relationships/slideMaster'
/** Relationship type suffix ending a notes-slide reference. */
export const REL_NOTES_SLIDE = '/relationships/notesSlide'
/** Relationship type suffix ending the table-styles part reference. */
export const REL_TABLE_STYLES = '/relationships/tableStyles'
