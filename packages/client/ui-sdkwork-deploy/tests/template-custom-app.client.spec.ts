// @vitest-environment jsdom
/** Custom-directory detection: project markers, identity fallbacks, manual type vocabulary. */
import { describe, expect, it } from 'vitest'
import {
  CustomTemplateDirectoryError,
  inspectCustomTemplateApp,
  sanitizeCustomAppKey,
  type CustomTemplateAppPort,
} from '../src/client/templateCustomApp.ts'
import { TEMPLATE_APP_TYPE_OPTIONS, templateAppTypeOption } from '../src/client/templateAppTypes.ts'

const MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: { key: 'sdkwork-custom-h5', name: 'Custom H5', displayName: '自定义 H5', appType: 'APP_REACT' },
  runtime: { family: 'mobile', framework: 'react-capacitor' },
  publish: { platforms: ['H5'] },
})

/** Port over an in-memory file map. */
function port(files: Readonly<Record<string, string>>, truncated = false): CustomTemplateAppPort {
  const paths = Object.keys(files)
  return {
    listFiles: async () => ({
      files: paths.map(path => ({ path, size: files[path]?.length ?? 0 })),
      truncated,
    }),
    readFiles: async (_directory, requested) => requested
      .filter(path => files[path] !== undefined)
      .map(path => ({
        path,
        contentBase64: Buffer.from(files[path] ?? '', 'utf8').toString('base64'),
        bytes: files[path]?.length ?? 0,
      })),
  }
}

describe('inspectCustomTemplateApp', () => {
  it('detects a Flutter root with its declared platform folders', async () => {
    const inspection = await inspectCustomTemplateApp(port({
      'pubspec.yaml': 'name: demo_flutter\nversion: 1.4.2\ndescription: Demo Flutter app\n',
      'lib/main.dart': 'void main() {}',
      'android/app/build.gradle': 'plugins {}',
      'ios/Runner/Info.plist': '<plist/>',
      'web/index.html': '<html/>',
    }), '/work/demo-flutter')
    expect(inspection.candidate).toMatchObject({
      directory: '/work/demo-flutter',
      directoryName: 'demo-flutter',
      appKey: 'demo-flutter',
      name: 'demo_flutter',
      version: '1.4.2',
      description: 'Demo Flutter app',
      platforms: ['H5', 'ANDROID', 'IOS'],
      source: 'custom',
      appTypeId: 'flutter',
      typeSource: 'detected',
      manifestRaw: '',
    })
    expect(inspection.hasManifest).toBe(false)
    expect(inspection.signals).toContain('pubspec.yaml')
  })

  it('detects a React web root and derives the key from the scoped package name', async () => {
    const inspection = await inspectCustomTemplateApp(port({
      'package.json': JSON.stringify({
        name: '@acme/demo-web',
        version: '2.0.0',
        description: 'Acme web',
        dependencies: { react: '^19.0.0', vite: '^7.0.0' },
      }),
      'src/main.tsx': 'export {}',
      'index.html': '<div id="root"></div>',
    }), '/work/acme-web')
    expect(inspection.candidate).toMatchObject({
      appKey: 'demo-web',
      name: 'demo-web',
      version: '2.0.0',
      cardId: 'h5',
      platforms: ['H5'],
      appTypeId: 'h5',
      typeSource: 'detected',
    })
  })

  it('uses a governed manifest before any project-marker guess', async () => {
    const inspection = await inspectCustomTemplateApp(port({
      'agent.app.config.json': MANIFEST,
      'package.json': JSON.stringify({ name: 'ignored-name', version: '9.9.9' }),
      'pubspec.yaml': 'name: ignored_flutter\n',
    }), '/work/custom-h5')
    expect(inspection.hasManifest).toBe(true)
    expect(inspection.candidate).toMatchObject({
      appKey: 'sdkwork-custom-h5',
      name: '自定义 H5',
      version: '9.9.9',
      cardId: 'h5',
      appTypeId: 'h5',
      typeSource: 'manifest',
      source: 'custom',
    })
  })

  it('returns an untyped candidate when nothing conclusive is present', async () => {
    const inspection = await inspectCustomTemplateApp(port({
      'README.md': '# notes',
      'assets/logo.svg': '<svg/>',
    }), '/work/mystery')
    expect(inspection.candidate.appTypeId).toBeUndefined()
    expect(inspection.candidate.typeSource).toBe('none')
    expect(inspection.candidate.platforms).toEqual([])
    expect(inspection.candidate.name).toBe('mystery')
  })

  it('prefers Expo/React Native over the generic app.json mini-program marker', async () => {
    const inspection = await inspectCustomTemplateApp(port({
      'package.json': JSON.stringify({ name: 'expo-demo', dependencies: { expo: '~55.0.0' } }),
      'app.json': '{"expo":{}}',
      'App.js': 'export default function App() {}',
    }), '/work/expo')
    expect(inspection.candidate).toMatchObject({
      platforms: ['ANDROID', 'IOS'],
      appTypeId: 'mobile',
      typeSource: 'detected',
    })
    expect(inspection.candidate.cardId).toBeUndefined()
  })

  it('detects a mini-program project', async () => {
    const inspection = await inspectCustomTemplateApp(port({
      'project.config.json': '{}',
      'app.json': '{"pages":[]}',
      'pages/index/index.wxml': '<view/>',
    }), '/work/mini')
    expect(inspection.candidate).toMatchObject({
      cardId: 'mini-program',
      platforms: ['MINIPROGRAM'],
      appTypeId: 'mini-program',
    })
  })

  it('rejects an empty directory and an unreadable one', async () => {
    await expect(inspectCustomTemplateApp(port({}), '/work/empty')).rejects.toMatchObject({
      failure: 'empty',
    })
    await expect(inspectCustomTemplateApp({
      listFiles: async () => undefined,
      readFiles: async () => undefined,
    }, '/work/missing')).rejects.toBeInstanceOf(CustomTemplateDirectoryError)
  })

  it('marks a truncated host listing for the UI', async () => {
    const inspection = await inspectCustomTemplateApp(port({
      'package.json': JSON.stringify({ name: 'huge', dependencies: { react: '1' } }),
    }, true), '/work/huge')
    expect(inspection.truncated).toBe(true)
  })
})

describe('application type vocabulary', () => {
  it('exposes unique type ids including the manual mobile types', () => {
    const ids = TEMPLATE_APP_TYPE_OPTIONS.map(option => option.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(templateAppTypeOption('flutter')).toMatchObject({ platforms: ['ANDROID', 'IOS'] })
    expect(templateAppTypeOption('api-service')).toMatchObject({ cardId: 'api-service', platforms: [] })
  })

  it('sanitizes a custom key into lower kebab-case', () => {
    expect(sanitizeCustomAppKey('@Acme/Demo_App')).toBe('acme-demo-app')
    expect(sanitizeCustomAppKey('---')).toBe('app')
  })
})
