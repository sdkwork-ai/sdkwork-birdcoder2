/**
 * Mini program app entry. Composition only: environment selection, runtime creation,
 * SDK client injection, IAM runtime wiring, host adapter registration.
 */
import { resolveEnvironment } from './bootstrap/environment'
import { registerHostAdapters } from './bootstrap/hostAdapters'
import { createRuntime } from './bootstrap/runtime'
import { registerRoutes } from './bootstrap/routes'

const environment = resolveEnvironment()
const runtime = createRuntime({ environment })

registerHostAdapters(runtime)
registerRoutes(runtime)

export default runtime
