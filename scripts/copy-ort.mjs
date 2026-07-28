import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const src = 'node_modules/onnxruntime-web/dist'
const dest = 'public/ort'

mkdirSync(dest, { recursive: true })

for (const file of readdirSync(src)) {
  if (file.startsWith('ort-wasm') && /\.(wasm|mjs)$/.test(file)) {
    cpSync(join(src, file), join(dest, file))
    console.log(`copied ${file} -> public/ort/`)
  }
}
