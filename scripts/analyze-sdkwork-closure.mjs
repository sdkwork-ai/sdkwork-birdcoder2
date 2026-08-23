/**
 * Analyze the real `@sdkwork/*` import closure of this repo and report which
 * tsconfig.base.json path mappings it actually needs.
 *
 * Closure = the transitive closure of sources the client bundles compile:
 * every local .ts/.tsx/.mjs/.cjs/.js file (excluding build outputs), the `src`
 * trees of the sibling packages joined as workspace members in
 * pnpm-workspace.yaml, and — iteratively — the `src` tree of every package a
 * mapped `@sdkwork/*` specifier resolves into. Repos pinned in
 * sdkwork-sources.manifest.json but never reached through that graph — like
 * sdkwork-cloudrouter — are NOT part of the closure and must not drag
 * mappings in.
 *
 * Usage: node scripts/analyze-sdkwork-closure.mjs [--rewrite]
 * Without --rewrite: prints used specifiers, uncovered specifiers, and the
 * kept/dropped mapping keys. With --rewrite: rewrites the `@sdkwork/*` section
 * of tsconfig.base.json to exactly the covering keys (new keys for uncovered
 * member specifiers are generated from the member dirs), sorted and deduped.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const REWRITE = process.argv.includes('--rewrite')
const WORKSPACE_FILE = 'pnpm-workspace.yaml'
const TSCONFIG_FILE = 'tsconfig.base.json'
const SDKWORK_PREFIX = '@sdkwork/'
const EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.cjs', '.js'])

function readJsonc(path) {
  const source = readFileSync(path, 'utf8')
    .split('\n').map(line => line.replace(/\/\/.*$/u, '')).join('\n')
  return JSON.parse(source)
}

function loadDeclaredPaths() {
  const config = readJsonc(join(ROOT, TSCONFIG_FILE))
  return config.compilerOptions?.paths ?? {}
}

/** `@sdkwork/*` specifiers imported by one source file. */
function sdkworkSpecifiers(source) {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*["'](@sdkwork\/[^"']+)["']/gu)]
    .map(match => match[1])
    .filter((specifier) => specifier !== undefined)
    .filter((specifier, index, all) => all.indexOf(specifier) === index)
}

/** Walk a directory tree, yielding files whose extension is in the set. */
function walkFiles(dir, extensions, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'lib', 'coverage', '.turbo', 'vendor'].includes(entry.name)) continue
      walkFiles(path, extensions, out)
    } else if (extensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      out.push(path)
    }
  }
}

/** Workspace members declared in pnpm-workspace.yaml, with `packages/*` globs expanded. */
function workspaceMembers() {
  const source = readFileSync(join(ROOT, WORKSPACE_FILE), 'utf8')
  const members = []
  for (const line of source.split(/\r?\n/u)) {
    const match = /^\s*-\s*["'](\.\.\/[^"']+)["']\s*$/u.exec(line)
    if (match?.[1] === undefined) continue
    const dir = resolve(ROOT, match[1])
    if (match[1].endsWith('/*')) {
      let children
      try {
        children = readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const child of children) {
        if (child.isDirectory() && existsSync(join(dir, child.name, 'package.json'))) {
          members.push(join(dir, child.name))
        }
      }
    } else if (existsSync(join(dir, 'package.json'))) {
      members.push(dir)
    } else {
      console.warn(`[closure] workspace member has no package.json: ${match[1]}`)
    }
  }
  return members
}

/** Source root a tsconfig target resolves to (`.../src` for every @sdkwork mapping). */
function sourceRoot(target) {
  const match = /(^|\/)src(\/|$)/u.exec(target)
  if (match === null) return undefined
  return target.slice(0, match.index + match[1].length + 3)
}

/**
 * The transitive import closure: seed files plus, for every mapped specifier,
 * the package src tree the mapping points at, iterated to a fixpoint.
 * @returns `{ used, uncovered, covering }` — used specifiers, specifiers with
 * no mapping, and the declared keys that cover at least one used specifier.
 */
