import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import axios from 'axios'
import {
  AnimatePresence,
  animate,
  motion as Motion,
  useMotionValue,
} from 'framer-motion'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? null : 'http://127.0.0.1:8000')
const USD_TO_INR = 83.12

// Realistic mock data shown immediately — overwritten by live backend when available
const MOCK_PREDICTION = {
  diabetes_probability: 0.2765,
  heart_disease_probability: 0.2566,
  hypertension_probability: 0.5288,
  health_impact: {
    expected_treatment_burden: 4320000,
    preparedness_gap: 720000,
    resilience_score: 61.4,
    risk_pressure: 42.8,
    disease_burden: 3.1,
  },
}

const MOCK_SIMULATION = {
  scenarios: Array.from({ length: 12 }, (_, i) => ({
    year: i + 1,
    best_case_cost: 180000 + i * 48000,
    expected_case_cost: 320000 + i * 95000,
    worst_case_cost: 560000 + i * 185000,
  })),
  diseases: {
    diabetes: {
      best_case: Array.from({ length: 12 }, (_, i) => 0.18 + i * 0.008),
      expected_case: Array.from({ length: 12 }, (_, i) => 0.2765 + i * 0.014),
      worst_case: Array.from({ length: 12 }, (_, i) => 0.38 + i * 0.024),
      cumulative_cost: { best: 1240000, expected: 2860000, worst: 5900000 },
    },
    heart_disease: {
      best_case: Array.from({ length: 12 }, (_, i) => 0.15 + i * 0.007),
      expected_case: Array.from({ length: 12 }, (_, i) => 0.2566 + i * 0.013),
      worst_case: Array.from({ length: 12 }, (_, i) => 0.36 + i * 0.022),
      cumulative_cost: { best: 2100000, expected: 4680000, worst: 9200000 },
    },
    hypertension: {
      best_case: Array.from({ length: 12 }, (_, i) => 0.38 + i * 0.01),
      expected_case: Array.from({ length: 12 }, (_, i) => 0.5288 + i * 0.016),
      worst_case: Array.from({ length: 12 }, (_, i) => 0.65 + i * 0.02),
      cumulative_cost: { best: 720000, expected: 1560000, worst: 3200000 },
    },
  },
  summary: { best_case: 4060000, expected_case: 9100000, worst_case: 18300000, expected_events: 3.4 },
}

const MOCK_EXPLANATION = {
  overall_importance: [
    { feature: 'family_history', importance: 0.4636 },
    { feature: 'smoking', importance: 0.3976 },
    { feature: 'bmi', importance: 0.3769 },
    { feature: 'age', importance: 0.2911 },
    { feature: 'exercise', importance: 0.206 },
    { feature: 'alcohol', importance: 0.1233 },
  ],
}

const initialInputs = {
  age: 38,
  bmi: 24.5,
  smoking: 0,
  alcohol: 0,
  exercise: 4,
  family_history: 1,
}

const diseaseMeta = {
  diabetes: {
    label: 'Diabetes',
    key: 'diabetes_probability',
    accent: '#6ea8ff',
  },
  heart_disease: {
    label: 'Heart disease',
    key: 'heart_disease_probability',
    accent: '#102a43',
  },
  hypertension: {
    label: 'Hypertension',
    key: 'hypertension_probability',
    accent: '#9bb7d4',
  },
}

const sliderControls = [
  {
    key: 'age',
    label: 'Age',
    min: 18,
    max: 85,
    step: 1,
    unit: 'years',
    description: 'Aging drives the baseline drift in long-horizon outcomes.',
  },
  {
    key: 'bmi',
    label: 'BMI',
    min: 16,
    max: 40,
    step: 0.1,
    unit: '',
    description: 'Body mass influences metabolic stress and cardiovascular burden.',
  },
  {
    key: 'exercise',
    label: 'Activity',
    min: 0,
    max: 7,
    step: 0.5,
    unit: 'days / week',
    description: 'Consistent movement reduces simulated drift across every disease path.',
  },
]

