import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from './App'
import './index.css'
import { resolveEnvironment } from './bootstrap/environment'
import { registerHostAdapters } from './bootstrap/hostAdapters'
import { createRuntime } from './bootstrap/runtime'

/**
 * H5 root entry: composition only.
 *
 * Order is load-bearing. Environment first, then the runtime (token manager →
 * transport → IAM → route registry), then the host adapters — because binding
 * them later would let a component read the container before the composition
 * root has decided what the platform is.
 */
const environment = resolveEnvironment()

createRuntime({ environment })
  .then((runtime) => {
    registerHostAdapters(runtime)
    const container = document.getElementById('root')
    if (!container) {
      throw new Error('missing #root mount point')
    }
    createRoot(container).render(
      <BrowserRouter>
        <App runtime={runtime} />
      </BrowserRouter>,
    )
  })
  .catch((error: unknown) => {
    console.error('Bootstrap failed', error)
  })