function closure(declared) {
  const wildcards = [...declared.keys()].filter(key => key.endsWith('/*'))
  const packageRootOf = (specifier) =>
    specifier.startsWith('@sdkwork/') ? specifier.split('/').slice(0, 2).join('/') : specifier
  const resolveSpecifier = (specifier) => {
    const target = declared.get(specifier)
    if (target !== undefined) return target[0]
    const wildcard = wildcards.find(key => specifier.startsWith(key.slice(0, -1)))
    if (wildcard !== undefined) return declared.get(wildcard)[0]
    return declared.get(packageRootOf(specifier))?.[0]
  }
  const used = new Set()
  const covering = new Set()
  const uncovered = []
  const scannedRoots = new Set()

  const scanSpecifiers = (specifiers) => {
    for (const specifier of specifiers) {
      if (used.has(specifier)) continue
      used.add(specifier)
      const target = resolveSpecifier(specifier)
      if (target === undefined) {
        uncovered.push(specifier)
        continue
      }
      covering.add(declared.has(specifier) ? specifier
        : wildcards.find(key => specifier.startsWith(key.slice(0, -1)))
          ?? packageRootOf(specifier))
      const root = sourceRoot(target)
      if (root === undefined || scannedRoots.has(root)) continue
      scannedRoots.add(root)
      const files = []
      walkFiles(root, EXTENSIONS, files)
      for (const file of files) {
        scanSpecifiers(sdkworkSpecifiers(readFileSync(file, 'utf8')))
      }
    }
  }

  const files = []
  walkFiles(ROOT, EXTENSIONS, files)
  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/')
    if (rel.startsWith('node_modules/') || rel.startsWith('vendor/')) continue
    scanSpecifiers(sdkworkSpecifiers(readFileSync(file, 'utf8')))
  }
  for (const member of workspaceMembers()) {
    scanSpecifiers(sdkworkSpecifiers(readFileSync(join(member, 'package.json'), 'utf8')))
    const memberFiles = []
    walkFiles(join(member, 'src'), EXTENSIONS, memberFiles)
    for (const file of memberFiles) {
      scanSpecifiers(sdkworkSpecifiers(readFileSync(file, 'utf8')))
    }
  }
  return { used: [...used].sort(), uncovered: [...new Set(uncovered)].sort(), covering }
}

/** New mapping keys for uncovered specifiers, derived from joined member dirs. */
function generatedKeys(uncovered, members, declared) {
  const byName = new Map()
  for (const member of members) {
    const name = JSON.parse(readFileSync(join(member, 'package.json'), 'utf8')).name
    if (typeof name === 'string') byName.set(name, member)
  }
  const generated = new Map()
  for (const specifier of uncovered) {
    const slash = specifier.indexOf('/', SDKWORK_PREFIX.length)
    const root = slash === -1 ? specifier : specifier.slice(0, slash)
    const member = byName.get(root)
    if (member === undefined) continue
    if (slash === -1) {
      const entry = existsSync(join(member, 'src', 'index.tsx')) ? 'index.tsx' : 'index.ts'
      generated.set(specifier, [`${relative(ROOT, member).split('\\').join('/')}/src/${entry}`])
    } else {
      generated.set(`${root}/*`, [`${relative(ROOT, member).split('\\').join('/')}/src/*`])
    }
  }
  return generated
}

/**
 * A mapping target whose source root does not exist is stale (the package
 * moved inside its repo). Locate the package by name in the target's repo and
 * return the corrected relative target.
 */
function healedTarget(key, target) {
  const root = sourceRoot(target)
  if (root !== undefined && existsSync(root)) return target
  const repoName = /^\.\.\/(sdkwork-[a-z0-9-]+)\//u.exec(target)?.[1]
  if (repoName === undefined) return target
  const name = key.endsWith('/*') ? key.slice(0, -1) : key
  const repoRoot = resolve(ROOT, '..', repoName)
  const stack = [repoRoot]
  const seen = new Set()
  while (stack.length > 0) {
    const dir = stack.pop()
    if (seen.has(dir)) continue
    seen.add(dir)
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (['node_modules', '.git', 'dist', 'lib', 'coverage', '.turbo'].includes(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(path)
        continue
      }
      if (entry.name !== 'package.json') continue
      let data
      try {
        data = JSON.parse(readFileSync(path, 'utf8'))
      } catch {
        continue
      }
      if (data.name !== name) continue
      const src = join(dir, 'src')
      if (!existsSync(src)) continue
      const entryFile = existsSync(join(src, 'index.tsx')) ? 'index.tsx'
        : existsSync(join(src, 'index.ts')) ? 'index.ts' : undefined
      if (entryFile === undefined) continue
      return key.endsWith('/*')
        ? `${relative(ROOT, src).split('\\').join('/')}/*`
        : `${relative(ROOT, src).split('\\').join('/')}/${entryFile}`
    }
  }
  return target
}

