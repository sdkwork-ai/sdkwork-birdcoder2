/**
 * CSS module qualifier for the client bundle: the plugin's `.module.css`
 * sheets compile to hashed class maps through the shared tsdown client
 * pipeline (never through tsc), so the type side only needs the readonly
 * string-record shape the components index into.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
