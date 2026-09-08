/**
 * Public component exports of the plugin. Split from index.ts so the
 * registration module stays lean; extension authors import the menu
 * components from the package root.
 */
export { SessionRowMenu, WorkspaceRowMenu } from './RowMenus.tsx'
export { WorkspaceContextMenu } from './WorkspaceContextMenu.tsx'
