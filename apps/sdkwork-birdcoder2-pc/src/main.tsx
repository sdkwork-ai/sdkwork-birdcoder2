import { createRoot } from 'react-dom/client'

import { App } from './App'
import './index.css'
import { resolveEnvironment } from './bootstrap/environment'
import { createRuntime } from './bootstrap/runtime'

/**
 * Root entry. Owns composition only: environment selection, runtime creation,
 * route assembly, and shell mounting. No business logic, services, or mock data.
 */
const environment = resolveEnvironment()

createRuntime({ environment })
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
