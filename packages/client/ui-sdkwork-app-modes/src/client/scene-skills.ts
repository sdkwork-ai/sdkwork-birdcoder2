/**
 * The per-scene built-in skill tags shown above the composer. Every skill is
 * a repository built-in under `.agents/skills/birdcoder-*` (the project
 * skills root the host's filesystem provider serves), so a tag click lands a
 * `/name` the host can resolve. Labels are locale-owned; the skill name is
 * the wire token.
 */
import type { HeroScene } from './hero-scene-store.ts'
import type { AppModeKey } from './locales.ts'

/** One skill tag of a scene: the built-in skill to invoke and its pill label. */
export interface SceneSkillTag {
  /** The built-in skill name (the `/name` literal the composer lands). */
  readonly skill: string
  /** The pill label's locale key under the `appMode` namespace. */
  readonly labelKey: AppModeKey
}

/** The staged scene's tag strip: skill names + label keys, in display order. */
export const SCENE_SKILLS: Record<HeroScene, readonly SceneSkillTag[]> = {
  code: [
    { skill: 'birdcoder-daily-dev', labelKey: 'heroTag.dailyDev' },
    { skill: 'birdcoder-web-dev', labelKey: 'heroTag.webDev' },
    { skill: 'birdcoder-html-web', labelKey: 'heroTag.htmlWeb' },
    { skill: 'birdcoder-react-web', labelKey: 'heroTag.reactWeb' },
    { skill: 'birdcoder-vue-web', labelKey: 'heroTag.vueWeb' },
    { skill: 'birdcoder-agent-app', labelKey: 'heroTag.agentApp' },
    { skill: 'birdcoder-skill-dev', labelKey: 'heroTag.skillDev' },
    { skill: 'birdcoder-cicd', labelKey: 'heroTag.cicd' },
    { skill: 'birdcoder-docs', labelKey: 'heroTag.docs' },
    { skill: 'birdcoder-miniprogram', labelKey: 'heroTag.miniprogram' },
    { skill: 'birdcoder-flutter-app', labelKey: 'heroTag.flutterApp' },
    { skill: 'birdcoder-uniapp', labelKey: 'heroTag.uniapp' },
    { skill: 'birdcoder-harmonyos', labelKey: 'heroTag.harmonyos' },
    { skill: 'birdcoder-ios-app', labelKey: 'heroTag.iosApp' },
    { skill: 'birdcoder-android-app', labelKey: 'heroTag.androidApp' },
    { skill: 'birdcoder-unity-app', labelKey: 'heroTag.unityApp' },
  ],
  video: [
    { skill: 'birdcoder-short-video', labelKey: 'heroTag.shortVideo' },
    { skill: 'birdcoder-video', labelKey: 'heroTag.video' },
    { skill: 'birdcoder-image', labelKey: 'heroTag.image' },
    { skill: 'birdcoder-music', labelKey: 'heroTag.music' },
    { skill: 'birdcoder-sound-effect', labelKey: 'heroTag.soundEffect' },
    { skill: 'birdcoder-tts', labelKey: 'heroTag.tts' },
    { skill: 'birdcoder-poster', labelKey: 'heroTag.poster' },
  ],
  document: [
    { skill: 'birdcoder-ppt-design', labelKey: 'heroTag.pptDesign' },
    { skill: 'birdcoder-visual-poster', labelKey: 'heroTag.visualPoster' },
    { skill: 'birdcoder-marketing-poster', labelKey: 'heroTag.marketingPoster' },
    { skill: 'birdcoder-meeting-notes', labelKey: 'heroTag.meetingNotes' },
  ],
}
