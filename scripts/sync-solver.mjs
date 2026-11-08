// Copy the browser solver + WASM payloads into public/ so the embeddable
// widget never reaches a third-party CDN. Runs before `vite build`, which
// then copies public/ into dist/.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** [package, path inside package, destination relative to public/] */
const FILES = [
  ['@cap.js/widget', 'cap.min.js', 'nscha-solver.js'],
  ['@cap.js/wasm', 'browser/cap_wasm_bg.wasm', 'cap/cap_wasm_bg.wasm'],
  ['@cap.js/wasm', 'browser/hashwx.wasm', 'cap/hashwx.wasm'],
  ['pako', 'dist/pako_inflate.min.js', 'cap/pako_inflate.min.js'],
]

let copied = 0
for (const [pkg, relative, dest] of FILES) {
  let from
  try {
    from = join(dirname(require.resolve(`${pkg}/package.json`)), relative)
  } catch {
    console.error(`✗ 找不到 ${pkg}（依赖未安装？）`)
    process.exit(1)
  }
  if (!existsSync(from)) {
    console.error(`✗ 缺少 ${relative}（在 ${pkg}）`)
    process.exit(1)
  }
  const target = join(root, 'public', dest)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(from, target)
  copied++
  console.log(`  · ${pkg} → public/${dest}`)
}
console.log(`✓ 已同步 ${copied} 个同源求解资源 → public/`)
