/**
 * The automation template catalog's 16px-class line glyphs, one per template.
 * Follows the shared icon contract ({size, className}, color rides
 * currentColor).
 */
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** 每日 AI 新闻推送: news sheet with folded corner. */
export const NewsDigestIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.25 4.25h8l3.5 3.5v11a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1v-13.5a1 1 0 0 1 1-1Z" {...stroke} />
    <path d="M14.25 4.5V8h3.5M9 12h6.25M9 15.5h6.25" {...stroke} />
  </svg>
)

/** 每日 5 个英语单词: open vocabulary book. */
export const VocabBookIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 6.1C10.1 4.6 7.7 4.3 4.9 4.8v13.4c2.8-.5 5.2-.2 7.1 1.3 1.9-1.5 4.3-1.8 7.1-1.3V4.8c-2.8-.5-5.2-.2-7.1 1.3Z" {...stroke} />
    <path d="M12 6.1v13.4" {...stroke} />
  </svg>
)

/** 每日儿童睡前故事: crescent moon. */
export const BedtimeMoonIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.75 13.6A8.1 8.1 0 0 1 10.4 4.25 8.1 8.1 0 1 0 19.75 13.6Z" {...stroke} />
  </svg>
)

/** 每周工作周报: clipboard report. */
export const WeeklyReportIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4.9" y="4.9" width="14.2" height="15.1" rx="1.2" {...stroke} />
    <path d="M9 3.4h6v3H9zM9.4 12.2h5.2M9.4 15.7h5.2" {...stroke} />
  </svg>
)

/** 经典电影推荐: clapperboard. */
export const MoviesIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.75 9.4h14.5v8.35a1.25 1.25 0 0 1-1.25 1.25H6a1.25 1.25 0 0 1-1.25-1.25V9.4Z" {...stroke} />
    <path d="M4.75 9.4V6.15a1.25 1.25 0 0 1 1.25-1.25h12a1.25 1.25 0 0 1 1.25 1.25V9.4M8.9 5.3l-1.9 3.7M13.4 5.3l-1.9 3.7" {...stroke} />
  </svg>
)

/** 历史上的今天: history arrow around a clock dial. */
export const HistoryTodayIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.75 12a7.25 7.25 0 1 0 2.1-5.1L4.75 8.8" {...stroke} />
    <path d="M4.75 4.55v4.25H9" {...stroke} />
    <path d="M12 8.9v3.1l2.4 1.5" {...stroke} />
  </svg>
)

/** 每日一个为什么: lightbulb. */
export const WhyBulbIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3.6a5.4 5.4 0 0 1 3.1 9.8c-.62.45-.94 1.03-1 1.75h-4.2c-.06-.72-.38-1.3-1-1.75a5.4 5.4 0 0 1 3.1-9.8Z" {...stroke} />
    <path d="M10.1 18.1h3.8M10.9 20.4h2.2" {...stroke} />
  </svg>
)

/** 父母联系提醒: phone handset. */
export const ParentsCallIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.9 4.4 5.75 4.8a1.6 1.6 0 0 0-1.32 1.6c.34 5.9 5.27 10.83 11.17 11.17a1.6 1.6 0 0 0 1.6-1.32l.4-2.15-3.4-1.7-1.42 1.42a11.4 11.4 0 0 1-4.63-4.63L9.6 7.8 7.9 4.4Z" {...stroke} />
  </svg>
)

/** 体检预约提醒: medical clipboard with a cross. */
export const CheckupIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4.9" y="4.9" width="14.2" height="15.1" rx="1.2" {...stroke} />
    <path d="M9 3.4h6v3H9zM12 10.6v5M9.5 13.1h5" {...stroke} />
  </svg>
)

/** 面试准备提醒: reply bubble with dots. */
export const InterviewChatIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.75 6.5A1.25 1.25 0 0 1 6 5.25h12A1.25 1.25 0 0 1 19.25 6.5v7A1.25 1.25 0 0 1 18 14.75h-7.1L6.4 18.6v-3.85H6A1.25 1.25 0 0 1 4.75 13.5v-7Z" {...stroke} />
    <path d="M8.6 10h.01M12 10h.01M15.4 10h.01" strokeWidth="2.1" stroke="currentColor" strokeLinecap="round" />
  </svg>
)

/** 会议前准备: agenda checklist. */
export const MeetingAgendaIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.5 6.25h9.75M9.5 12h9.75M9.5 17.75h9.75" {...stroke} />
    <path d="M4.3 5.7l1.05 1.05 1.9-2M4.3 11.45l1.05 1.05 1.9-2M4.3 17.2l1.05 1.05 1.9-2" {...stroke} />
  </svg>
)

/** 可爱萌宠手机壁纸: picture frame with a motif. */
export const WallpaperImageIcon = ({ size = 24, className }: ModeIconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4.75" y="5.25" width="14.5" height="13.5" rx="1.2" {...stroke} />
    <circle cx="9" cy="9.6" r="1.3" {...stroke} />
    <path d="M4.75 16.4 9.6 12l3.4 3 2.4-2.2 3.85 3.6" {...stroke} />
  </svg>
)
