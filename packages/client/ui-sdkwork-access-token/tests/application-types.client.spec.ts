/**
 * Application-type detection and the profile-file paths of each format
 * (`APP_ACCESS_TOKEN_SPEC.md` §2), plus the Host-path helpers.
 */

import { describe, expect, it } from 'vitest'
import {
  APPLICATION_TYPES, applicationTypeById, inferApplicationTypeId, profileFilePath,
} from '../src/client/applicationTypes.ts'
import { basenameOf, isSdkworkProjectDirectory, joinHostPath } from '../src/client/paths.ts'

describe('the application-type table', () => {
  it('covers every profile-file format the token matrix serves', () => {
    expect(APPLICATION_TYPES.map(type => type.id)).toEqual([
      'vite', 'flutter', 'mini-program', 'harmony-native', 'json-runtime',
    ])
    expect(applicationTypeById('vite')?.format).toBe('dotenv')
    expect(applicationTypeById('flutter')?.format).toBe('json')
    expect(applicationTypeById('harmony-native')?.format).toBe('harmony-json')
    expect(applicationTypeById('missing' as never)).toBeUndefined()
  })

  it('resolves the committed profile file of each format', () => {
    const profileId = 'cloud.production'
    const root = '/work/sdkwork-im/apps/sdkwork-im-pc'
    expect(profileFilePath(root, applicationTypeById('vite')!, profileId))
      .toBe('/work/sdkwork-im/apps/sdkwork-im-pc/.env.cloud.production')
    expect(profileFilePath('/w/flutter', applicationTypeById('flutter')!, profileId))
      .toBe('/w/flutter/env/sdkwork.cloud.production.json')
    expect(profileFilePath('/w/mp', applicationTypeById('mini-program')!, profileId))
      .toBe('/w/mp/config/mini-program/runtime-env.cloud.production.json')
    expect(profileFilePath('/w/harmony', applicationTypeById('harmony-native')!, profileId))
      .toBe('/w/harmony/config/app/runtime-env.cloud.production.json')
    expect(profileFilePath('/w/native', applicationTypeById('json-runtime')!, profileId))
      .toBe('/w/native/config/app/runtime-env.cloud.production.json')
  })

  it('keeps the Windows separator of a Windows application root', () => {
    const root = 'D:\\sdkwork-space\\sdkwork-im\\apps\\sdkwork-im-pc'
    expect(profileFilePath(root, applicationTypeById('vite')!, 'standalone.development'))
      .toBe('D:\\sdkwork-space\\sdkwork-im\\apps\\sdkwork-im-pc\\.env.standalone.development')
    expect(profileFilePath(root, applicationTypeById('mini-program')!, 'standalone.development'))
      .toBe('D:\\sdkwork-space\\sdkwork-im\\apps\\sdkwork-im-pc\\config\\mini-program\\runtime-env.standalone.development.json')
  })
})

describe('inferApplicationTypeId', () => {
  it('follows the manifest app type and framework first', () => {
    expect(inferApplicationTypeId({ manifestAppType: 'APP_REACT' })).toBe('vite')
    expect(inferApplicationTypeId({ manifestAppType: 'APP_VUE' })).toBe('vite')
    expect(inferApplicationTypeId({ manifestFramework: 'react-tauri' })).toBe('vite')
    expect(inferApplicationTypeId({ manifestAppType: 'APP_FLUTTER' })).toBe('flutter')
    expect(inferApplicationTypeId({ manifestFramework: 'flutter' })).toBe('flutter')
    expect(inferApplicationTypeId({ manifestAppType: 'APP_HARMONY' })).toBe('harmony-native')
    expect(inferApplicationTypeId({ manifestFramework: 'harmony-native' })).toBe('harmony-native')
    expect(inferApplicationTypeId({ manifestFramework: 'weixin-mini-program' })).toBe('mini-program')
    expect(inferApplicationTypeId({ manifestAppType: 'APP_UNIAPP', manifestFamily: 'mini-program' }))
      .toBe('mini-program')
    expect(inferApplicationTypeId({ manifestAppType: 'APP_ANDROID' })).toBe('json-runtime')
    expect(inferApplicationTypeId({ manifestFramework: 'ios-native' })).toBe('json-runtime')
    expect(inferApplicationTypeId({ manifestAppType: 'APP_UNITY' })).toBe('json-runtime')
  })

  it('falls back to the root file markers when the manifest is silent', () => {
    expect(inferApplicationTypeId({ hasPubspec: true })).toBe('flutter')
    expect(inferApplicationTypeId({ hasMiniProgramProject: true })).toBe('mini-program')
    expect(inferApplicationTypeId({ hasHarmonyProject: true })).toBe('harmony-native')
    expect(inferApplicationTypeId({ hasNativeMobileProject: true })).toBe('json-runtime')
    expect(inferApplicationTypeId({ hasViteProject: true })).toBe('vite')
    expect(inferApplicationTypeId({})).toBe('vite')
  })

  it('keeps a uni-app H5 root on the Vite carrier', () => {
    expect(inferApplicationTypeId({ manifestAppType: 'APP_UNIAPP', manifestFramework: 'uni-app', manifestFamily: 'web' }))
      .toBe('vite')
  })
})

describe('Host-path helpers', () => {
  it('joins segments and collapses redundant separators', () => {
    expect(joinHostPath('/repo', 'apps', 'app')).toBe('/repo/apps/app')
    expect(joinHostPath('/repo/', '/apps/', 'app')).toBe('/repo/apps/app')
    expect(joinHostPath('D:\\repo', 'config\\app', 'runtime.json'))
      .toBe('D:\\repo\\config\\app\\runtime.json')
  })

  it('refuses a segment that escapes the application root', () => {
    expect(() => joinHostPath('/repo/app', '../escape')).toThrow(/escapes/u)
  })

  it('reads the base name and recognizes SDKWork project directories', () => {
    expect(basenameOf('/work/sdkwork-im')).toBe('sdkwork-im')
    expect(basenameOf('D:\\sdkwork-space\\sdkwork-birdcoder2\\')).toBe('sdkwork-birdcoder2')
    expect(isSdkworkProjectDirectory('/work/sdkwork-im')).toBe(true)
    expect(isSdkworkProjectDirectory('D:\\sdkwork-space\\SDKWork-IM')).toBe(true)
    expect(isSdkworkProjectDirectory('/work/other-app')).toBe(false)
    expect(isSdkworkProjectDirectory(undefined as unknown as string)).toBe(false)
  })
})
