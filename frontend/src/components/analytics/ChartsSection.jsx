import React, { useRef, useState } from 'react'

function fmtValue(value, percent) {
  return percent ? `${(value * 100).toFixed(1)}%` : `${value >= 0 ? '' : '-'}${Math.abs(value * 100).toFixed(1)}%`
}

function buildDomain(values, percent) {
  if (percent) return { min: 0, max: 1 }
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return { min: -0.1, max: 0.1 }
  if (minV === maxV) {
    const delta = Math.max(Math.abs(minV) * 0.2, 0.05)
    return { min: minV - delta, max: maxV + delta }
  }
  const span = maxV - minV
  const pad = Math.max(span * 0.12, 0.03)
  return { min: minV - pad, max: maxV + pad }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function clampWindow(min, max, baseMin, baseMax) {
  const baseSpan = baseMax - baseMin
  const span = max - min
  if (span >= baseSpan) return [baseMin, baseMax]

  let nextMin = min
  let nextMax = max
  if (nextMin < baseMin) {
    nextMax += baseMin - nextMin
    nextMin = baseMin
  }
  if (nextMax > baseMax) {
    nextMin -= nextMax - baseMax
    nextMax = baseMax
  }
  return [nextMin, nextMax]
}

function MiniLineChart({ title, points, color = '#34a46b', percent = false, t }) {
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const [view, setView] = useState(null)
  const [dragging, setDragging] = useState(false)

  if (!points.length) {
    return (
      <article className="chart-card">
        <h3>{title}</h3>
        <div className="empty">{t('chart_insufficient_data')}</div>
      </article>
    )
  }

  const width = 560
  const height = 220
  const padTop = 18
  const padRight = 14
  const padBottom = 38
  const padLeft = 56
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  const values = points.map((p) => p.value)
  const baseY = buildDomain(values, percent)
  const baseXMin = 0
  const baseXMax = Math.max(1, points.length - 1)
  const baseYMin = baseY.min
  const baseYMax = baseY.max

  const xMinRaw = view?.xMin ?? baseXMin
  const xMaxRaw = view?.xMax ?? baseXMax
  const yMinRaw = view?.yMin ?? baseYMin
  const yMaxRaw = view?.yMax ?? baseYMax

  const [xMin, xMax] = clampWindow(xMinRaw, xMaxRaw, baseXMin, baseXMax)
  const [yMin, yMax] = clampWindow(yMinRaw, yMaxRaw, baseYMin, baseYMax)

  const minV = yMin
  const maxV = yMax
  const range = maxV - minV || 1
  const xRange = xMax - xMin || 1
  const stepX = points.length > 1 ? plotW / xRange : 0
  const coords = points.map((p, idx) => {
    const x = padLeft + (idx - xMin) * stepX
    const y = padTop + (1 - (p.value - minV) / range) * plotH
    return { x, y, label: p.label, value: p.value, idx }
  })
  const visibleCoords = coords.filter((c) => c.x >= padLeft - 1 && c.x <= width - padRight + 1)
  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ')
  const yTicks = 5
  const yTickValues = Array.from({ length: yTicks }, (_, i) => maxV - (i * (maxV - minV)) / (yTicks - 1))
  const yLabelX = padLeft - 8
  const tickStart = Math.max(0, Math.ceil(xMin))
  const tickEnd = Math.min(points.length - 1, Math.floor(xMax))
  const xTickCount = Math.min(5, Math.max(1, tickEnd - tickStart + 1))
  const xStepRaw = xTickCount > 1 ? (tickEnd - tickStart) / (xTickCount - 1) : 0
  const xTickIdx = [...new Set(Array.from({ length: xTickCount }, (_, i) => Math.round(tickStart + i * xStepRaw)))]
  const canInteract = points.length > 1

  function viewX(clientX) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return xMin
    const vx = ((clientX - rect.left) / rect.width) * width
    return xMin + ((vx - padLeft) / plotW) * xRange
  }

  function viewY(clientY) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return minV
    const vy = ((clientY - rect.top) / rect.height) * height
    return maxV - ((vy - padTop) / plotH) * range
  }

  function onWheel(e) {
    if (!canInteract) return
    e.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const vx = ((e.clientX - rect.left) / rect.width) * width
    const vy = ((e.clientY - rect.top) / rect.height) * height
    if (vx < padLeft || vx > width - padRight || vy < padTop || vy > height - padBottom) return

    const zoomFactor = e.deltaY < 0 ? 0.85 : 1.15
    const minXSpan = Math.min(Math.max(2, points.length * 0.2), baseXMax - baseXMin)
    const minYSpan = Math.max((baseYMax - baseYMin) * 0.2, percent ? 0.2 : 0.05)
    const nextXSpan = clamp(xRange * zoomFactor, minXSpan, baseXMax - baseXMin)
    const nextYSpan = clamp(range * zoomFactor, minYSpan, baseYMax - baseYMin)

    const focusX = viewX(e.clientX)
    const focusY = viewY(e.clientY)
    const ratioX = (focusX - xMin) / xRange
    const ratioY = (focusY - minV) / range

    let nextXMin = focusX - ratioX * nextXSpan
    let nextXMax = nextXMin + nextXSpan
    ;[nextXMin, nextXMax] = clampWindow(nextXMin, nextXMax, baseXMin, baseXMax)

    let nextYMin = focusY - ratioY * nextYSpan
    let nextYMax = nextYMin + nextYSpan
    ;[nextYMin, nextYMax] = clampWindow(nextYMin, nextYMax, baseYMin, baseYMax)

    setView({ xMin: nextXMin, xMax: nextXMax, yMin: nextYMin, yMax: nextYMax })
  }

  function onMouseDown(e) {
    if (!canInteract) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const vx = ((e.clientX - rect.left) / rect.width) * width
    const vy = ((e.clientY - rect.top) / rect.height) * height
    if (vx < padLeft || vx > width - padRight || vy < padTop || vy > height - padBottom) return
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startXMin: xMin,
      startXMax: xMax,
      startYMin: minV,
      startYMax: maxV,
      startXRange: xRange,
      startYRange: range,
      rect,
    }
    setDragging(true)
  }

  function onMouseMove(e) {
    if (!dragRef.current) return
    const d = dragRef.current
    const dxView = ((e.clientX - d.startClientX) / d.rect.width) * width
    const dyView = ((e.clientY - d.startClientY) / d.rect.height) * height
    const dxValue = (dxView / plotW) * d.startXRange
    const dyValue = (dyView / plotH) * d.startYRange

    let nextXMin = d.startXMin - dxValue
    let nextXMax = d.startXMax - dxValue
    ;[nextXMin, nextXMax] = clampWindow(nextXMin, nextXMax, baseXMin, baseXMax)

    let nextYMin = d.startYMin + dyValue
    let nextYMax = d.startYMax + dyValue
    ;[nextYMin, nextYMax] = clampWindow(nextYMin, nextYMax, baseYMin, baseYMax)

    setView({ xMin: nextXMin, xMax: nextXMax, yMin: nextYMin, yMax: nextYMax })
  }

  function onMouseUp() {
    dragRef.current = null
    setDragging(false)
  }

  return (
    <article className="chart-card">
      <h3>{title}</h3>
      <div className="chart-help">{t('chart_help')}</div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={`chart-svg ${canInteract ? 'interactive' : ''} ${dragging ? 'dragging' : ''}`}
        role="img"
        aria-label={title}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={() => setView(null)}
      >
        <defs>
          <clipPath id={`plot-clip-${title.replace(/\s+/g, '-').toLowerCase()}`}>
            <rect x={padLeft} y={padTop} width={plotW} height={plotH} />
          </clipPath>
        </defs>
        {yTickValues.map((t) => {
          const y = padTop + (1 - (t - minV) / range) * plotH
          return (
            <g key={`y-${t}`}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} className="chart-grid-line" />
              <text x={yLabelX} y={y + 4} textAnchor="end" className="chart-axis-label">
                {fmtValue(t, percent)}
              </text>
            </g>
          )
        })}
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} className="chart-axis-line" />
        <line x1={padLeft} y1={height - padBottom} x2={width - padRight} y2={height - padBottom} className="chart-axis-line" />
        <g clipPath={`url(#plot-clip-${title.replace(/\s+/g, '-').toLowerCase()})`}>
          <polyline fill="none" stroke={color} strokeWidth="3" points={polyline} />
        </g>
        {visibleCoords.map((c) => (
          <g key={`${c.idx}-${c.x}-${c.y}`}>
            <circle cx={c.x} cy={c.y} r="3.5" fill={color}>
              <title>{`${c.label}: ${fmtValue(c.value, percent)}`}</title>
            </circle>
          </g>
        ))}
        {xTickIdx.map((idx) => {
          const c = coords[idx]
          if (!c) return null
          return (
            <text key={`x-${idx}`} x={c.x} y={height - 12} textAnchor="middle" className="chart-axis-label">
              {c.label}
            </text>
          )
        })}
      </svg>
    </article>
  )
}

