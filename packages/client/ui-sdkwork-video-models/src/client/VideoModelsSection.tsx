/**
 * The video model settings page.
 *
 * A section, not a dialog, because that is the shape the settings shell has:
 * contributing one `settings.section` puts a row in the nav rail and a page in
 * the content column, and the shell keeps zero knowledge of what a provider is.
 *
 * Reading order matches the work. The header states what the page configures
 * and where the skill-facing file lives, because the file is the reason the
 * page exists outside this process. Then one card per provider, in section
 * order: the identity and reach of a connection first (name, kind, base URL,
 * default badge, enable switch), its editable fields and models behind the
 * disclosure, because a reader scanning for "which provider is on" should not
 * scroll through model rows to find out.
 *
 * Two shapes of edit, and the difference is deliberate. Switches — enable a
 * provider, enable a model, ask for audio, set the default, write keys into the
 * file — commit on the spot, because each is one unambiguous intent that a save
 * button would only add a step to. Text fields stage in the row's own draft and
 * commit on Save, because a base URL or an API key is typed, corrected, and
 * compared before it means anything; a write per keystroke would also be a
 * settings commit per keystroke.
 *
 * The page renders the durable value, never its own optimism: a write that the
 * Host refuses leaves the row as stored and the page says so.
 */

import { useState, type ReactNode } from 'react'
import { Button, Input, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the settings.section slot declaration this component is mounted from.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SdkworkVideoProviderKind } from '../video-models-settings.ts'
import { createVideoModelsSectionStore, type VideoProviderRow } from './video-models-store.ts'
import type { VideoModelsKey } from './locales.ts'
import css from './VideoModelsSection.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The video model configuration page. */
    sdkworkVideoModels: VideoModelsKey
  }
}

/** One model row as the page submits it. */
export interface VideoModelInput {
  /** Model id as the provider expects it on the wire. */
  id: string
  /** Name the page shows. */
  displayName: string
  /** sdkwork-models catalog key, empty for a hand-added model. */
  catalogKey: string
  /** Whether a generation call may select this model. */
  enabled: boolean
  /** `text_to_video`, `image_to_video`, or `reference_to_video`; empty follows the provider's own default. */
  generationMode: string
  /** Default resolution; empty follows the provider's own default. */
  resolution: string
  /** Default aspect ratio; empty follows the provider's own default. */
  aspectRatio: string
  /** Default clip length in seconds; `0` follows the provider's own default. */
  durationSeconds: number
  /** Whether the generated clip carries audio. */
  outputAudio: boolean
}

/** One provider row as the page submits it. */
export interface VideoProviderInput {
  /** Stable local id. */
  id: string
  /** Display name of the connection. */
  label: string
  /** Official vendor root or relay station. */
  kind: SdkworkVideoProviderKind
  /** sdkwork-models vendor code, empty for a relay. */
  vendor: string
  /** Protocol code the base URL speaks. */
  protocol: string
  /** sdkwork-models region code. */
  region: string
  /** API root every call is issued against. */
  baseUrl: string
  /** Environment variable carrying the credential, empty when none is named. */
  apiKeyEnv: string
  /** Literal key to store; `undefined` keeps the stored one, `''` clears it. */
  apiKey: string | undefined
  /** Whether generation may use this provider. */
  enabled: boolean
  /** Models this provider offers. */
  models: readonly VideoModelInput[]
}

/** Registration-side business face: every write the page performs. */
export interface VideoModelsSectionInjected {
  /**
   * Write one provider row, replacing the row with the same id or appending it.
   * @param provider - the row to store.
   */
  saveProvider: (provider: VideoProviderInput) => void
  /**
   * Write one provider's enable switch.
   * @param id - the provider row's id.
   * @param enabled - whether generation may use it.
   */
  setProviderEnabled: (id: string, enabled: boolean) => void
  /**
   * Remove one provider row.
   * @param id - the provider row's id.
   */
  removeProvider: (id: string) => void
  /** Append an empty relay row. */
  addRelay: () => void
  /**
   * Select the provider a call uses when it names none.
   * @param id - the provider row's id.
   */
  setDefaultProvider: (id: string) => void
  /**
   * Write whether the projected document carries literal API keys.
   * @param enabled - whether keys are written into the file.
   */
  setWriteSecrets: (enabled: boolean) => void
}

