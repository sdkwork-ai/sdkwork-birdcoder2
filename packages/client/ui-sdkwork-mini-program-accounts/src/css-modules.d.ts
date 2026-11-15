/**
 * Stylesheet module qualifiers for the client bundle: `.module.css` sheets
 * compile to hashed class maps and plain `.css` sheets (the Tailwind source
 * sheet) inject as tagged styles, both through the shared tsdown client
 * pipeline (never through tsc), so the type side only needs the module shapes.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
declare module '*.css'
