import { createRoot } from 'react-dom/client'

import { App } from './App'
import './index.css'
import { resolveEnvironment } from './bootstrap/environment'
import { registerHostAdapters } from './bootstrap/hostAdapters'
import { createRuntime } from './bootstrap/runtime'

/** H5 root entry: composition only. */
const environment = resolveEnvironment()

createRuntime({ environment })
  .then((runtime) => {
    registerHostAdapters(runtime)
    const container = document.getElementById('root')
    if (!container) {
      throw new Error('missing #root mount point')
    }
    createRoot(container).render(<App runtime={runtime} />)
  })
  .catch((error: unknown) => {
    console.error('Bootstrap failed', error)
  })