/** Full component props: section runtime share + store share + injected face + locale seat. */
export type VideoModelsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsStore<ReturnType<typeof createVideoModelsSectionStore>>
  & InjectFace<VideoModelsSectionInjected>
  & PropsLocale<'sdkworkVideoModels'>

/** The locale seat's translate function. */
type VideoModelsTranslate = PropsLocale<'sdkworkVideoModels'>['t']

/** One provider row's staged text, before Save. */
interface ProviderDraft {
  label: string
  baseUrl: string
  apiKeyEnv: string
  /** `undefined` keeps the stored key; the empty string clears it. */
  apiKey: string | undefined
  vendor: string
  protocol: string
  region: string
  models: ModelDraft[]
}

/** One model row's staged text, before Save. */
interface ModelDraft {
  id: string
  displayName: string
  catalogKey: string
  enabled: boolean
  generationMode: string
  resolution: string
  aspectRatio: string
  durationSeconds: string
  outputAudio: boolean
}

/**
 * The name a row reads as: its label, or its id when the user has not named it
 * yet. An unnamed row must still be distinguishable from its siblings.
 * @param row - the provider row.
 * @returns the display label.
 */
function providerLabel(row: VideoProviderRow): string {
  return row.label === '' ? row.id : row.label
}

/**
 * Stage one provider row into an editable draft.
 * @param row - the durable row.
 * @returns the draft the row's card edits.
 */
function draftOf(row: VideoProviderRow): ProviderDraft {
  return {
    label: row.label,
    baseUrl: row.baseUrl,
    apiKeyEnv: row.apiKeyEnv,
    apiKey: undefined,
    vendor: row.vendor,
    protocol: row.protocol,
    region: row.region,
    models: row.models.map(model => ({
      id: model.id,
      displayName: model.displayName,
      catalogKey: model.catalogKey,
      enabled: model.enabled,
      generationMode: model.generationMode,
      resolution: model.resolution,
      aspectRatio: model.aspectRatio,
      durationSeconds: String(model.durationSeconds),
      outputAudio: model.outputAudio,
    })),
  }
}

/**
 * Read one model row's clip length, tolerating anything a text field can hold.
 * @param draft - the model row's staged text.
 * @returns the duration to store, never negative.
 */