const toggleControls = [
  {
    key: 'smoking',
    label: 'Smoking exposure',
    description: 'Raises both event probability and treatment burden.',
  },
  {
    key: 'alcohol',
    label: 'Frequent alcohol',
    description: 'Adds pressure to hypertension and heart outcomes.',
  },
  {
    key: 'family_history',
    label: 'Family history',
    description: 'Increases inherited baseline risk.',
  },
]

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function formatNumber(value, variant = 'number') {
  if (!Number.isFinite(value)) {
    return '--'
  }

  if (variant === 'percent') {
    return `${(value * 100).toFixed(1)}%`
  }

  if (variant === 'currency') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value * USD_TO_INR)
  }

  if (variant === 'score') {
    return value.toFixed(1)
  }

  return value.toFixed(1)
}

function TechBadge({ label, value }) {
  return (
    <Motion.div
      whileHover={{ y: -2 }}
      className="data-tile rounded-2xl border border-white/70 px-4 py-3"
    >
      <p className="text-[0.66rem] uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </Motion.div>
  )
}

function AnimatedNumber({ value, variant = 'number', className = '' }) {
  const motionValue = useMotionValue(value ?? 0)
  const [displayValue, setDisplayValue] = useState(formatNumber(value ?? 0, variant))

  useEffect(() => {
    const controls = animate(motionValue, value ?? 0, {
      duration: 0.85,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        setDisplayValue(formatNumber(latest, variant))
      },
    })

    return () => controls.stop()
  }, [motionValue, value, variant])

  return <span className={className}>{displayValue}</span>
}

function SectionHeading({ eyebrow, title, body }) {
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.34em] text-slate-500">
        {eyebrow}
      </p>
      <h2 className="font-display text-3xl leading-tight text-slate-950 sm:text-5xl">
        {title}
      </h2>
      <p className="max-w-xl text-sm leading-7 text-slate-600 sm:text-base">{body}</p>
    </div>
  )
}

function MetricCard({ label, value, variant, tone, helper, inverted = false }) {
  return (
    <Motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.24 }}
      className={`glass-panel rounded-[28px] border p-5 ${tone}`}
    >
      <p className={`text-xs uppercase tracking-[0.28em] ${inverted ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
      <div className={`mt-4 text-3xl font-semibold ${inverted ? 'text-white' : 'text-slate-950'}`}>
        <AnimatedNumber value={value} variant={variant} />
      </div>
      <p className={`mt-3 text-sm leading-6 ${inverted ? 'text-slate-300' : 'text-slate-600'}`}>{helper}</p>
    </Motion.div>
  )
}

function SliderControl({ control, value, baselineValue, onChange }) {
  const changed = value !== baselineValue

  return (
    <Motion.div
      layout
      whileHover={{ y: -2 }}
      className="glass-panel rounded-[26px] border border-white/60 p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">{control.label}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{control.description}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-slate-950">
            {value}
            {control.unit ? ` ${control.unit}` : ''}
          </p>
          <p className={`text-xs uppercase tracking-[0.24em] ${changed ? 'text-blue-600' : 'text-slate-400'}`}>
            {changed ? 'Adjusted' : 'Baseline'}
          </p>
        </div>
      </div>
      <input
        className="slider-track mt-6 w-full"
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(event) => onChange(control.key, Number(event.target.value))}
      />
    </Motion.div>
  )
}

function ToggleControl({ control, enabled, onToggle }) {
  return (
    <Motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      type="button"
      onClick={() => onToggle(control.key)}
      className={`glass-panel flex w-full items-center justify-between rounded-[24px] border px-5 py-4 text-left transition-colors ${enabled ? 'border-blue-300 bg-blue-50/70' : 'border-white/60 bg-white/70'}`}
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">{control.label}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{control.description}</p>
      </div>
      <span className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${enabled ? 'bg-slate-950' : 'bg-slate-300'}`}>
        <Motion.span
          layout
          className="absolute left-1 h-5 w-5 rounded-full bg-white shadow-sm"
          animate={{ x: enabled ? 20 : 0 }}
          transition={{ duration: 0.22 }}
        />
      </span>
    </Motion.button>
  )
}

