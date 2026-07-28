import * as ort from 'onnxruntime-web'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

ort.env.wasm.wasmPaths = join(root, 'node_modules/onnxruntime-web/dist/') + '/'

const model = readFileSync(join(root, 'public/models/yolov8n.onnx'))
const session = await ort.InferenceSession.create(model, {
  executionProviders: ['wasm'],
})
console.log('inputs', session.inputNames)
console.log('input meta', session.inputMetadata)
console.log('outputs', session.outputNames)
console.log('output meta', session.outputMetadata)

const EXPECTED_SIZE = 320

const metaList = session.inputMetadata
const inputMeta = metaList[session.inputNames[0]] ?? metaList[0]
const inputShape = inputMeta.shape
const h = inputShape[2]
const w = inputShape[3]
if (h !== EXPECTED_SIZE || w !== EXPECTED_SIZE) {
  console.error(`Expected ${EXPECTED_SIZE}×${EXPECTED_SIZE} input, got ${w}×${h}`)
  process.exit(1)
}

const data = new Float32Array(3 * EXPECTED_SIZE * EXPECTED_SIZE).fill(0.5)
const tensor = new ort.Tensor('float32', data, [1, 3, EXPECTED_SIZE, EXPECTED_SIZE])
const feeds = { [session.inputNames[0]]: tensor }
const result = await session.run(feeds)
const out = result[session.outputNames[0]]
console.log(`inference ok at ${EXPECTED_SIZE}×${EXPECTED_SIZE}, output dims`, out.dims)
