/* CALCULATES TOOLTIP POSITIONS AND DETECTED OVERLAPS WITH SELECTED PINGS, CONNECTING LINES & OTHER POINTS */

type Point = number[]

export function boxIntersectsSelection(
  position: number[],
  width: number,
  height: number,
  points: Point[]
) {
  if (!points.length) return false

  const clearance = 10
  const left = position[0] - clearance
  const top = position[1] - clearance
  const right = position[0] + width + clearance
  const bottom = position[1] + height + clearance

  const start = points[0]
  const end = points[points.length - 1]

  const deltaX = end[0] - start[0]
  const deltaY = end[1] - start[1]

  let entry = 0
  let exit = 1

  const boundaries = [
    [-deltaX, start[0] - left],
    [deltaX, right - start[0]],
    [-deltaY, start[1] - top],
    [deltaY, bottom - start[1]]
  ]

  for (const [direction, distance] of boundaries) {
    if (direction === 0 && distance < 0) return false
    if (direction < 0) entry = Math.max(entry, distance / direction)
    if (direction > 0) exit = Math.min(exit, distance / direction)
    if (entry > exit) return false
  }

  return true
}

export function boxIntersectsPoint(
  [left, top]: number[],
  width: number,
  height: number,
  [x, y]: number[]
) {
  return (
    x >= left - 10 &&
    x <= left + width + 10 &&
    y >= top - 10 &&
    y <= top + height + 10
  )
}

export function tooltipPositions(
  width: number,
  height: number,
  padding: number,
  gap: number,
  points: Point[],
  viewWidth: number,
  viewHeight: number
) {
  const minX = Math.min(...points.map(([x]) => x))
  const maxX = Math.max(...points.map(([x]) => x))
  const minY = Math.min(...points.map(([, y]) => y))
  const maxY = Math.max(...points.map(([, y]) => y))

  const maxLeft = Math.max(padding, viewWidth - width - padding)
  const maxTop = Math.max(padding, viewHeight - height - padding)

  const clamp = ([left, top]: number[]) => [
    Math.max(padding, Math.min(left, maxLeft)),
    Math.max(padding, Math.min(top, maxTop))
  ]

  const horizontalCenter = (minX + maxX - width) / 2
  const verticalCenter = (minY + maxY - height) / 2

  const localOffsets = [gap, gap + 24, gap + 48]
  const edgeSteps = Array.from({ length: 9 }, (_, index) => index / 8)

  return [
    ...localOffsets.flatMap((offset) => [
      [maxX + offset, verticalCenter],
      [minX - offset - width, verticalCenter],
      [horizontalCenter, minY - offset - height],
      [horizontalCenter, maxY + offset]
    ]),
    ...edgeSteps.flatMap((step) => [
      [padding + (maxLeft - padding) * step, padding],
      [padding + (maxLeft - padding) * step, maxTop],
      [padding, padding + (maxTop - padding) * step],
      [maxLeft, padding + (maxTop - padding) * step]
    ])
  ].map(clamp)
}