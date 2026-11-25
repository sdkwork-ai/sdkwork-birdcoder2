/**
 * Custom-expert write errors, kept in a locale module so the message table is
 * owned as copy rather than embedded in the contract source.
 */
const messages = {
  invalid: ['请检查名称、简介、分类和提示词。', 'Check the name, description, category and prompt.'],
  duplicate: ['专家名称已被使用，请换一个名称。', 'This expert name is already in use. Choose another name.'],
  unavailable: ['所选专家不存在、已删除或名称冲突，请刷新后重新选择。', 'An expert is missing, deleted or has a name conflict. Refresh and choose again.'],
  missing: ['自定义专家不存在或已删除，请刷新后重试。', 'The custom expert is missing or deleted. Refresh and try again.'],
  readonly: ['内置或外部目录专家不可直接编辑，请复制为自定义专家。', 'Built-in and external experts are read-only. Create a custom copy instead.'],
  division: ['请选择有效的专家分类。', 'Choose a valid expert category.'],
  limit: ['自定义专家数量已达到上限（200 位），请先删除不再使用的专家。', 'The limit of 200 custom experts has been reached. Delete an unused expert first.'],
  conflict: ['专家配置已被其他窗口修改，请刷新后重试。', 'Expert settings were changed in another window. Refresh and try again.'],
} as const
export type CustomErrorKey = keyof typeof messages
export function customError(key: CustomErrorKey, locale: 'zh' | 'en'): Error {
  return new Error(messages[key][locale === 'en' ? 1 : 0])
}
