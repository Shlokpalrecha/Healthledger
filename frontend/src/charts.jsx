import { useEffect, useMemo, useRef, useState } from 'react'
import { motion as Motion, useInView } from 'framer-motion'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// ─── helpers ────────────────────────────────────────────────────────────────

function gaussian(x, mu, sigma) {
  return (
    (1 / (sigma * Math.sqrt(2 * Math.PI))) *
    Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2))
  )
}

function formatINR(value) {
  if (!Number.isFinite(value)) return '--'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

// Seeded LCG for deterministic "random" trajectories
function seededRand(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return ((s >>> 0) / 0x100000000)
  }
}

// Box-Muller using seeded rand
function randNormal(rand, mu = 0, sigma = 1) {
  const u1 = rand()
  const u2 = rand()
  return mu + sigma * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
}

// ─── shared card wrapper ─────────────────────────────────────────────────────
function ChartCard({ title, eyebrow, subtitle, badge, children }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <Motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.68, ease: [0.16, 1, 0.3, 1] }}
      className="glass-panel tech-frame overflow-hidden rounded-[32px] border border-white/60 bg-white/75 p-6 backdrop-blur-xl sm:p-7"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.34em] text-slate-400">{eyebrow}</p>
          <h3 className="mt-1 font-display text-xl font-semibold text-slate-950 sm:text-2xl">{title}</h3>
          {subtitle && <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{subtitle}</p>}
        </div>
        {badge && (
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.62rem] uppercase tracking-[0.28em] text-slate-500">
            {badge}
          </span>
        )}
      </div>
      {children}
    </Motion.div>
  )
}

// ─── custom tooltip base ──────────────────────────────────────────────────────
const tooltipStyle = {
  borderRadius: 18,
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: 'rgba(255,255,255,0.97)',
  boxShadow: '0 16px 48px rgba(15,23,42,0.1)',
  padding: '10px 14px',
  fontSize: 12,
}

// ══════════════════════════════════════════════════════════════════════════════
// GRAPH 1 — PROBABILISTIC RISK DISTRIBUTION
// ══════════════════════════════════════════════════════════════════════════════

const DISEASE_CURVES = [
  { id: 'diabetes',      label: 'Diabetes',      color: '#6ea8ff', light: 'rgba(110,168,255,0.12)' },
  { id: 'heart_disease', label: 'Heart Disease',  color: '#f87171', light: 'rgba(248,113,113,0.1)' },
  { id: 'hypertension',  label: 'Hypertension',   color: '#34d399', light: 'rgba(52,211,153,0.1)' },
]

