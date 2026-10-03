// @vitest-environment jsdom
/**
 * Image model settings page spec: the page renders the rows the store carries,
 * states every status the section can be in, and forwards each edit to the
 * injected face instead of writing the section itself.
 *
 * The two edit shapes are asserted separately on purpose: a switch is one
 * intent and commits immediately, while a text field stages in the row's draft
 * and commits on Save — including the credential rule that a save which did not
 * touch the key must keep the stored one (`undefined`, not the empty string).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ImageModelsSection, type ImageModelsSectionProps } from '../src/client/ImageModelsSection.tsx'
import {
  createImageModelsSectionStore, type ImageModelsSectionState, type ImageProviderRow,
} from '../src/client/image-models-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** Locale seat stand-in: the real English dictionary, so assertions read copy. */
const t = ((key: string) => (en as Record<string, string>)[key]) as ImageModelsSectionProps['t']

/** One official row and one relay row. */
const PROVIDERS: readonly ImageProviderRow[] = [
  {
    id: 'official-openai-global',
    label: 'OpenAI',
    kind: 'official',
    vendor: 'openai',
    protocol: 'openai_compatible',
    region: 'global',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: '',
    hasApiKey: true,
    enabled: false,
    models: [{
      id: 'gpt-image-2', displayName: 'GPT Image 2', catalogKey: 'openai/gpt-image-2',
      enabled: true, size: '', quality: '', count: 1,
    }],
  },
  {
    id: 'relay-1',
    label: '',
    kind: 'relay',
    vendor: '',
    protocol: 'openai_compatible',
    region: '',
    baseUrl: 'https://relay.example.com/v1',
    apiKeyEnv: 'RELAY_API_KEY',
    hasApiKey: false,
    enabled: true,
    models: [],
  },
]

/** The state every case starts from unless it says otherwise. */
function stateOf(overrides: Partial<ImageModelsSectionState> = {}): ImageModelsSectionState {
  return {
    status: 'ready',
    writable: true,
    saving: false,
    failed: false,
    filePath: '/home/user/.dsh/sdkwork/image-models.sdkwork.json',
    defaultProviderId: 'relay-1',
    writeSecrets: false,
    providers: PROVIDERS,
    ...overrides,
  }
}

