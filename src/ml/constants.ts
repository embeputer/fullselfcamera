/**
 * YOLO input size — 320 for mobile perf (vs 640 native).
 * YOLOv8 accepts multiples of 32; 320 keeps inference ~4× faster than 640
 * while still adequate for dashcam-scale frames (PROC_W is 320).
 */
export const MODEL_INPUT_SIZE = 320

export const MODEL_PATH = '/models/yolov8n.onnx'

/** Confidence threshold for keeping a detection */
export const DETECTION_CONFIDENCE = 0.25

/** Person class gets a lower bar — partial bodies / close-up hands often score low */
export const PERSON_CONFIDENCE = 0.2

/** NMS IoU threshold */
export const NMS_IOU_THRESHOLD = 0.45

/** Bottom fraction of frame treated as hood — small detections here are filtered as dashcam hood */
export const HOOD_ZONE_START = 0.82

/** Large boxes in the hood zone are kept as close-proximity hazards (hand, person leaning in) */
export const HOOD_KEEP_MIN_AREA = 0.04

/** Lower frame fraction where large in-path blobs count as proximity hazards */
export const PROXIMITY_ZONE_START = 0.45

/** Minimum normalized box area to treat a non-hazard class as a proximity hazard */
export const PROXIMITY_MIN_AREA = 0.05

/** Horizontal path corridor (normalized) — hazards outside are lower priority */
export const PATH_CORRIDOR_LEFT = 0.2
export const PATH_CORRIDOR_RIGHT = 0.8

export const OBSTACLE_SEVERITY_MILD = 0.25
export const OBSTACLE_SEVERITY_HARD = 0.7

/** Severity floor for marking obstacle present in HUD */
export const OBSTACLE_PRESENT_THRESHOLD = 0.1

/** COCO 80 class names (index = class id) */
export const COCO_CLASSES: readonly string[] = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'cell phone',
  'microwave',
  'oven',
  'toaster',
  'sink',
  'refrigerator',
  'book',
  'clock',
  'vase',
  'scissors',
  'teddy bear',
  'hair drier',
  'toothbrush',
]

/** COCO class ids treated as driving hazards for speed policy */
export const HAZARD_CLASS_IDS = new Set([
  0, // person
  1, // bicycle
  2, // car
  3, // motorcycle
  5, // bus
  7, // truck
])

export function isHazardClass(classId: number): boolean {
  return HAZARD_CLASS_IDS.has(classId)
}

export function classNameForId(classId: number): string {
  return COCO_CLASSES[classId] ?? `class_${classId}`
}
