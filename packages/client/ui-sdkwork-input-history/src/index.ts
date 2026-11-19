/**
 * Input history plugin, node half. Pure browser UI plugin: the empty apply
 * exists so the package participates in the Host cordis.yml / Loader; the
 * browser half ships through exports["./client"], discovered from the
 * package.json dsh.client declaration.
 */

/** Host plugin body — recording and recall live entirely in the browser. */
export function apply(): void {}