/** Build the store-backed props the renderer would compose. */
function mount(overrides: Partial<ImageModelsSectionState> = {}) {
  const state = stateOf(overrides)
  // Real store instance — the sanctioned zero-machinery path for tests: the page
  // reads exactly what the apply world publishes through these actions.
  const store = createImageModelsSectionStore().create()
  store.actions.mirror({
    status: state.status,
    writable: state.writable,
    defaultProviderId: state.defaultProviderId,
    providers: state.providers,
  })
  store.actions.file(state.filePath)
  store.actions.writeSecrets(state.writeSecrets)
  if (state.saving) store.actions.writing()
  if (state.failed) store.actions.settled(false)
  const injected = {
    saveProvider: vi.fn(),
    setProviderEnabled: vi.fn(),
    removeProvider: vi.fn(),
    addRelay: vi.fn(),
    setDefaultProvider: vi.fn(),
    setWriteSecrets: vi.fn(),
  }
  // The shell composes the rest of the section runtime share (the framework's
  // standing seats, which this page never reads). The object asserts the one
  // contract it does fill rather than faking services the page never touches.
  const props = {
    // The shell-owned section affordance (SettingsSectionOwnerProps.close).
    close: vi.fn(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t,
    ...injected,
  }
  const view = render(<ImageModelsSection {...(props as ImageModelsSectionProps)} />)
  return { store, view, ...injected }
}

/** The card carrying one provider row. */
function cardOf(label: string): HTMLElement {
  const name = screen.getByText(label)
  const card = name.closest('li')
  if (card === null) throw new Error(`card not rendered: ${label}`)
  return card
}

/** Open one provider card's disclosure. */
function expand(label: string): HTMLElement {
  const card = cardOf(label)
  fireEvent.click(within(card).getByRole('button', { name: en['provider.expand'] }))
  return card
}

/** The labelled text input inside a card. */
function inputOf(scope: HTMLElement, label: string): HTMLElement {
  return within(scope).getByLabelText(label)
}

/** The labelled switch inside a scope. */
function switchOf(scope: HTMLElement, label: string): HTMLElement {
  return within(scope).getByRole('switch', { name: label })
}

describe('image models section', () => {
  it('states that the configuration is still loading', () => {
    mount({ status: 'loading' })

    expect(screen.getByText(en['state.loading'])).toBeDefined()
  })

  it('states that the section is unavailable in this deployment', () => {
    mount({ status: 'unavailable' })

    expect(screen.getByText(en['state.unavailable'])).toBeDefined()
  })

  it('names the projected file a skill reads', () => {
    mount()

    expect(screen.getByText('/home/user/.dsh/sdkwork/image-models.sdkwork.json')).toBeDefined()
  })

  it('renders each provider with its kind, reach, and default marker', () => {
    mount()

    const official = cardOf('OpenAI')
    expect(within(official).getByText(en['provider.kind.official'])).toBeDefined()
    expect(within(official).getByText('https://api.openai.com/v1')).toBeDefined()
    expect(within(official).queryByText(en['provider.default'])).toBeNull()

    const relay = cardOf('relay-1')
    expect(within(relay).getByText(en['provider.kind.relay'])).toBeDefined()
    expect(within(relay).getByText(en['provider.default'])).toBeDefined()
  })

  it('reports the read-only document and disables every control', () => {
    mount({ writable: false })

    expect(screen.getByText(en['state.readOnly'])).toBeDefined()
    expect((switchOf(cardOf('OpenAI'), en['provider.enable']) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: en['provider.addRelay'] }).hasAttribute('disabled')).toBe(true)
  })

  it('commits the provider enable switch immediately', () => {
    const { setProviderEnabled } = mount()

    fireEvent.click(switchOf(cardOf('OpenAI'), en['provider.enable']))

    expect(setProviderEnabled).toHaveBeenCalledWith('official-openai-global', true)
  })

  it('forwards set-default for a row that is not the default', () => {
    const { setDefaultProvider } = mount()

    fireEvent.click(within(cardOf('OpenAI')).getByRole('button', { name: en['provider.setDefault'] }))

    expect(setDefaultProvider).toHaveBeenCalledWith('official-openai-global')
  })

  it('forwards removal', () => {
    const { removeProvider } = mount()

    fireEvent.click(within(cardOf('relay-1')).getByRole('button', { name: en['provider.remove'] }))

    expect(removeProvider).toHaveBeenCalledWith('relay-1')
  })

  it('appends a relay row', () => {
    const { addRelay } = mount()

    fireEvent.click(screen.getByRole('button', { name: en['provider.addRelay'] }))

    expect(addRelay).toHaveBeenCalledTimes(1)
  })

  it('commits the projected-secrets switch', () => {
    const { setWriteSecrets } = mount()

    fireEvent.click(screen.getByRole('switch', { name: en['secrets.label'] }))

    expect(setWriteSecrets).toHaveBeenCalledWith(true)
  })

  it('states a save in flight', () => {
    mount({ saving: true })

    expect(screen.getByText(en['state.saving'])).toBeDefined()
  })

  it('states a save that did not land', () => {
    mount({ failed: true })

    expect(screen.getByText(en['state.failed'])).toBeDefined()
  })

  it('stages a text edit and submits it on save, keeping the stored key', () => {
    const { saveProvider } = mount()
    const card = expand('OpenAI')

    fireEvent.change(inputOf(card, en['field.baseUrl']), { target: { value: 'https://gateway.example.com/v1' } })
    fireEvent.click(within(card).getByRole('button', { name: en['provider.save'] }))

    expect(saveProvider).toHaveBeenCalledTimes(1)
    const submitted = saveProvider.mock.calls[0]?.[0] as {
      id: string
      baseUrl: string
      apiKey: string | undefined
      models: readonly { id: string }[]
    }
    expect(submitted.id).toBe('official-openai-global')
    expect(submitted.baseUrl).toBe('https://gateway.example.com/v1')
    // The page never receives the stored key, so an untouched field must not
    // clear it: `undefined` is what the writer reads as "keep the stored one".
    expect(submitted.apiKey).toBeUndefined()
    expect(submitted.models.map(model => model.id)).toEqual(['gpt-image-2'])
  })

  it('submits a typed key, and clears the stored one when the field is emptied on purpose', () => {
    const { saveProvider } = mount()
    const openai = expand('OpenAI')

    fireEvent.change(inputOf(openai, en['field.apiKey']), { target: { value: 'sk-typed' } })
    fireEvent.click(within(openai).getByRole('button', { name: en['provider.save'] }))
    expect((saveProvider.mock.calls[0]?.[0] as { apiKey: string | undefined }).apiKey).toBe('sk-typed')

    fireEvent.change(inputOf(openai, en['field.apiKey']), { target: { value: '' } })
    fireEvent.click(within(openai).getByRole('button', { name: en['provider.save'] }))
    expect((saveProvider.mock.calls[1]?.[0] as { apiKey: string | undefined }).apiKey).toBe('')
  })

  it('reports whether a credential is configured', () => {
    mount()

    expect(within(expand('OpenAI')).getByText(en['field.apiKey.stored'])).toBeDefined()
  })

  it('edits a model row, adds one, and drops an empty one on save', () => {
    const { saveProvider } = mount()
    const card = expand('OpenAI')

    fireEvent.change(inputOf(card, en['model.count']), { target: { value: '4' } })
    fireEvent.click(within(card).getByRole('button', { name: en['model.add'] }))
    // Two model rows now: the catalog row and the new empty one, which the
    // added row's own inputs address by being last.
    const ids = within(card).getAllByLabelText(en['model.id'])
    const added = ids.at(-1)
    if (added === undefined) throw new Error('added model row not rendered')
    fireEvent.change(added, { target: { value: 'flux-2' } })
    fireEvent.click(within(card).getByRole('button', { name: en['provider.save'] }))

    const submitted = saveProvider.mock.calls[0]?.[0] as { models: readonly { id: string; count: number }[] }
    expect(submitted.models.map(model => model.id)).toEqual(['gpt-image-2', 'flux-2'])
    expect(submitted.models[0]?.count).toBe(4)
  })

  it('removes a model row from the draft', () => {
    const { saveProvider } = mount()
    const card = expand('OpenAI')

    // The model row's own Remove, addressed through the row that carries the
    // model id — the card's Remove button reads the same.
    const modelRow = within(card).getAllByLabelText(en['model.id'])[0]?.closest('li')
    if (modelRow == null) throw new Error('model row not rendered')
    fireEvent.click(within(modelRow).getByRole('button', { name: en['model.remove'] }))
    fireEvent.click(within(card).getByRole('button', { name: en['provider.save'] }))

    expect((saveProvider.mock.calls[0]?.[0] as { models: readonly unknown[] }).models).toEqual([])
  })

  it('discards staged edits back to the durable row', () => {
    const { saveProvider } = mount()
    const card = expand('OpenAI')

    fireEvent.change(inputOf(card, en['field.baseUrl']), { target: { value: 'https://typo.example.com' } })
    fireEvent.click(within(card).getByRole('button', { name: en['provider.discard'] }))
    fireEvent.click(within(card).getByRole('button', { name: en['provider.save'] }))

    expect((saveProvider.mock.calls[0]?.[0] as { baseUrl: string }).baseUrl).toBe('https://api.openai.com/v1')
  })

  it('states an empty provider list instead of painting nothing', () => {
    mount({ providers: [] })

    expect(screen.getByText(en['provider.empty'])).toBeDefined()
  })
})
