/** `course` namespace dictionaries: the rail entry and page copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.course': '课程',
  'mode.course.label': '课程模式',
  'page.placeholder': '课程中心建设中，敬请期待',
  'page.back': '点击左侧「代码」返回工作台',
  'auth.required.title': '登录后使用课程',
  'auth.required.detail': '课程中心需要登录后才能浏览课程、跟踪学习进度并参与直播。',
  'auth.required.action': '登录',
} satisfies Record<string, string>

/** The course namespace key union. */
export type CourseKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.course': 'Courses',
  'mode.course.label': 'Courses mode',
  'page.placeholder': 'The course center is under construction.',
  'page.back': 'Click Code in the rail to return to the workbench',
  'auth.required.title': 'Sign in to use Courses',
  'auth.required.detail': 'Sign in to browse courses, track progress, and join live sessions.',
  'auth.required.action': 'Sign in',
} satisfies Record<CourseKey, string>
