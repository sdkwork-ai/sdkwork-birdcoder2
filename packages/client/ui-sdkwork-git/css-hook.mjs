import { register } from 'node:module'
// Global React for classic-JSX files that reference the bare identifier.
const { default: React } = await import('react')
globalThis.React = React
globalThis.react_default = React
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('.css') || specifier.includes('.module.css')) {
      return {
        url: 'data:text/javascript,' + encodeURIComponent('export default new Proxy({}, { get: () => "" })'),
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  }
`))