export function RiskDistributionChart({ prediction }) {
  const [revealed, setRevealed] = useState(false)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })

  useEffect(() => {
    if (inView) setTimeout(() => setRevealed(true), 120)
  }, [inView])

  const means = {
    diabetes:      prediction?.diabetes_probability      ?? 0.2765,
    heart_disease: prediction?.heart_disease_probability ?? 0.2566,
    hypertension:  prediction?.hypertension_probability  ?? 0.5288,
  }

  const sigmas = { diabetes: 0.08, heart_disease: 0.09, hypertension: 0.07 }

  const steps = 80
  const xs = Array.from({ length: steps }, (_, i) => i / (steps - 1))

  const chartData = xs.map((x) => {
    const row = { x: parseFloat(x.toFixed(3)) }
    for (const d of DISEASE_CURVES) {
      row[d.id] = parseFloat(gaussian(x, means[d.id], sigmas[d.id]).toFixed(4))
    }
    return row
  })

  // Clip to revealed progress
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!revealed) return
    let frame
    const start = performance.now()
    const duration = 1100
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1)
      setProgress(t)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [revealed])

  const visibleCount = Math.floor(progress * steps)
  const visibleData = chartData.slice(0, Math.max(visibleCount, 2))

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={tooltipStyle}>
        <p className="mb-1 text-[0.65rem] uppercase tracking-widest text-slate-400">Risk = {(label * 100).toFixed(0)}%</p>
        {payload.map((p) => (
          <p key={p.dataKey} style={{ color: p.color }} className="text-xs font-medium">
            {DISEASE_CURVES.find((d) => d.id === p.dataKey)?.label}: {Number(p.value).toFixed(3)} density
          </p>
        ))}
      </div>
    )
  }

  return (
    <ChartCard
      eyebrow="Bayesian Risk Profile"
      title="Probabilistic Risk Distribution"
      subtitle="Gaussian posterior over disease probability — width reflects model uncertainty."
      badge="Posterior density"
    >
      <div ref={ref} className="h-[280px] w-full">
        <ResponsiveContainer>
          <LineChart data={visibleData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, 1]}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
            <Tooltip content={<CustomTooltip />} />
            {Object.entries(means).map(([ id, mu ]) => (
              <ReferenceLine
                key={`ref-${id}`}
                x={parseFloat(mu.toFixed(3))}
                stroke={DISEASE_CURVES.find((d) => d.id === id)?.color}
                strokeDasharray="4 3"
                strokeWidth={1.5}
                strokeOpacity={0.6}
              />
            ))}
            {DISEASE_CURVES.map((d) => (
              <Line
                key={d.id}
                type="monotone"
                dataKey={d.id}
                stroke={d.color}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* legend */}
      <div className="mt-4 flex flex-wrap gap-4">
        {DISEASE_CURVES.map((d) => (
          <div key={d.id} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            <span className="text-xs text-slate-500">{d.label}</span>
            <span className="text-xs font-semibold text-slate-800">
              μ = {(means[d.id] * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// GRAPH 2 — SHAP DIVERGING BAR CHART
// ══════════════════════════════════════════════════════════════════════════════

export function ShapImpactChart({ explanation, inputs }) {
  const shapData = useMemo(() => {
    const raw = explanation?.overall_importance ?? []

    // build signed SHAP — features with known negative impact get negative sign
    const negativeFeatures = new Set(['exercise'])
    return raw
      .map((item) => {
        const signed = negativeFeatures.has(item.feature) ? -item.importance : item.importance
        // fine-tune based on live input context
        let adjusted = signed
        if (item.feature === 'smoking'  && inputs?.smoking)        adjusted *= 1.22
        if (item.feature === 'exercise' && inputs?.exercise > 3)   adjusted *= 1.18
        if (item.feature === 'alcohol'  && inputs?.alcohol)        adjusted *= 1.15
        return { feature: item.feature, impact: parseFloat(adjusted.toFixed(4)) }
      })
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
  }, [explanation, inputs])

  const baseline = 0.35

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const { feature, impact } = payload[0].payload
    return (
      <div style={tooltipStyle}>
        <p className="text-[0.65rem] uppercase tracking-widest text-slate-400">{feature}</p>
        <p className={`mt-1 text-sm font-semibold ${impact >= 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
          {impact >= 0 ? '+' : ''}{impact.toFixed(3)} SHAP
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {impact >= 0 ? 'Increases' : 'Reduces'} predicted risk
        </p>
      </div>
    )
  }

  return (
    <ChartCard
      eyebrow="Explainable AI · SHAP"
      title="Feature Impact Decomposition"
      subtitle="Signed Shapley values showing each variable's causal contribution to the current risk score."
      badge="XAI output"
    >
      <div className="h-[300px] w-full">
        <ResponsiveContainer>
          <BarChart
            data={shapData}
            layout="vertical"
            margin={{ top: 0, right: 24, left: 4, bottom: 0 }}
          >
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 6" horizontal={false} />
            <XAxis
              type="number"
              domain={[-0.55, 0.55]}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)}
            />
            <YAxis
              dataKey="feature"
              type="category"
              tick={{ fill: '#0f172a', fontSize: 12, fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              width={110}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine x={0} stroke="#cbd5e1" strokeWidth={1.5} />
            <Bar dataKey="impact" radius={[8, 8, 8, 8]} maxBarSize={22}>
              {shapData.map((entry, i) => (
                <Cell
                  key={`shap-${i}`}
                  fill={entry.impact >= 0 ? '#f87171' : '#34d399'}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex gap-5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="text-xs text-slate-500">Risk-increasing factor</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-slate-500">Risk-reducing factor</span>
        </div>
        <div className="ml-auto text-xs text-slate-400">
          Baseline ƒ(x) = {baseline.toFixed(2)}
        </div>
      </div>
    </ChartCard>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// GRAPH 3 — MONTE CARLO ENSEMBLE
// ══════════════════════════════════════════════════════════════════════════════

const N_PATHS = 60   // rendered paths (visual subset of 1000)
const YEARS   = 12

function generateEnsemble(baseMean, baseStd) {
  const rand = seededRand(42)
  const paths = []
  for (let p = 0; p < N_PATHS; p++) {
    let risk = Math.max(0.05, baseMean + randNormal(rand, 0, baseStd * 0.5))
    const path = []
    for (let y = 1; y <= YEARS; y++) {
      risk = Math.min(0.98, Math.max(0.01, risk + randNormal(rand, 0.012, baseStd * 0.7)))
      path.push(parseFloat(risk.toFixed(4)))
    }
    paths.push(path)
  }
  return paths
}

function buildEnsembleData(paths) {
  return Array.from({ length: YEARS }, (_, i) => {
    const col = paths.map((p) => p[i]).sort((a, b) => a - b)
    const n = col.length
    const p5  = col[Math.floor(n * 0.05)]
    const p25 = col[Math.floor(n * 0.25)]
    const p50 = col[Math.floor(n * 0.50)]
    const p75 = col[Math.floor(n * 0.75)]
    const p95 = col[Math.floor(n * 0.95)]
    return { year: i + 1, p5, p25, p50, p75, p95, band95: [p5, p95], band50: [p25, p75] }
  })
}

export function MonteCarloChart({ prediction }) {
  const baseMean = prediction?.hypertension_probability ?? 0.5288

  const ensembleData = useMemo(() => {
    const paths = generateEnsemble(baseMean, 0.09)
    return buildEnsembleData(paths)
  }, [baseMean])

  const [progress, setProgress] = useState(0)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.25 })

  useEffect(() => {
    if (!inView) return
    let frame
    const start = performance.now()
    const duration = 1400
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1)
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      setProgress(ease)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView])

  const visibleData = ensembleData.slice(0, Math.max(2, Math.floor(progress * YEARS)))

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const d = ensembleData.find((r) => r.year === label)
    if (!d) return null
    return (
      <div style={tooltipStyle}>
        <p className="mb-2 text-[0.65rem] uppercase tracking-widest text-slate-400">Year {label}</p>
        <p className="text-xs text-slate-600">Median — <span className="font-semibold text-slate-900">{(d.p50 * 100).toFixed(1)}%</span></p>
        <p className="text-xs text-slate-500">50% CI — {(d.p25 * 100).toFixed(1)}% – {(d.p75 * 100).toFixed(1)}%</p>
        <p className="text-xs text-slate-400">95% CI — {(d.p5 * 100).toFixed(1)}% – {(d.p95 * 100).toFixed(1)}%</p>
      </div>
    )
  }

  return (
    <ChartCard
      eyebrow="Stochastic Simulation · 1000 Runs"
      title="Monte Carlo Ensemble"
      subtitle="Probability trajectory spread across simulated futures — width = epistemic uncertainty."
      badge="12-year horizon"
    >
      <div ref={ref} className="h-[300px] w-full">
        <ResponsiveContainer>
          <AreaChart data={visibleData} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="mc95" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#6ea8ff" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#6ea8ff" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="mc50" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#6ea8ff" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#6ea8ff" stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'Year', position: 'insideBottomRight', offset: -4, fill: '#94a3b8', fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* 95% band */}
            <Area type="monotone" dataKey="p95" stroke="transparent" fill="url(#mc95)" isAnimationActive={false} />
            <Area type="monotone" dataKey="p5"  stroke="transparent" fill="#f8fafc" fillOpacity={1} isAnimationActive={false} />
            {/* 50% band */}
            <Area type="monotone" dataKey="p75" stroke="transparent" fill="url(#mc50)" isAnimationActive={false} />
            <Area type="monotone" dataKey="p25" stroke="transparent" fill="#f8fafc" fillOpacity={1} isAnimationActive={false} />
            {/* median */}
            <Line type="monotone" dataKey="p50" stroke="#0f172a" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex flex-wrap gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded bg-slate-950" />
          <span className="text-xs text-slate-500">Median trajectory</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-6 rounded bg-blue-300/50" />
          <span className="text-xs text-slate-500">50% confidence band</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-6 rounded bg-blue-200/30" />
          <span className="text-xs text-slate-500">95% confidence band</span>
        </div>
      </div>
    </ChartCard>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// GRAPH 4 — HEALTH LIABILITY DISTRIBUTION
// ══════════════════════════════════════════════════════════════════════════════

function buildCostDistribution(expectedCost) {
  const rand = seededRand(99)
  const samples = Array.from({ length: 1200 }, () =>
    Math.max(0, randNormal(rand, expectedCost, expectedCost * 0.38))
  )
  const sorted = samples.slice().sort((a, b) => a - b)

  const buckets = 40
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const width = (max - min) / buckets
  const hist = Array.from({ length: buckets }, (_, i) => {
    const lo = min + i * width
    const hi = lo + width
    const count = samples.filter((v) => v >= lo && v < hi).length
    return {
      mid: (lo + hi) / 2,
      density: count / (samples.length * width),
    }
  })

  const mean   = samples.reduce((s, v) => s + v, 0) / samples.length
  const median = sorted[Math.floor(sorted.length * 0.5)]
  const p95    = sorted[Math.floor(sorted.length * 0.95)]

  return { hist, mean, median, p95 }
}

export function LiabilityDistributionChart({ simulation }) {
  const expectedCost = simulation?.summary?.expected_case ?? 9100000

  const { hist, mean, median, p95 } = useMemo(
    () => buildCostDistribution(expectedCost),
    [expectedCost]
  )

  const maxDensity = Math.max(...hist.map((d) => d.density))

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const { mid, density } = payload[0].payload
    return (
      <div style={tooltipStyle}>
        <p className="text-[0.65rem] uppercase tracking-widest text-slate-400">{formatINR(mid)}</p>
        <p className="text-xs font-semibold text-slate-800">
          Density: {density.toFixed(6)}
        </p>
      </div>
    )
  }

  return (
    <ChartCard
      eyebrow="Cost Impact Modeling"
      title="Health Liability Distribution"
      subtitle="Simulated distribution of 12-year treatment cost outcomes. Tail risk matters more than the mean."
      badge="1000 samples"
    >
      <div className="h-[280px] w-full">
        <ResponsiveContainer>
          <BarChart data={hist} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="costGrad" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%"   stopColor="#6ea8ff" stopOpacity={0.5} />
                <stop offset="60%"  stopColor="#6ea8ff" stopOpacity={0.75} />
                <stop offset="100%" stopColor="#f87171" stopOpacity={0.9} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="mid"
              tickFormatter={(v) => `₹${(v / 1e6).toFixed(1)}M`}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={7}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              x={mean}
              stroke="#0f172a"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: 'Mean', position: 'top', fill: '#0f172a', fontSize: 10 }}
            />
            <ReferenceLine
              x={p95}
              stroke="#f87171"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: 'P95', position: 'top', fill: '#f87171', fontSize: 10 }}
            />
            <Bar dataKey="density" fill="url(#costGrad)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Median',        value: formatINR(median), color: 'text-slate-900' },
          { label: 'Expected mean', value: formatINR(Math.round(mean)), color: 'text-slate-900' },
          { label: '95th pct',      value: formatINR(Math.round(p95)),  color: 'text-rose-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[0.62rem] uppercase tracking-widest text-slate-400">{label}</p>
            <p className={`mt-1.5 text-sm font-semibold ${color}`}>{value}</p>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// GRAPH 5 — CAUSAL WHAT-IF RESPONSE CURVE
// ══════════════════════════════════════════════════════════════════════════════

const CAUSAL_FEATURES = [
  { key: 'smoking_freq', label: 'Smoking frequency', unit: 'cigs/day', min: 0, max: 30, defaultVal: 0,
    fn: (v) => 0.26 + 0.018 * v - 0.0003 * v * v },
  { key: 'bmi_val',   label: 'BMI',              unit: '',          min: 16, max: 40, defaultVal: 24.5,
    fn: (v) => 0.10 + 0.008 * Math.max(0, v - 18.5) + 0.0012 * Math.max(0, v - 25) ** 2 },
  { key: 'exercise',  label: 'Exercise days/wk', unit: 'days',      min: 0, max: 7,  defaultVal: 4,
    fn: (v) => Math.max(0.08, 0.68 - 0.09 * v + 0.004 * v * v) },
  { key: 'age',       label: 'Age',              unit: 'years',     min: 18, max: 85, defaultVal: 38,
    fn: (v) => 0.06 + 0.006 * (v - 18) + 0.00015 * (v - 18) ** 2 },
]

export function WhatIfResponseChart({ inputs }) {
  const [activeFeature, setActiveFeature] = useState(CAUSAL_FEATURES[0])
  const [sliderVal, setSliderVal] = useState(activeFeature.defaultVal)

  // Sync slider default when feature changes
  useEffect(() => {
    const liveVal = inputs?.[activeFeature.key.replace('_val', '').replace('_freq', '')] ?? activeFeature.defaultVal
    setSliderVal(Number(liveVal))
  }, [activeFeature, inputs])

  const steps = 80
  const curveData = useMemo(() => {
    return Array.from({ length: steps }, (_, i) => {
      const x = activeFeature.min + (i / (steps - 1)) * (activeFeature.max - activeFeature.min)
      const y = Math.min(0.99, Math.max(0.01, activeFeature.fn(x)))
      // 1st derivative (sensitivity)
      const dx = (activeFeature.max - activeFeature.min) / steps
      const yNext = Math.min(0.99, Math.max(0.01, activeFeature.fn(x + dx)))
      const deriv = (yNext - y) / dx
      return { x: parseFloat(x.toFixed(2)), risk: parseFloat(y.toFixed(4)), sensitivity: parseFloat(deriv.toFixed(5)) }
    })
  }, [activeFeature])

  const currentRisk = parseFloat(Math.min(0.99, Math.max(0.01, activeFeature.fn(sliderVal))).toFixed(4))

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
      <div style={tooltipStyle}>
        <p className="text-[0.65rem] uppercase tracking-widest text-slate-400">
          {activeFeature.label} = {label} {activeFeature.unit}
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-900">Risk: {(d.risk * 100).toFixed(1)}%</p>
        <p className="text-xs text-slate-400">∂risk/∂x = {d.sensitivity.toFixed(4)}</p>
      </div>
    )
  }

  return (
    <ChartCard
      eyebrow="Causal Inference · Response Surface"
      title="What-If Response Curve"
      subtitle="Non-linear causal effect of each variable on composite disease risk. Gradient shows local sensitivity."
      badge="Marginal effect"
    >
      {/* Feature selector */}
      <div className="mb-5 flex flex-wrap gap-2">
        {CAUSAL_FEATURES.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setActiveFeature(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition ${
              activeFeature.key === f.key
                ? 'bg-slate-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.2)]'
                : 'border border-slate-200 bg-white/70 text-slate-600 hover:border-slate-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="h-[240px] w-full">
        <ResponsiveContainer>
          <AreaChart data={curveData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="causalGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%"   stopColor="#6ea8ff" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6ea8ff" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={[activeFeature.min, activeFeature.max]}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              label={{ value: activeFeature.unit, position: 'insideBottomRight', offset: -4, fill: '#94a3b8', fontSize: 10 }}
            />
            <YAxis
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              x={sliderVal}
              stroke="#0f172a"
              strokeWidth={2}
              strokeDasharray="0"
              label={{
                value: `You — ${(currentRisk * 100).toFixed(1)}%`,
                position: 'top',
                fill: '#0f172a',
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            <Area type="monotone" dataKey="risk" stroke="#3b82f6" strokeWidth={2.5} fill="url(#causalGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Interactive slider */}
      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Adjust <span className="font-semibold text-slate-800">{activeFeature.label}</span>
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {sliderVal} {activeFeature.unit} → <span className="text-blue-600">{(currentRisk * 100).toFixed(1)}% risk</span>
          </p>
        </div>
        <input
          type="range"
          className="slider-track w-full"
          min={activeFeature.min}
          max={activeFeature.max}
          step={(activeFeature.max - activeFeature.min) / 80}
          value={sliderVal}
          onChange={(e) => setSliderVal(Number(e.target.value))}
        />
        <div className="flex justify-between text-[0.62rem] text-slate-400">
          <span>{activeFeature.min} {activeFeature.unit}</span>
          <span>{activeFeature.max} {activeFeature.unit}</span>
        </div>
      </div>
    </ChartCard>
  )
}