function HorizontalBars({ title, items, total, percent = false, t }) {
  return (
    <article className="chart-card">
      <h3>{title}</h3>
      {!items.length ? (
        <div className="empty">{t('chart_insufficient_data')}</div>
      ) : (
        <div className="dist-list">
          {items.map((item) => {
            const value = Number(item.value || 0)
            const ratio = total > 0 ? value / total : 0
            return (
              <div className="dist-row" key={item.label}>
                <div className="dist-head">
                  <span>{item.label}</span>
                  <span>{percent ? `${(value * 100).toFixed(1)}%` : value}</span>
                </div>
                <div className="dist-track">
                  <div className="dist-fill" style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}

export default function ChartsSection({ accuracyTrend, roiTrend, predictionDistribution, confidenceDistribution, t }) {
  const predTotal = predictionDistribution.reduce((s, x) => s + Number(x.value || 0), 0)
  const confTotal = confidenceDistribution.reduce((s, x) => s + Number(x.value || 0), 0)

  return (
    <section className="analytics-charts-grid">
      <MiniLineChart title={t('chart_accuracy_over_time')} points={accuracyTrend} color="#2ab574" percent t={t} />
      <MiniLineChart title={t('chart_roi_over_time')} points={roiTrend} color="#ff9a42" t={t} />
      <HorizontalBars title={t('chart_pred_distribution')} items={predictionDistribution} total={predTotal} t={t} />
      <HorizontalBars title={t('chart_conf_distribution')} items={confidenceDistribution} total={confTotal} t={t} />
    </section>
  )
}
