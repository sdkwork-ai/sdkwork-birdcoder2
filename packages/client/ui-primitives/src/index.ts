/**
 * Cordis-free React primitives styled only through `--dsw-*` tokens.
 */

export { StateDot } from './StateDot.tsx'
export type { StateDotState } from './StateDot.tsx'
export { DisclosureRow } from './DisclosureRow.tsx'
export type { DisclosureRowProps } from './DisclosureRow.tsx'
export { TextShimmer } from './TextShimmer.tsx'
export type { TextShimmerProps } from './TextShimmer.tsx'
export { Button } from './Button.tsx'
export type { ButtonVariant } from './Button.tsx'
export { Pill } from './Pill.tsx'
export { SegmentedTabs } from './SegmentedTabs.tsx'
export type { SegmentedTab } from './SegmentedTabs.tsx'
export { Tag } from './Tag.tsx'
export type { TagTone } from './Tag.tsx'
export { PathLabel } from './PathLabel.tsx'
export { Switch } from './Switch.tsx'
export { SegmentedControl } from './SegmentedControl.tsx'
export type { SegmentedControlOption } from './SegmentedControl.tsx'
export { Checkbox } from './Checkbox.tsx'
export { Input } from './Input.tsx'
export { Menu, MenuItemButton } from './Menu.tsx'
export type { MenuItemButtonProps, MenuEntry, MenuItem, MenuSeparator, MenuLabel } from './Menu.tsx'
// Fork-owned submenu menu: upstream `Menu`'s nested card is unreachable at
// speed and unclamped against the viewport, and fixes parked in it are reverted
// by the next upstream merge. Fork surfaces with submenus use this instead.
export { SubmenuMenu } from './SubmenuMenu.tsx'
export type { SubmenuMenuProps } from './SubmenuMenu.tsx'
export { isInsideRect, placeSubmenu, submenuCorridor, SUBMENU_GAP, SUBMENU_VIEWPORT_MARGIN } from './submenu-placement.ts'
export type {
  SubmenuPlacement, SubmenuPlacementOptions, SubmenuRect, SubmenuSide, SubmenuSize, SubmenuViewport,
} from './submenu-placement.ts'
export { useAnchoredMaxHeight } from './useAnchoredMaxHeight.ts'
export { useAnchoredPosition } from './useAnchoredPosition.ts'
export type { AnchoredPositionOptions } from './useAnchoredPosition.ts'
export { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer.ts'
export { HoverCard } from './HoverCard.tsx'
export { Modal } from './Modal.tsx'
export { OnboardingSurface } from './OnboardingSurface.tsx'
export { RiskConfirmation } from './RiskConfirmation.tsx'
export type { RiskConfirmationProps } from './RiskConfirmation.tsx'
export { ConnectionIndicator } from './ConnectionIndicator.tsx'
export type { ConnectionIndicatorState } from './ConnectionIndicator.tsx'
export { FishLogo, FISH_LOGO_PATH, FISH_LOGO_VIEWBOX } from './FishLogo.tsx'
// Fork-owned brand art: fork surfaces render BirdLogo and BirdWordmark, never the
// upstream fish or the upstream wordmark.
export { BirdLogo } from './BirdLogo.tsx'
export { BirdWordmark } from './BirdWordmark.tsx'
export { BrandWordmark } from './BrandWordmark.tsx'
export type { BrandWordmarkProps } from './BrandWordmark.tsx'
export {
  PermissionIconFullAccessMedium, PermissionIconFullAccessRegular,
  PermissionIconReadOnlyMedium, PermissionIconReadOnlyRegular,
  PermissionIconWorkspaceWriteMedium, PermissionIconWorkspaceWriteRegular,
} from './PermissionIcon.tsx'
export { ReferenceIconMedium, ReferenceIconRegular } from './ReferenceIcon.tsx'
export type { ReferenceIconKind, ReferenceIconProps } from './ReferenceIcon.tsx'
export { LinkIconMedium, LinkIconRegular, classifyLinkPath } from './LinkIcon.tsx'
export type { LinkIconKind, LinkIconProps } from './LinkIcon.tsx'
export { FileTypeIcon, classifyFileType, fileExtension } from './FileTypeIcon.tsx'
export type {
  CodeFileType, FileType, FileTypeIconProps, FileTypeKind, FileTypeProjectContext,
} from './FileTypeIcon.tsx'
export { projectUserText, type UserTextReferences } from './user-text.tsx'
export { Tooltip } from './Tooltip.tsx'
export type { TooltipSide } from './Tooltip.tsx'
export { Toast } from './Toast.tsx'
export { fileSizeText } from './file-size.ts'
export { writeClipboard } from './clipboard.ts'
export { SettingsForm } from './settings-form/SettingsForm.tsx'
export type { SettingsFormLabels, SettingsFormProps } from './settings-form/SettingsForm.tsx'
export { SettingsSecretField, SettingsValueField } from './settings-form/fields.tsx'
export type { SettingsFieldProps } from './settings-form/fields.tsx'
export { SettingsFormModel, settingsNumberField, settingsTextField } from './settings-form/form-model.ts'
export type {
  SettingsFieldSpec, SettingsFieldState, SettingsFieldWrite, SettingsFormActions, SettingsFormPathOp, SettingsFormScope,
  SettingsFormScopeSnapshot, SettingsFormShell, SettingsSecretSpec,
} from './settings-form/form-model.ts'
export { CODE_HIGHLIGHT_EXTENSIONS, languageForPath, useCodeHighlighter } from './code-highlighting.ts'
export type { CodeHighlighter, HighlightSpan } from './code-highlighting.ts'
export { relativeTime } from './relative-time.ts'
export { rankByName } from './rank-by-name.ts'
export { isDarwinDesktop } from './darwin-desktop.ts'
export type { RelativeTime, RelativeTimeUnit } from './relative-time.ts'
export { JsonTree } from './JsonTree.tsx'
export type { JsonTreeProps, JsonTreeLabels } from './JsonTree.tsx'
export { TerminalBlock, DEFAULT_TERMINAL_MAX_LINES } from './TerminalBlock.tsx'
export type { TerminalBlockProps, TerminalBlockLabels } from './TerminalBlock.tsx'
export { ReadBlock, DEFAULT_READ_MAX_LINES } from './ReadBlock.tsx'
export type { ReadBlockProps, ReadBlockLine, ReadBlockLabels } from './ReadBlock.tsx'
export { DiffBlock, DEFAULT_DIFF_MAX_LINES, diffTotals } from './DiffBlock.tsx'
export type { DiffBlockProps, DiffHunk, DiffBlockLabels } from './DiffBlock.tsx'
export { SearchBlock, DEFAULT_SEARCH_MAX_LINES } from './SearchBlock.tsx'
export type {
  SearchBlockProps, SearchMatchesBlockProps, SearchPathsBlockProps, SearchFileGroup, SearchBlockLineMatch,
  SearchBlockLabels,
} from './SearchBlock.tsx'
export { WebBlock } from './WebBlock.tsx'
export type {
  WebBlockProps, WebSearchBlockProps, WebFetchBlockProps, WebSourceView, WebBlockLabels,
} from './WebBlock.tsx'
export { CodeBlock } from './markdown/CodeBlock.tsx'
export type { CodeBlockProps } from './markdown/CodeBlock.tsx'
export { JsonBlock } from './markdown/JsonBlock.tsx'
export { MarkdownDelegateProvider } from './markdown/MarkdownDelegate.tsx'
export type { MarkdownDelegate, MarkdownDelegateProviderProps, MarkdownExternalLinkHandler } from './markdown/MarkdownDelegate.tsx'
export { MarkdownText } from './markdown/MarkdownText.tsx'
export type { MarkdownCodeLabels, MarkdownFileMentions, MarkdownLabels, MarkdownPathImages } from './markdown/MarkdownText.tsx'
export { extractMarkdownPlainText } from './markdown/plain-text.ts'
export type { MarkdownPlainTextMode, MarkdownPlainTextOptions } from './markdown/plain-text.ts'
export * from './icons/index.tsx'
export {
  PluginArtworkTerminal, PluginArtworkLoop, PluginArtworkSubagent, PluginArtworkSearch, PluginArtworkDefault,
} from './plugin-artwork.tsx'
