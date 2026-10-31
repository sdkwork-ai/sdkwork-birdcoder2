import { createRoot } from 'react-dom/client'

import { App } from './App'
import './index.css'
import { resolveEnvironment } from './bootstrap/environment'
import { createHostAdapter } from './bootstrap/hostAdapters'
import { createRuntime } from './bootstrap/runtime'

/**
 * Root entry. Owns composition only: environment selection, host adapter
 * creation, runtime creation, and shell mounting. No business logic, services,
 * or mock data (APP_PAD_ARCHITECTURE_SPEC.md §1 and §2).
 */
const environment = resolveEnvironment()

createRuntime({
  environment,
  host: createHostAdapter(environment.runtimeTarget),
})
  .then((runtime) => {
    const container = document.getElementById('root')
    if (!container) {
      throw new Error('missing #root mount point')
    }
    createRoot(container).render(<App runtime={runtime} />)
  })
  .catch((error: unknown) => {
    console.error('Bootstrap failed', error)
  })
