/** `pullRequest` namespace dictionaries: the sidebar entry and page copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.pullRequest': 'Pull Request',
  'mode.pullRequest.label': 'Pull Request 模式',
  'page.placeholder': 'Pull Request 审阅界面建设中，接入 Git 仓库后即可在这里查看和审阅变更。',
} satisfies Record<string, string>

/** The pullRequest namespace key union. */
export type PullRequestKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.pullRequest': 'Pull Request',
  'mode.pullRequest.label': 'Pull Request mode',
  'page.placeholder': 'The Pull Request review surface is under construction; connect a Git repository to review changes here.',
} satisfies Record<PullRequestKey, string>