function main() {
  const declared = loadDeclaredPaths()
  const sdkworkDeclared = new Map(Object.entries(declared).filter(([key]) => key.startsWith(SDKWORK_PREFIX)))
  const { used, uncovered, covering } = closure(sdkworkDeclared)
  const members = workspaceMembers()
  const generated = generatedKeys(uncovered, members, sdkworkDeclared)
  const stillUncovered = uncovered.filter(specifier => {
    const slash = specifier.indexOf('/', SDKWORK_PREFIX.length)
    const root = slash === -1 ? specifier : specifier.slice(0, slash)
    return ![...generated.keys()].some(key => key === root || key === `${root}/*`)
  })

  const finalDeclared = new Map(sdkworkDeclared)
  for (const [key, targets] of generated) finalDeclared.set(key, targets)
  const kept = [...covering, ...generated.keys()].sort()
  const dropped = [...sdkworkDeclared.keys()].filter(key => !kept.includes(key)).sort()
  const healed = [...kept].filter(key => {
    const targets = finalDeclared.get(key)
    return targets !== undefined && healedTarget(key, targets[0]) !== targets[0]
  })

  console.log(`used specifiers: ${used.length}`)
  console.log(`declared keys: ${sdkworkDeclared.size}`)
  console.log(`kept keys: ${kept.length} (${generated.size} generated), dropped keys: ${dropped.length}`)
  if (stillUncovered.length > 0) {
    console.log('\nUNCOVERED, no joined member to derive a mapping from:')
    for (const specifier of stillUncovered) console.log(`  ${specifier}`)
    console.log('\n(add a tsconfig.base.json mapping or join the package as a workspace member)')
  }

  if (REWRITE) {
    console.log('\nkept keys:')
    for (const key of kept) console.log(`  ${key} => ${JSON.stringify(finalDeclared.get(key))}`)
    console.log('\ndropped keys:')
    for (const key of dropped) console.log(`  ${key}`)
    if (healed.length > 0) {
      console.log('\nhealed targets (stale source root found by package name):')
      for (const key of healed) {
        const targets = finalDeclared.get(key)
        console.log(`  ${key}: ${targets[0]} -> ${healedTarget(key, targets[0])}`)
      }
    }
  }

  if (!REWRITE || stillUncovered.length > 0) return

  const raw = readFileSync(join(ROOT, TSCONFIG_FILE), 'utf8')
  const lines = raw.split(/\r?\n/u)
  const sdkworkEntry = /^\s*"@sdkwork\/[^"]+"\s*:/u
  const first = lines.findIndex(line => sdkworkEntry.test(line))
  let last = -1
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (sdkworkEntry.test(lines[index])) {
      last = index
      break
    }
  }
  if (first === -1 || last === -1 || first > last) {
    console.error('rewrite: could not locate the @sdkwork/* section')
    process.exitCode = 1
    return
  }
  const indent = lines[first].match(/^\s*/u)?.[0] ?? '      '
  const comment = indent + '// SDKWork ecosystem packages in the real import closure: local sources plus the\n'
    + indent + '// sibling workspace members joined in pnpm-workspace.yaml and the packages they\n'
    + indent + '// reach (the client bundles compile sibling source through these paths).\n'
    + indent + '// Regenerate with `node scripts/analyze-sdkwork-closure.mjs --rewrite`;\n'
    + indent + '// verify-sdkwork-dependencies fails on drift in either direction.\n'
  const entries = kept.map(key => {
    const target = finalDeclared.get(key)[0]
    return `${indent}${JSON.stringify(key)}: ${JSON.stringify([healedTarget(key, target)])},`
  })
  const rewritten = [...lines.slice(0, first), comment, ...entries, ...lines.slice(last + 1)]
  writeFileSync(join(ROOT, TSCONFIG_FILE), rewritten.join('\n'))
  console.log(`\nrewritten tsconfig.base.json: ${kept.length} @sdkwork entries (was ${sdkworkDeclared.size})`)
}

main()
