import { computed, ref, type Ref } from 'vue'

interface Point {
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

/** 포인터 이벤트에서 쓰는 값만 — 테스트는 이 모양의 객체를 넘긴다 */
type PointerInput = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'timeStamp' | 'type'> & {
  currentTarget: EventTarget | null
}
type WheelInput = Pick<WheelEvent, 'clientX' | 'clientY' | 'deltaY'>

/** 화면에 꽉 맞춘 크기 대비 최대 확대 — 작은 지도도 이만큼은 키운다 */
const MIN_MAX_ZOOM = 4
/** 큰 지도는 원본 1px 이 화면 2px 이 될 때까지 키운다 — 지도 글씨를 원본보다 크게 읽을 수 있게 */
const MAX_IMAGE_TO_SCREEN_RATIO = 2
/** 확대·축소 버튼 한 번의 배율 */
const BUTTON_ZOOM_STEP = 2
/** 두 번 탭하면 그 자리를 이만큼 키운다(이미 키운 상태면 맞춤 크기로 돌아간다) */
const DOUBLE_TAP_ZOOM = 3
/** 두 번 탭으로 보는 간격(ms)과 거리(px) */
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SLOP = 30
/** 이만큼 움직이면 탭이 아니라 끌기다(px) */
const TAP_SLOP = 10
/** 휠 한 칸(deltaY 100)이 약 18% 배율이 되게 */
const WHEEL_ZOOM_RATE = 0.002
/** 두 손가락이 거의 겹쳤을 때 0으로 나누지 않게(px) */
const MIN_PINCH_DISTANCE = 8
const EPSILON = 1e-6

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * 이미지를 무대(stage) 안에서 손가락으로 키우고 줄이고 옮긴다 — 행사장 지도 크게 보기(VenueMapViewer)가 쓴다.
 * 이미지는 무대에 꽉 맞춘 크기(zoom 1)에서 시작하고, 두 손가락 벌리기·오므리기, 한 손가락 끌기, 두 번 탭,
 * 마우스 휠, 확대·축소 버튼으로 움직인다. 이미지 가장자리는 무대 안으로 들어오지 않게 막아, 지도를 놓치지 않는다.
 * 확대는 손가락이 가리키는 지도 위치를 그대로 둔 채 일어난다.
 */
export function usePinchZoom(stage: Ref<HTMLElement | null>) {
  const stageSize = ref<Size>({ width: 0, height: 0 })
  const imageSize = ref<Size>({ width: 0, height: 0 })
  /** 꽉 맞춘 크기 대비 배율 — 1이면 지도 전체가 보인다 */
  const zoom = ref(1)
  /** 이미지 왼쪽 위의 무대 좌표(px) */
  const offset = ref<Point>({ x: 0, y: 0 })
  /** 버튼·두 번 탭처럼 한 번에 바뀔 때만 부드럽게 옮긴다 — 손가락을 따라갈 때는 끈다 */
  const animating = ref(false)

  const fitScale = computed(() => {
    const { width: stageWidth, height: stageHeight } = stageSize.value
    const { width: imageWidth, height: imageHeight } = imageSize.value
    if (!stageWidth || !stageHeight || !imageWidth || !imageHeight) return 1
    return Math.min(stageWidth / imageWidth, stageHeight / imageHeight)
  })
  const maxZoom = computed(() => Math.max(MIN_MAX_ZOOM, MAX_IMAGE_TO_SCREEN_RATIO / fitScale.value))
  const scale = computed(() => fitScale.value * zoom.value)
  const transform = computed(
    () => `translate(${offset.value.x}px, ${offset.value.y}px) scale(${scale.value})`,
  )
  const canZoomIn = computed(() => zoom.value < maxZoom.value - EPSILON)
  const canZoomOut = computed(() => zoom.value > 1 + EPSILON)

  /** 무대보다 작은 쪽은 가운데에, 큰 쪽은 가장자리가 무대 안으로 들어오지 않게 둔다 */
  function clampOffset(next: Point, nextScale: number): Point {
    const width = imageSize.value.width * nextScale
    const height = imageSize.value.height * nextScale
    const { width: stageWidth, height: stageHeight } = stageSize.value
    return {
      x: width <= stageWidth ? (stageWidth - width) / 2 : Math.min(0, Math.max(stageWidth - width, next.x)),
      y: height <= stageHeight ? (stageHeight - height) / 2 : Math.min(0, Math.max(stageHeight - height, next.y)),
    }
  }

  /** 기준 상태(배율·위치)에서 무대의 한 점(anchor)이 가리키던 지도 위치가 target 점으로 오게 배율을 바꾼다 */
  function zoomFrom(base: { zoom: number; offset: Point }, nextZoom: number, anchor: Point, target: Point) {
    const clampedZoom = Math.min(maxZoom.value, Math.max(1, nextZoom))
    const baseScale = fitScale.value * base.zoom
    const nextScale = fitScale.value * clampedZoom
    const imageX = (anchor.x - base.offset.x) / baseScale
    const imageY = (anchor.y - base.offset.y) / baseScale
    zoom.value = clampedZoom
    offset.value = clampOffset({ x: target.x - imageX * nextScale, y: target.y - imageY * nextScale }, nextScale)
  }

  function zoomAt(nextZoom: number, point: Point) {
    zoomFrom({ zoom: zoom.value, offset: offset.value }, nextZoom, point, point)
  }

  const stageCenter = (): Point => ({ x: stageSize.value.width / 2, y: stageSize.value.height / 2 })

  /** 지도 전체가 보이는 맞춤 크기로 돌아간다 */
  function reset() {
    zoom.value = 1
    offset.value = clampOffset({ x: 0, y: 0 }, fitScale.value)
  }

  function zoomIn() {
    animating.value = true
    zoomAt(zoom.value * BUTTON_ZOOM_STEP, stageCenter())
  }

  function zoomOut() {
    animating.value = true
    zoomAt(zoom.value / BUTTON_ZOOM_STEP, stageCenter())
  }

  /** 무대 크기가 바뀌면(화면 회전) 배율은 두고 위치만 다시 맞춘다 */
  function setStageSize(size: Size) {
    stageSize.value = size
    offset.value = clampOffset(offset.value, scale.value)
  }

  /** 새 이미지는 맞춤 크기에서 시작한다 */
  function setImageSize(size: Size) {
    imageSize.value = size
    reset()
  }

  const pointers = new Map<number, Point>()
  let pan: { start: Point; origin: Point } | null = null
  let pinch: { distance: number; midpoint: Point; zoom: number; offset: Point } | null = null
  let tapStart: Point | null = null
  let lastTap: { at: number; point: Point } | null = null

  function localPoint(event: { clientX: number; clientY: number }): Point {
    const rect = stage.value?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  function startPan(point: Point) {
    pinch = null
    pan = { start: point, origin: { ...offset.value } }
  }

  function startPinch() {
    const [first, second] = [...pointers.values()] as [Point, Point]
    pan = null
    pinch = {
      distance: Math.max(MIN_PINCH_DISTANCE, distance(first, second)),
      midpoint: midpoint(first, second),
      zoom: zoom.value,
      offset: { ...offset.value },
    }
  }

  function onPointerDown(event: PointerInput) {
    animating.value = false
    // 손가락이 무대 밖으로 나가도 끝까지 이 무대가 받는다
    const target = event.currentTarget as Element | null
    target?.setPointerCapture?.(event.pointerId)
    const point = localPoint(event)
    pointers.set(event.pointerId, point)
    if (pointers.size === 1) {
      startPan(point)
      tapStart = point
    } else if (pointers.size === 2) {
      startPinch()
      tapStart = null
    }
  }

  function onPointerMove(event: PointerInput) {
    if (!pointers.has(event.pointerId)) return
    const point = localPoint(event)
    pointers.set(event.pointerId, point)
    if (tapStart !== null && distance(tapStart, point) > TAP_SLOP) tapStart = null
    if (pinch !== null && pointers.size >= 2) {
      const [first, second] = [...pointers.values()] as [Point, Point]
      const nextZoom = (pinch.zoom * Math.max(MIN_PINCH_DISTANCE, distance(first, second))) / pinch.distance
      zoomFrom(pinch, nextZoom, pinch.midpoint, midpoint(first, second))
    } else if (pan !== null) {
      offset.value = clampOffset(
        { x: pan.origin.x + point.x - pan.start.x, y: pan.origin.y + point.y - pan.start.y },
        scale.value,
      )
    }
  }

  function onPointerUp(event: PointerInput) {
    if (!pointers.has(event.pointerId)) return
    const point = localPoint(event)
    pointers.delete(event.pointerId)
    if (pointers.size === 1) {
      // 두 손가락 중 하나를 뗐다 — 남은 손가락으로 이어서 끈다
      startPan([...pointers.values()][0] as Point)
      return
    }
    if (pointers.size > 0) return
    pan = null
    pinch = null
    const wasTap = tapStart !== null && event.type === 'pointerup'
    tapStart = null
    if (wasTap) handleTap(point, event.timeStamp)
  }

  /** 두 번 탭 — 맞춤 크기면 그 자리를 키우고, 이미 키웠으면 맞춤 크기로 돌아간다 */
  function handleTap(point: Point, at: number) {
    if (lastTap !== null && at - lastTap.at <= DOUBLE_TAP_MS && distance(lastTap.point, point) <= DOUBLE_TAP_SLOP) {
      lastTap = null
      animating.value = true
      if (canZoomOut.value) reset()
      else zoomAt(DOUBLE_TAP_ZOOM, point)
      return
    }
    lastTap = { at, point }
  }

  function onWheel(event: WheelInput) {
    animating.value = false
    zoomAt(zoom.value * Math.exp(-event.deltaY * WHEEL_ZOOM_RATE), localPoint(event))
  }

  return {
    zoom,
    offset,
    scale,
    maxZoom,
    transform,
    animating,
    canZoomIn,
    canZoomOut,
    zoomIn,
    zoomOut,
    reset,
    setStageSize,
    setImageSize,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
  }
}
