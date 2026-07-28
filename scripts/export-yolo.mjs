#!/usr/bin/env node
/**
 * Export YOLOv8n to ONNX at imgsz=320 for browser WASM inference.
 * Requires Python venv with ultralytics (created on first run).
 *
 * Usage: node scripts/export-yolo.mjs
 */
import { execSync } from 'child_process'
import { copyFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const venvPython = join(root, '.venv-export/bin/python')
const modelOut = join(root, 'public/models/yolov8n.onnx')

if (!existsSync(venvPython)) {
  console.log('Creating export venv...')
  execSync('python3 -m venv .venv-export', { cwd: root, stdio: 'inherit' })
  execSync('.venv-export/bin/pip install ultralytics', {
    cwd: root,
    stdio: 'inherit',
  })
}

console.log('Exporting yolov8n ONNX at imgsz=320...')
execSync(
  `${venvPython} -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='onnx', imgsz=320, simplify=True, opset=12)"`,
  { cwd: root, stdio: 'inherit' },
)

const exported = join(root, 'yolov8n.onnx')
if (!existsSync(exported)) {
  console.error('Export failed — yolov8n.onnx not found in project root')
  process.exit(1)
}

copyFileSync(exported, modelOut)
console.log(`Copied to ${modelOut}`)
