import * as ort from 'onnxruntime-web'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

ort.env.wasm.wasmPaths = join(root, 'node_modules/onnxruntime-web/dist/') + '/'

const EXPECTED_W = 640
const EXPECTED_H = 360

const model = readFileSync(join(root, 'public/models/lane_seg.onnx'))
const session = await ort.InferenceSession.create(model, {
  executionProviders: ['wasm'],
})

console.log('inputs', session.inputNames)
console.log('outputs', session.outputNames)

const data = new Float32Array(3 * EXPECTED_H * EXPECTED_W).fill(0.5)
const tensor = new ort.Tensor('float32', data, [1, 3, EXPECTED_H, EXPECTED_W])
const feeds = { [session.inputNames[0]]: tensor }

const t0 = performance.now()
const result = await session.run(feeds)
const ms = performance.now() - t0

const ll = result.ll ?? result[session.outputNames[1]]
const da = result.da ?? result[session.outputNames[0]]

if (!ll || !da) {
  console.error('Expected outputs da and ll')
  process.exit(1)
}

const [, llC, llH, llW] = ll.dims
if (llW !== EXPECTED_W || llH !== EXPECTED_H || llC !== 2) {
  console.error(
    `Expected ll [1,2,${EXPECTED_H},${EXPECTED_W}], got`,
    ll.dims,
  )
  process.exit(1)
}

console.log(`inference ok at ${EXPECTED_W}×${EXPECTED_H}`)
console.log('da dims', da.dims)
console.log('ll dims', ll.dims)
console.log(`inference ${ms.toFixed(0)}ms`)
