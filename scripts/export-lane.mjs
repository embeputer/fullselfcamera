#!/usr/bin/env node
/**
 * Download TwinLiteNet lane/drivable segmentation ONNX (640×360 input).
 * Source: https://github.com/harrylal/TwinLiteNet-onnxruntime (MIT, based on chequanghuy/TwinLiteNet)
 *
 * Usage: node scripts/export-lane.mjs
 */
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { pipeline } from 'stream/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const modelOut = join(root, 'public/models/lane_seg.onnx')

const MODEL_URL =
  'https://github.com/harrylal/TwinLiteNet-onnxruntime/raw/main/models/best.onnx'

console.log('Downloading TwinLiteNet lane_seg.onnx...')
await mkdir(dirname(modelOut), { recursive: true })

const res = await fetch(MODEL_URL)
if (!res.ok) {
  console.error(`Download failed: ${res.status} ${res.statusText}`)
  process.exit(1)
}

await pipeline(res.body, createWriteStream(modelOut))
console.log(`Saved to ${modelOut}`)
