import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { usePinchZoom } from '../composables/usePinchZoom'

/** 무대 400×600(왼쪽 위가 화면 원점)에 2000×1500 지도 — 맞춤 배율 0.2, 지도는 400×300 으로 세로 가운데에 놓인다 */
function setup() {
  const stage = ref({
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }),
  } as unknown as HTMLElement)
  const zoom = usePinchZoom(stage)
  zoom.setStageSize({ width: 400, height: 600 })
  zoom.setImageSize({ width: 2000, height: 1500 })
  return zoom
}

let timeStamp = 0
function pointer(type: string, pointerId: number, clientX: number, clientY: number, at?: number) {
  timeStamp = at ?? timeStamp + 16
  return { type, pointerId, clientX, clientY, timeStamp, currentTarget: null }
}

describe('usePinchZoom', () => {
  it('지도 전체가 보이는 맞춤 크기에서 시작하고, 작은 쪽은 가운데에 둔다', () => {
    const zoom = setup()

    expect(zoom.scale.value).toBeCloseTo(0.2)
    expect(zoom.offset.value).toEqual({ x: 0, y: 150 })
    expect(zoom.canZoomOut.value).toBe(false)
    expect(zoom.canZoomIn.value).toBe(true)
    // 큰 지도는 원본 1px 이 화면 2px 이 될 때까지 키울 수 있다(맞춤의 10배)
    expect(zoom.maxZoom.value).toBeCloseTo(10)
  })

  it('확대 버튼은 무대 가운데를 기준으로 두 배씩 키우고, 축소 버튼으로 맞춤 크기까지 돌아온다', () => {
    const zoom = setup()

    zoom.zoomIn()
    expect(zoom.zoom.value).toBe(2)
    // 가운데(200,300)가 가리키던 지도 위치가 그대로 가운데에 있다. 높이는 무대와 같아져 위아래 여백이 없다
    expect(zoom.offset.value).toEqual({ x: -200, y: 0 })
    expect(zoom.animating.value).toBe(true)

    zoom.zoomOut()
    expect(zoom.zoom.value).toBe(1)
    expect(zoom.offset.value).toEqual({ x: 0, y: 150 })
    expect(zoom.canZoomOut.value).toBe(false)
  })

  it('최대 배율을 넘어서 키우지 않는다', () => {
    const zoom = setup()

    for (let i = 0; i < 6; i++) zoom.zoomIn()

    expect(zoom.zoom.value).toBeCloseTo(10)
    expect(zoom.canZoomIn.value).toBe(false)
  })

  it('두 손가락을 벌리면 손가락 사이의 지도 위치를 그대로 둔 채 키운다', () => {
    const zoom = setup()

    zoom.onPointerDown(pointer('pointerdown', 1, 150, 300))
    zoom.onPointerDown(pointer('pointerdown', 2, 250, 300))
    zoom.onPointerMove(pointer('pointermove', 1, 100, 300))
    zoom.onPointerMove(pointer('pointermove', 2, 300, 300))

    expect(zoom.zoom.value).toBeCloseTo(2)
    expect(zoom.offset.value.x).toBeCloseTo(-200)
    expect(zoom.offset.value.y).toBeCloseTo(0)
    expect(zoom.animating.value).toBe(false)
  })

  it('한 손가락을 떼면 남은 손가락으로 튀지 않고 이어서 끈다', () => {
    const zoom = setup()
    zoom.onPointerDown(pointer('pointerdown', 1, 150, 300))
    zoom.onPointerDown(pointer('pointerdown', 2, 250, 300))
    zoom.onPointerMove(pointer('pointermove', 1, 100, 300))
    zoom.onPointerMove(pointer('pointermove', 2, 300, 300))
    zoom.onPointerUp(pointer('pointerup', 1, 100, 300))
    const before = { ...zoom.offset.value }

    zoom.onPointerMove(pointer('pointermove', 2, 340, 300))

    expect(zoom.zoom.value).toBeCloseTo(2)
    expect(zoom.offset.value.x).toBeCloseTo(before.x + 40)
  })

  it('맞춤 크기에서는 끌어도 지도가 밀려나지 않고, 키운 뒤에는 가장자리까지만 끌린다', () => {
    const zoom = setup()

    zoom.onPointerDown(pointer('pointerdown', 1, 200, 300))
    zoom.onPointerMove(pointer('pointermove', 1, 260, 340))
    zoom.onPointerUp(pointer('pointerup', 1, 260, 340))
    expect(zoom.offset.value).toEqual({ x: 0, y: 150 })

    zoom.zoomIn()
    zoom.onPointerDown(pointer('pointerdown', 1, 200, 300))
    zoom.onPointerMove(pointer('pointermove', 1, 250, 330))
    expect(zoom.offset.value).toEqual({ x: -150, y: 0 })
    zoom.onPointerMove(pointer('pointermove', 1, 900, 330))
    expect(zoom.offset.value).toEqual({ x: 0, y: 0 })
    zoom.onPointerUp(pointer('pointerup', 1, 900, 330))
  })

  it('두 번 탭하면 그 자리를 세 배로 키우고, 다시 두 번 탭하면 맞춤 크기로 돌아간다', () => {
    const zoom = setup()

    for (const at of [1000, 1200]) {
      zoom.onPointerDown(pointer('pointerdown', 1, 100, 300, at))
      zoom.onPointerUp(pointer('pointerup', 1, 100, 300, at + 50))
    }
    expect(zoom.zoom.value).toBe(3)
    // 탭한 자리(100,300)가 가리키던 지도 위치가 그 자리에 남는다
    expect(zoom.offset.value.x).toBeCloseTo(-200)

    for (const at of [2000, 2200]) {
      zoom.onPointerDown(pointer('pointerdown', 1, 100, 300, at))
      zoom.onPointerUp(pointer('pointerup', 1, 100, 300, at + 50))
    }
    expect(zoom.zoom.value).toBe(1)
  })

  it('탭 간격이 길거나 끌었으면 두 번 탭으로 보지 않는다', () => {
    const zoom = setup()

    zoom.onPointerDown(pointer('pointerdown', 1, 100, 300, 1000))
    zoom.onPointerUp(pointer('pointerup', 1, 100, 300, 1050))
    zoom.onPointerDown(pointer('pointerdown', 1, 100, 300, 1600))
    zoom.onPointerUp(pointer('pointerup', 1, 100, 300, 1650))
    expect(zoom.zoom.value).toBe(1)

    zoom.onPointerDown(pointer('pointerdown', 1, 100, 300, 1700))
    zoom.onPointerMove(pointer('pointermove', 1, 140, 300, 1720))
    zoom.onPointerUp(pointer('pointerup', 1, 140, 300, 1750))
    expect(zoom.zoom.value).toBe(1)
  })

  it('마우스 휠을 올리면 커서 자리를 기준으로 키운다', () => {
    const zoom = setup()

    zoom.onWheel({ clientX: 200, clientY: 300, deltaY: -100 })

    expect(zoom.zoom.value).toBeCloseTo(Math.exp(0.2))
    expect(zoom.animating.value).toBe(false)
  })

  it('화면을 돌려 무대가 바뀌면 배율은 두고 지도를 무대 안으로 다시 맞춘다', () => {
    const zoom = setup()
    zoom.zoomIn()

    zoom.setStageSize({ width: 600, height: 400 })

    expect(zoom.zoom.value).toBe(2)
    // 맞춤 배율 0.2667 × 2 → 지도 1067×800 — 가장자리가 무대 안으로 들어오지 않는다
    expect(zoom.offset.value.x).toBeLessThanOrEqual(0)
    expect(zoom.offset.value.x).toBeGreaterThanOrEqual(600 - 2000 * zoom.scale.value)
  })

  it('새 지도는 맞춤 크기에서 다시 시작한다', () => {
    const zoom = setup()
    zoom.zoomIn()

    zoom.setImageSize({ width: 1500, height: 2000 })

    expect(zoom.zoom.value).toBe(1)
    expect(zoom.scale.value).toBeCloseTo(400 / 1500)
  })
})