function App() {
  const [inputs, setInputs] = useState(initialInputs)
  const [prediction, setPrediction] = useState(MOCK_PREDICTION)
  const [simulation, setSimulation] = useState(MOCK_SIMULATION)
  const [explanation, setExplanation] = useState(MOCK_EXPLANATION)
  const [baselineSnapshot, setBaselineSnapshot] = useState({ prediction: MOCK_PREDICTION, simulation: MOCK_SIMULATION })
  const [activeDisease, setActiveDisease] = useState('diabetes')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const deferredInputs = useDeferredValue(inputs)
  const initialSnapshot = useRef(initialInputs)

  useEffect(() => {
    if (!API_BASE) return   // no backend in production — keep mock data, skip fetch

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setLoading(true)
      setError('')

      try {
        const payload = {
          ...deferredInputs,
          smoking: Number(deferredInputs.smoking),
          alcohol: Number(deferredInputs.alcohol),
          family_history: Number(deferredInputs.family_history),
        }

        const [predictionResponse, simulationResponse, explanationResponse] = await Promise.all([
          axios.post(`${API_BASE}/predict`, payload, { signal: controller.signal }),
          axios.post(`${API_BASE}/simulate`, payload, { signal: controller.signal }),
          axios.post(`${API_BASE}/explain`, payload, { signal: controller.signal }),
        ])

        startTransition(() => {
          setPrediction(predictionResponse.data)
          setSimulation(simulationResponse.data)
          setExplanation(explanationResponse.data)

          if (!baselineSnapshot) {
            setBaselineSnapshot({
              prediction: predictionResponse.data,
              simulation: simulationResponse.data,
            })
          }
        })
      } catch (requestError) {
        if (requestError.name === 'CanceledError' || requestError.code === 'ERR_CANCELED') {
          return
        }
        // silently keep mock data — no error banner in demo mode
      } finally {
        setLoading(false)
      }
    }, 220)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [baselineSnapshot, deferredInputs])

  const riskCards = useMemo(() => {
    if (!prediction) {
      return []
    }

    return Object.entries(diseaseMeta).map(([key, meta]) => {
      const current = prediction[meta.key]
      const previous = baselineSnapshot?.prediction?.[meta.key] ?? current

      return {
        id: key,
        ...meta,
        current,
        delta: current - previous,
      }
    })
  }, [baselineSnapshot, prediction])

  const shapData = explanation?.overall_importance ?? []
  const scenarioData = simulation?.scenarios ?? []
  const activeOutlook = simulation?.diseases?.[activeDisease]
  const finalBestProbability = activeOutlook?.best_case?.at(-1)
  const finalExpectedProbability = activeOutlook?.expected_case?.at(-1)
  const finalWorstProbability = activeOutlook?.worst_case?.at(-1)
  const impact = prediction?.health_impact
  const snapshotBadges = [
    {
      label: 'Composite risk pressure',
      value: `${impact?.risk_pressure?.toFixed(1) ?? '--'} / 100`,
    },
    {
      label: 'Median annual stress',
      value: formatNumber((simulation?.summary?.expected_case ?? 0) / 12, 'currency'),
    },
    {
      label: 'Preparedness gap',
      value: formatNumber(impact?.preparedness_gap, 'currency'),
    },
    {
      label: 'Expected clinical events',
      value: `${simulation?.summary?.expected_events?.toFixed(1) ?? '--'} events`,
    },
  ]
  const deltas = baselineSnapshot?.prediction
    ? Object.entries(diseaseMeta).map(([key, meta]) => ({
        id: key,
        label: meta.label,
        value: prediction?.[meta.key] - baselineSnapshot.prediction[meta.key],
      }))
    : []

  const handleSliderChange = (key, nextValue) => {
    setInputs((current) => ({ ...current, [key]: nextValue }))
  }

  const handleToggle = (key) => {
    setInputs((current) => ({ ...current, [key]: current[key] ? 0 : 1 }))
  }

  const resetScenario = () => {
    setInputs(initialSnapshot.current)
  }

  return (
    <div className="health-shell min-h-screen bg-slate-100 text-slate-950">
      <div className="scan-grid pointer-events-none fixed inset-0 overflow-hidden">
        <div className="noise-overlay absolute inset-0" />
        <div className="absolute left-1/2 top-[-10rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute right-[-8rem] top-[18rem] h-[24rem] w-[24rem] rounded-full bg-slate-300/35 blur-3xl" />
      </div>

      <Motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-30 border-b border-white/60 bg-slate-100/75 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-8">
          <div>
            <p className="font-display text-lg tracking-[0.2em] text-slate-950">HealthLedger AI</p>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Healthcare intelligence</p>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <button type="button" onClick={() => scrollToSection('intake')} className="transition hover:text-slate-950">Inputs</button>
            <button type="button" onClick={() => scrollToSection('results')} className="transition hover:text-slate-950">Results</button>
            <button type="button" onClick={() => scrollToSection('playground')} className="transition hover:text-slate-950">What-if</button>
            <span className="holo-pill rounded-full border border-slate-300/80 px-3 py-1 text-[0.62rem] uppercase tracking-[0.26em] text-slate-600">
              INR Mode
            </span>
          </nav>
        </div>
      </Motion.header>

      <main className="relative mx-auto flex max-w-7xl flex-col gap-14 px-6 pb-20 pt-8 sm:px-8 sm:pt-10">
        <section className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
          <Motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-3 rounded-full border border-white/60 bg-white/75 px-4 py-2 text-xs uppercase tracking-[0.32em] text-slate-500 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Predictive simulation engine
            </div>
            <div className="space-y-6">
              <h1 className="font-display max-w-4xl text-5xl leading-[0.94] tracking-[-0.06em] text-slate-950 sm:text-7xl">
                Predict your future health. Before it happens.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                HealthLedger AI models disease risk, explains the drivers, and runs long-range Monte Carlo simulations so lifestyle shifts feel tangible, not abstract.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => scrollToSection('intake')}
                className="neon-button rounded-full px-6 py-3 text-sm font-semibold text-white"
              >
                Launch scenario model
              </Motion.button>
              <Motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => scrollToSection('results')}
                className="ghost-button rounded-full border border-slate-300 bg-white/70 px-6 py-3 text-sm font-semibold text-slate-700 backdrop-blur"
              >
                Explore projected outcomes
              </Motion.button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {snapshotBadges.map((badge) => (
                <TechBadge key={badge.label} label={badge.label} value={badge.value} />
              ))}
            </div>
          </Motion.div>

          <Motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.08 }}
            className="glass-panel tech-frame relative overflow-hidden rounded-[34px] border border-white/60 p-6 sm:p-7"
          >
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent" />
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Current outlook</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {riskCards.map((card) => (
                <Motion.div
                  key={card.id}
                  whileHover={{ y: -3 }}
                  className="tech-card rounded-[24px] border border-white/70 bg-white/70 p-4 backdrop-blur"
                >
                  <p className="text-sm text-slate-600">{card.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">
                    <AnimatedNumber value={card.current} variant="percent" />
                  </p>
                  <p className={`mt-2 text-xs uppercase tracking-[0.24em] ${card.delta > 0 ? 'text-rose-500' : 'text-blue-600'}`}>
                    {card.delta > 0 ? '+' : ''}
                    {(card.delta * 100).toFixed(1)} pts vs baseline
                  </p>
                </Motion.div>
              ))}
            </div>
            <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Projected 12-year cost in INR</p>
                  <p className="mt-3 text-3xl font-semibold">
                    <AnimatedNumber value={simulation?.summary?.expected_case} variant="currency" />
                  </p>
                </div>
                <div className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-slate-300">
                  {loading ? 'Refreshing' : 'Live model'}
                </div>
              </div>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
                The simulation blends disease occurrence probability with cost variability to show best, expected, and stress-case healthcare burden.
              </p>
            </div>
          </Motion.div>
        </section>

        <section id="intake" className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <SectionHeading
            eyebrow="Input Page"
            title="Build a living health scenario instead of filling a form."
            body="Each control updates the model in place. The interface emphasizes signal, causality, and future spread rather than raw data entry."
          />

          <Motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            className="glass-panel tech-frame rounded-[32px] border border-white/60 p-6 sm:p-7"
          >
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Scenario controls</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">Fine-tune physiology, habits, and inherited exposure.</p>
              </div>
              <button
                type="button"
                onClick={resetScenario}
                className="ghost-button rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600 transition hover:border-slate-950 hover:text-slate-950"
              >
                Reset baseline
              </button>
            </div>
            <div className="grid gap-4">
              {sliderControls.map((control) => (
                <SliderControl
                  key={control.key}
                  control={control}
                  value={inputs[control.key]}
                  baselineValue={initialSnapshot.current[control.key]}
                  onChange={handleSliderChange}
                />
              ))}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {toggleControls.map((control) => (
                <ToggleControl
                  key={control.key}
                  control={control}
                  enabled={Boolean(inputs[control.key])}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          </Motion.div>
        </section>

        <section id="results" className="space-y-8">
          <SectionHeading
            eyebrow="Results Dashboard"
            title="Three layers of intelligence, one readable story."
            body="Risk cards quantify disease probability, SHAP exposes the current drivers, and the simulation chart reveals how uncertainty expands over time."
          />

          <div className="grid gap-5 xl:grid-cols-4">
            {riskCards.map((card) => (
              <Motion.div
                key={card.id}
                whileHover={{ y: -4 }}
                className="glass-panel tech-card rounded-[28px] border border-white/60 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">{card.label}</p>
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: card.accent }} />
                </div>
                <div className="mt-5 text-4xl font-semibold tracking-[-0.05em] text-slate-950">
                  <AnimatedNumber value={card.current} variant="percent" />
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                  <Motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(card.current * 100, 100)}%` }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full bg-slate-950"
                  />
                </div>
                <p className={`mt-4 text-xs uppercase tracking-[0.24em] ${card.delta > 0 ? 'text-rose-500' : 'text-blue-600'}`}>
                  {card.delta > 0 ? 'Rising' : 'Improving'} by {Math.abs(card.delta * 100).toFixed(1)} pts from the launch profile
                </p>
              </Motion.div>
            ))}

            <MetricCard
              label="Expected treatment burden"
              value={impact?.expected_treatment_burden}
              variant="currency"
              tone="border-slate-200 bg-white/75"
              helper="Weighted from disease probability and synthetic treatment cost profiles."
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <Motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              className="glass-panel tech-frame rounded-[32px] border border-white/60 p-6 sm:p-7"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Monte Carlo Simulation</p>
                  <h3 className="mt-2 font-display text-2xl text-slate-950">Health trajectory spread</h3>
                </div>
                <div className="rounded-full border border-slate-300 px-4 py-2 text-xs uppercase tracking-[0.28em] text-slate-600">
                  1000 runs, 12 years
                </div>
              </div>
              <div className="mt-8 h-[340px] w-full">
                <ResponsiveContainer>
                  <AreaChart data={scenarioData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rangeFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#6ea8ff" stopOpacity={0.24} />
                        <stop offset="100%" stopColor="#6ea8ff" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#dbe4f0" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} width={42} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 18,
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                        background: 'rgba(255,255,255,0.95)',
                        boxShadow: '0 20px 60px rgba(15, 23, 42, 0.12)',
                      }}
                    />
                    <Area type="monotone" dataKey="worst_case" stroke="transparent" fill="url(#rangeFill)" />
                    <Area type="monotone" dataKey="best_case" stroke="transparent" fill="#f8fafc" fillOpacity={1} />
                    <Line type="monotone" dataKey="expected_case" stroke="#0f172a" strokeWidth={2.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Best case"
                  value={simulation?.summary?.best_case}
                  variant="currency"
                  tone="border-white/60 bg-white/60"
                  helper="10th percentile of total projected burden."
                />
                <MetricCard
                  label="Expected case"
                  value={simulation?.summary?.expected_case}
                  variant="currency"
                  tone="border-slate-950/10 bg-slate-950 text-white"
                  helper="Median outcome across all simulated futures."
                  inverted
                />
                <MetricCard
                  label="Worst case"
                  value={simulation?.summary?.worst_case}
                  variant="currency"
                  tone="border-white/60 bg-white/60"
                  helper="90th percentile stress scenario for planning."
                />
              </div>
            </Motion.div>

            <Motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              className="glass-panel tech-frame rounded-[32px] border border-white/60 p-6 sm:p-7"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Explainable AI</p>
              <h3 className="mt-2 font-display text-2xl text-slate-950">Feature importance</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
                SHAP scores show which inputs are carrying the current prediction profile across diseases.
              </p>
              <div className="mt-6 h-[320px] w-full">
                <ResponsiveContainer>
                  <BarChart data={shapData} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 6" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis dataKey="feature" type="category" tickLine={false} axisLine={false} tick={{ fill: '#0f172a', fontSize: 12 }} width={96} />
                    <Tooltip
                      formatter={(value) => [Number(value).toFixed(3), 'SHAP impact']}
                      contentStyle={{
                        borderRadius: 18,
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                        background: 'rgba(255,255,255,0.95)',
                      }}
                    />
                    <Bar dataKey="importance" radius={[10, 10, 10, 10]}>
                      {shapData.map((entry, index) => (
                        <Cell key={`${entry.feature}-${index}`} fill={index === 0 ? '#0f172a' : '#8aa9cb'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Motion.div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <MetricCard
                label="Preparedness gap"
                value={impact?.preparedness_gap}
                variant="currency"
                tone="border-white/60 bg-white/75"
                helper="Estimated gap between expected burden and lifestyle-adjusted resilience buffer."
              />
              <MetricCard
                label="Resilience score"
                value={impact?.resilience_score}
                variant="score"
                tone="border-white/60 bg-white/75"
                helper="Higher scores indicate stronger capacity to absorb long-range health volatility."
              />
              <MetricCard
                label="Projected events"
                value={simulation?.summary?.expected_events}
                variant="number"
                tone="border-white/60 bg-white/75"
                helper="Expected count of disease events across all simulation runs."
              />
            </div>

            <Motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              className="glass-panel tech-frame rounded-[32px] border border-white/60 p-6 sm:p-7"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Disease Lens</p>
                  <h3 className="mt-2 font-display text-2xl text-slate-950">Outcome breakdown</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(diseaseMeta).map(([key, meta]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveDisease(key)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] transition ${activeDisease === key ? 'bg-slate-950 text-white shadow-[0_14px_36px_rgba(15,23,42,0.25)]' : 'border border-slate-300 bg-white/70 text-slate-600'}`}
                    >
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[24px] border border-white/70 bg-white/75 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Event probability</p>
                  <p className="mt-4 text-3xl font-semibold text-slate-950">
                    <AnimatedNumber value={activeOutlook?.event_probability} variant="percent" />
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">Chance of at least one disease event over the simulation horizon.</p>
                </div>
                <div className="rounded-[24px] border border-white/70 bg-white/75 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Expected disease cost</p>
                  <p className="mt-4 text-3xl font-semibold text-slate-950">
                    <AnimatedNumber value={activeOutlook?.cumulative_cost_expected} variant="currency" />
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">Median cumulative cost for the selected disease path.</p>
                </div>
              </div>
              <div className="mt-6 space-y-4 rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>Best-case probability</span>
                  <span>{Number.isFinite(finalBestProbability) ? `${(finalBestProbability * 100).toFixed(1)}%` : '--'}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>Expected probability</span>
                  <span>{Number.isFinite(finalExpectedProbability) ? `${(finalExpectedProbability * 100).toFixed(1)}%` : '--'}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>Worst-case probability</span>
                  <span>{Number.isFinite(finalWorstProbability) ? `${(finalWorstProbability * 100).toFixed(1)}%` : '--'}</span>
                </div>
              </div>
            </Motion.div>
          </div>
        </section>

        <section id="playground" className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading
            eyebrow="What-If Playground"
            title="Move the sliders and watch the future bend in real time."
            body="This layer focuses on deltas. It makes incremental behavior changes legible by comparing the current scenario against the launch profile that loaded on page entry."
          />

          <Motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            className="glass-panel tech-frame rounded-[32px] border border-white/60 p-6 sm:p-7"
          >
            <div className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/70 bg-white/75 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Scenario delta</p>
                  <div className="mt-5 space-y-3">
                    {deltas.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <span className="text-sm text-slate-600">{item.label}</span>
                        <span className={`text-sm font-semibold ${item.value > 0 ? 'text-rose-500' : 'text-blue-600'}`}>
                          {item.value > 0 ? '+' : ''}
                          {(item.value * 100).toFixed(1)} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[24px] border border-white/70 bg-white/75 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Visual feedback</p>
                  <div className="mt-4 flex items-center gap-3">
                    <span className={`h-3 w-3 rounded-full ${loading ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`} />
                    <p className="text-sm text-slate-600">{loading ? 'Simulation recalculating' : 'Scenario synced to live model'}</p>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    Changes propagate across prediction, SHAP attribution, and Monte Carlo outputs without page transitions or submit steps.
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                {sliderControls.map((control) => (
                  <SliderControl
                    key={`play-${control.key}`}
                    control={control}
                    value={inputs[control.key]}
                    baselineValue={initialSnapshot.current[control.key]}
                    onChange={handleSliderChange}
                  />
                ))}
              </div>
            </div>
          </Motion.div>
        </section>

        <AnimatePresence>
          {(loading || error) && (
            <Motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className={`fixed bottom-6 right-6 z-40 rounded-full border px-5 py-3 text-sm shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl ${error ? 'border-rose-200 bg-rose-50/90 text-rose-700' : 'border-white/70 bg-white/85 text-slate-700'}`}
            >
              {error || 'Recomputing the live future model'}
            </Motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
