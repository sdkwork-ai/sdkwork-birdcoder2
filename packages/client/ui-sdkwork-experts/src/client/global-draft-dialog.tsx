import React from 'react'
import { createRoot } from 'react-dom/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { StoredProposal } from '../creation-tools.js'
import { CustomExpertEditor } from './custom-editor.js'
import { TeamEditor } from './team-editor.js'
import { TeamLocaleContext } from './team-locale.js'
import { unwrap } from './team-ui.js'
import { ZH_DIVISION } from '../names.js'
import { personaLocale, type AgencyLocale } from '../agency-locale.js'
import { acceptCatalog } from './catalog.js'
import type { CatalogSnapshot, CustomExpertInput } from '../expert-contract.js'
import type { TeamInput, TeamSnapshot } from '../team-contract.js'
import type { AgencyCatalogRemote, AgencyTeamsRemote } from './remote.js'

export interface GlobalDraftDialogOptions {
  proposal: StoredProposal
  remote: AgencyCatalogRemote & Partial<AgencyTeamsRemote>
  locale: AgencyLocale
  isCurrent: () => boolean
  revalidate: () => Promise<boolean>
  onClose?: () => void
  t: TranslateNS<'agency'>
  onSaved?: (catalog?: CatalogSnapshot) => void
}

export function openGlobalDraftEditor(options: GlobalDraftDialogOptions): () => void {
  const container = document.createElement('div')
  container.className = 'aag-global-draft-root'
  document.body.appendChild(container)
  const root = createRoot(container)

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    queueMicrotask(() => {
      root.unmount()
      container.remove()
      options.onClose?.()
    })
  }

  // A Host that predates team editing exposes the catalog only. A team draft
  // then has nothing to save against, so the dialog closes rather than editing
  // a roster it cannot commit.
  const getTeams = options.remote.getTeams?.bind(options.remote)
  const saveTeam = options.remote.saveTeam?.bind(options.remote)

  function ExpertHost() {
    const [catalog, setCatalog] = React.useState<CatalogSnapshot | null>(null)
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
      let active = true
      unwrap<CatalogSnapshot>(options.remote.getCatalog())
        .then(async (data) => {
          if (!active || cleaned) return
          const valid = options.isCurrent() && await options.revalidate()
          if (!active || cleaned) return
          if (!valid || !options.isCurrent()) {  cleanup(); return }
          setCatalog(data)
          setLoading(false)
        })
        .catch(() => {
          if (!active) return
          cleanup()
        })
      return () => { active = false }
    }, [])

    if (cleaned || !options.isCurrent() || loading || !catalog) return null

    return (
      <CustomExpertEditor
        expert={options.proposal.data as CustomExpertInput}
        enabled={true}
        revision={catalog.revision}
        divisions={[...new Set([...Object.keys(ZH_DIVISION), ...catalog.experts.map(e => e.division)])]}
        remote={options.remote}
        t={options.t}
        locale={personaLocale(options.locale)}
        divisionLocale={options.locale}
        onClose={cleanup}
        onSaved={(savedCatalog) => {
          acceptCatalog(options.remote, savedCatalog)
          options.onSaved?.(savedCatalog)
          cleanup()
        }}
      />
    )
  }

  function TeamHost({ getTeams, saveTeam }: {
    getTeams: AgencyTeamsRemote['getTeams']
    saveTeam: AgencyTeamsRemote['saveTeam']
  }) {
    const [data, setData] = React.useState<{ catalog: CatalogSnapshot; teams: TeamSnapshot } | null>(null)
    const [loading, setLoading] = React.useState(true)

    const fetchAll = React.useCallback(async (initial = false) => {
      const [catalogData, teamData] = await Promise.all([
        unwrap<CatalogSnapshot>(options.remote.getCatalog()),
        unwrap<TeamSnapshot>(getTeams()),
      ])
      const valid = !cleaned && options.isCurrent() && (!initial || await options.revalidate())
      if (!valid || cleaned || !options.isCurrent()) {
        cleanup()
        return teamData
      }
      setData({ catalog: catalogData, teams: teamData })
      setLoading(false)
      return teamData
    }, [getTeams])

    React.useEffect(() => {
      let active = true
      fetchAll(true).catch(() => {
        if (!active) return
        cleanup()
      })
      return () => { active = false }
    }, [fetchAll])

    if (cleaned || !options.isCurrent() || loading || !data) return null

    return (
      <TeamLocaleContext.Provider value={options.locale}>
        <TeamEditor
          initial={options.proposal.data as TeamInput}
          experts={data.catalog.experts}
          enabled={true}
          enabledExperts={data.teams.enabledExperts ?? []}
          close={cleanup}
          refresh={() => fetchAll()}
          save={async (value, enabled, revision) => {
            const rev = revision ?? data.teams.revision
            await unwrap(saveTeam(value, enabled, rev))
            options.onSaved?.()
            cleanup()
          }}
        />
      </TeamLocaleContext.Provider>
    )
  }

  if (options.proposal.kind !== 'expert') {
    if (getTeams === undefined || saveTeam === undefined) {
      // A Host that predates team editing exposes the catalog only, so a team
      // draft has nothing to save against and the dialog closes.
      cleanup()
      return cleanup
    }
    root.render(<TeamHost getTeams={getTeams} saveTeam={saveTeam} />)
    return cleanup
  }

  root.render(<ExpertHost />)
  return cleanup
}
