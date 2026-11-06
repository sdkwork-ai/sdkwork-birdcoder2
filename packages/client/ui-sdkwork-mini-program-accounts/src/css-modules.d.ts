/** CSS Modules are typed as class-name maps by the client build preset. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
