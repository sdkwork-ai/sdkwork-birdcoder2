/** Browser entry for the Web client. */
import { AppWebEntry } from '@deepseek-ai/dsh-client-web'
// The sdkwork Tailwind pipeline (utilities for the sdkwork-iam auth surfaces).
import './index.css'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')
void new AppWebEntry(el).run()