function durationOf(draft: ModelDraft): number {
  const parsed = Number.parseInt(draft.durationSeconds, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/** One model row's inputs. */
interface ModelRowViewProps {
  draft: ModelDraft
  disabled: boolean
  writable: boolean
  t: VideoModelsTranslate
  onChange: (next: ModelDraft) => void
  onRemove: () => void
}

/**
 * Render one model row: the enable switch, the wire id, and this modality's
 * parameters.
 * @param props - the row's inputs.
 * @returns the row element tree.
 */
function ModelRowView({ draft, disabled, writable, t, onChange, onRemove }: ModelRowViewProps): ReactNode {
  const field = (key: keyof ModelDraft, label: string, value: string, placeholder?: string): ReactNode => (
    <label className={css.field}>
      <span className={css.fieldLabel}>{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        disabled={disabled || !writable}
        aria-label={label}
        onChange={(event) => { onChange({ ...draft, [key]: event.target.value }) }}
      />
    </label>
  )
  return (
    <li className={css.modelRow}>
      <Switch
        checked={draft.enabled}
        disabled={disabled || !writable}
        label={t('model.enable')}
        title={t('model.enable')}
        onChange={(next) => { onChange({ ...draft, enabled: next }) }}
      />
      <div className={css.modelFields}>
        {field('id', t('model.id'), draft.id)}
        {field('displayName', t('model.displayName'), draft.displayName)}
        {field('generationMode', t('model.generationMode'), draft.generationMode, 'text_to_video')}
        {field('resolution', t('model.resolution'), draft.resolution, '720p')}
        {field('aspectRatio', t('model.aspectRatio'), draft.aspectRatio, '16:9')}
        {field('durationSeconds', t('model.durationSeconds'), draft.durationSeconds, '0')}
      </div>
      <Switch
        checked={draft.outputAudio}
        disabled={disabled || !writable}
        label={t('model.outputAudio')}
        title={t('model.outputAudio')}
        onChange={(next) => { onChange({ ...draft, outputAudio: next }) }}
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled || !writable}
        onClick={onRemove}
      >
        {t('model.remove')}
      </Button>
    </li>
  )
}

/** One provider card's inputs. */
interface ProviderCardProps {
  row: VideoProviderRow
  /** Whether this row is the section's default. */
  isDefault: boolean
  /** Whether any write is in flight. */
  saving: boolean
  writable: boolean
  t: VideoModelsTranslate
  onSave: (provider: VideoProviderInput) => void
  onToggle: (enabled: boolean) => void
  onRemove: () => void
  onSetDefault: () => void
}

/**
 * Render one provider card: the identity row, and the editable fields and model
 * rows behind its disclosure. The draft is component-local for the same reason
 * the disclosure is: which row is open and what has been typed into it are
 * reading gestures, and the durable value is what the card renders when it is
 * not being edited.
 * @param props - the card's inputs.
 * @returns the card element tree.
 */
function ProviderCard({
  row, isDefault, saving, writable, t, onSave, onToggle, onRemove, onSetDefault,
}: ProviderCardProps): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState<ProviderDraft>(() => draftOf(row))
  const disabled = saving || !writable

  const commit = (): void => {
    onSave({
      id: row.id,
      label: draft.label.trim(),
      kind: row.kind,
      vendor: draft.vendor.trim(),
      protocol: draft.protocol.trim(),
      region: draft.region.trim(),
      baseUrl: draft.baseUrl.trim(),
      apiKeyEnv: draft.apiKeyEnv.trim(),
      apiKey: draft.apiKey,
      enabled: row.enabled,
      models: draft.models.map(model => ({
        id: model.id.trim(),
        displayName: model.displayName.trim(),
        catalogKey: model.catalogKey,
        enabled: model.enabled,
        generationMode: model.generationMode.trim(),
        resolution: model.resolution.trim(),
        aspectRatio: model.aspectRatio.trim(),
        durationSeconds: durationOf(model),
        outputAudio: model.outputAudio,
      })).filter(model => model.id !== ''),
    })
  }

  const text = (key: 'label' | 'baseUrl' | 'apiKeyEnv' | 'vendor' | 'protocol' | 'region', label: string, value: string, placeholder?: string): ReactNode => (
    <label className={css.field}>
      <span className={css.fieldLabel}>{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => { setDraft({ ...draft, [key]: event.target.value }) }}
      />
    </label>
  )

  return (
    <li className={css.card}>
      <div className={css.cardHead}>
        <Switch
          checked={row.enabled}
          disabled={disabled}
          label={t('provider.enable')}
          title={t('provider.enable')}
          onChange={onToggle}
        />
        <span className={css.cardIdentity}>
          <span className={css.cardName}>{providerLabel(row)}</span>
          <Tag tone={row.kind === 'official' ? 'info' : 'neutral'}>
            {t(row.kind === 'official' ? 'provider.kind.official' : 'provider.kind.relay')}
          </Tag>
          {isDefault && <Tag tone="success">{t('provider.default')}</Tag>}
        </span>
        <code className={css.cardUrl} title={row.baseUrl}>{row.baseUrl === '' ? '—' : row.baseUrl}</code>
        <span className={css.cardActions}>
          {!isDefault && (
            <Button variant="ghost" size="sm" disabled={disabled} onClick={onSetDefault}>
              {t('provider.setDefault')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            onClick={() => {
              // Re-seed from the durable row on open: a draft the Host refused
              // must not survive as if it were the stored value.
              if (!expanded) setDraft(draftOf(row))
              setExpanded(!expanded)
            }}
          >
            {t(expanded ? 'provider.collapse' : 'provider.expand')}
          </Button>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={onRemove}>
            {t('provider.remove')}
          </Button>
        </span>
      </div>
      {expanded && (
        <div className={css.cardBody}>
          <div className={css.fields}>
            {text('label', t('field.label'), draft.label)}
            {text('baseUrl', t('field.baseUrl'), draft.baseUrl, 'https://api.openai.com/v1')}
            {text('apiKeyEnv', t('field.apiKeyEnv'), draft.apiKeyEnv, 'OPENAI_API_KEY')}
            {text('vendor', t('field.vendor'), draft.vendor, 'openai')}
            {text('protocol', t('field.protocol'), draft.protocol, 'openai_compatible')}
            {text('region', t('field.region'), draft.region, 'global')}
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('field.apiKey')}</span>
              <Input
                type="password"
                value={draft.apiKey ?? ''}
                placeholder={row.hasApiKey ? '••••••••' : ''}
                disabled={disabled}
                aria-label={t('field.apiKey')}
                autoComplete="off"
                onChange={(event) => { setDraft({ ...draft, apiKey: event.target.value }) }}
              />
              <span className={css.fieldHint}>
                {t(row.hasApiKey ? 'field.apiKey.stored' : 'field.apiKey.none')}
              </span>
            </label>
          </div>
          <div className={css.modelsHead}>
            <span className={css.fieldLabel}>{t('provider.models')}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setDraft({
                  ...draft,
                  models: [...draft.models, {
                    id: '',
                    displayName: '',
                    catalogKey: '',
                    enabled: true,
                    generationMode: '',
                    resolution: '',
                    aspectRatio: '',
                    durationSeconds: '0',
                    outputAudio: false,
                  }],
                })
              }}
            >
              {t('model.add')}
            </Button>
          </div>
          {draft.models.length === 0
            ? <p className={css.hint}>{t('provider.models.empty')}</p>
            : (
              <ul className={css.modelRows}>
                {draft.models.map((model, index) => (
                  <ModelRowView
                    // Index-keyed on purpose: rows are positional drafts until Save,
                    // and two unsaved new rows share the empty id.
                    key={String(index)}
                    draft={model}
                    disabled={saving}
                    writable={writable}
                    t={t}
                    onChange={(next) => {
                      const models = [...draft.models]
                      models[index] = next
                      setDraft({ ...draft, models })
                    }}
                    onRemove={() => {
                      setDraft({ ...draft, models: draft.models.filter((_row, at) => at !== index) })
                    }}
                  />
                ))}
              </ul>
            )}
          <div className={css.cardFoot}>
            <Button variant="primary" size="sm" disabled={disabled} onClick={commit}>
              {t('provider.save')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => { setDraft(draftOf(row)) }}
            >
              {t('provider.discard')}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * Render the video model configuration page.
 * @param props - composed slot props.
 * @returns the page element tree.
 */
export function VideoModelsSection(props: VideoModelsSectionProps): ReactNode {
  const {
    useStore, t, addRelay, saveProvider, setProviderEnabled, removeProvider, setDefaultProvider, setWriteSecrets,
  } = props
  const status = useStore(s => s.status)
  const writable = useStore(s => s.writable)
  const saving = useStore(s => s.saving)
  const failed = useStore(s => s.failed)
  const filePath = useStore(s => s.filePath)
  const defaultProviderId = useStore(s => s.defaultProviderId)
  const providers = useStore(s => s.providers)
  const writeSecrets = useStore(s => s.writeSecrets)

  if (status === 'loading') return <p className={css.state}>{t('state.loading')}</p>
  if (status === 'unavailable') return <p className={css.state}>{t('state.unavailable')}</p>

  return (
    <section className={css.section}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      <div className={css.fileRow}>
        <span className={css.fieldLabel}>{t('file.label')}</span>
        <code className={css.filePath} title={filePath}>{filePath === '' ? '—' : filePath}</code>
        <span className={css.fieldHint}>{t('file.hint')}</span>
      </div>
      <div className={css.secretsRow}>
        <Switch
          checked={writeSecrets}
          disabled={!writable}
          label={t('secrets.label')}
          onChange={setWriteSecrets}
        />
        <span className={css.fieldHint}>{t('secrets.hint')}</span>
      </div>
      {!writable && <p className={css.notice}>{t('state.readOnly')}</p>}
      {saving && <p className={css.hint}>{t('state.saving')}</p>}
      {failed && <p className={css.notice}>{t('state.failed')}</p>}
      <div className={css.listHead}>
        <span className={css.fieldLabel}>{t('provider.section')}</span>
        <Button variant="outline" size="sm" disabled={!writable || saving} onClick={addRelay}>
          {t('provider.addRelay')}
        </Button>
      </div>
      {providers.length === 0
        ? <p className={css.hint}>{t('provider.empty')}</p>
        : (
          <ul className={css.cards}>
            {providers.map(row => (
              <ProviderCard
                key={row.id}
                row={row}
                isDefault={row.id === defaultProviderId}
                saving={saving}
                writable={writable}
                t={t}
                onSave={saveProvider}
                onToggle={(enabled) => { setProviderEnabled(row.id, enabled) }}
                onRemove={() => { removeProvider(row.id) }}
                onSetDefault={() => { setDefaultProvider(row.id) }}
              />
            ))}
          </ul>
        )}
    </section>
  )
}
