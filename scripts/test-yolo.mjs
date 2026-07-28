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

async function runSize(size) {
  const data = new Float32Array(3 * size * size).fill(0.5)
  const tensor = new ort.Tensor('float32', data, [1, 3, size, size])
  const feeds = { [session.inputNames[0]]: tensor }
  try {
    const result = await session.run(feeds)
    const out = result[session.outputNames[0]]
    console.log(`size ${size} output dims`, out.dims)
    const dims = out.dims
    const [numFeatures, numBoxes] =
      dims[1] < dims[2] ? [dims[1], dims[2]] : [dims[2], dims[1]]
    console.log(`  interpreted features=${numFeatures} boxes=${numBoxes}`)
    let maxScore = 0
    const layout = dims[1] < dims[2] ? 'features_first' : 'boxes_first'
    if (layout === 'features_first') {
      for (let i = 0; i < numBoxes; i++) {
        for (let c = 4; c < numFeatures; c++) {
          const s = out.data[c * numBoxes + i]
          if (s > maxScore) maxScore = s
        }
      }
    } else {
      for (let i = 0; i < numBoxes; i++) {
        for (let c = 4; c < numFeatures; c++) {
          const s = out.data[i * numFeatures + c]
          if (s > maxScore) maxScore = s
        }
      }
    }
    console.log(`  max class score`, maxScore)
    return out
  } catch (e) {
    console.error(`size ${size} failed`, e.message)
    return null
  }
}

await runSize(320)
await runSize(640)
