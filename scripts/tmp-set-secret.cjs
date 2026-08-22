/* Set the NPM_TOKEN Actions secret from the local npm auth token (no echo). */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const gh = (args, opts = {}) => execFileSync('gh', args, { encoding: 'utf8', ...opts })

const npmrc = fs.readFileSync(path.join(os.homedir(), '.npmrc'), 'utf8')
const match = npmrc.match(/_authToken=(\S+)/)
if (!match) { console.error('no npm token found'); process.exit(1) }
const token = match[1]

const keyJson = JSON.parse(gh(['api', '--method', 'POST', 'repos/sdkwork-ai/sdkwork-birdcoder2/actions/secrets/public-key']))
const publicKey = Buffer.from(keyJson.key, 'base64')
const encrypted = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(token)).toString('base64')

const body = JSON.stringify({ encrypted_value: encrypted, key_id: keyJson.key_id })
const out = execFileSync('gh', ['api', '-X', 'PUT', 'repos/sdkwork-ai/sdkwork-birdcoder2/actions/secrets/NPM_TOKEN', '-f', `encrypted_value=${encrypted}`, '-f', `key_id=${keyJson.key_id}`], { encoding: 'utf8' })
console.log('secret set:', out.trim() || '(ok)')
