/**
 * FORK DIVERGENCE: Host-only declaration of the `sessions` service.
 *
 * `packages/core/session` is referenced by both compiler faces. Its emitted
 * `lib/types/index.d.ts` used to declare `Context.sessions: SessionStore`; a
 * Client program loads that output as a project-reference root before
 * `@deepseek-ai/dsh-api-session-controller/client` declares `ISessions`, and
 * `skipLibCheck` hides the TS2717 collision, so `SessionStore` silently won in
 * every Client program. The shared entry therefore no longer declares the key;
 * this type-root package restores it for Host programs only (the Client base
 * config overrides `types`) by naming a global alias published by the session
 * package itself. It deliberately imports nothing: importing the session
 * declaration graph here drags its `.ts` sources into every vendor project and
 * produces TS6059/TS6307 rootDir errors.
 */
export {}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions: DshSessionHostTypes.Store
  }
}
