"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TrendingUp, Zap, BarChart3, Globe,
  ShieldCheck, Calculator, Activity,
  AlertCircle, CheckCircle2, Clock, Leaf,
  ChevronRight, RefreshCw, Droplets, Wind,
  Thermometer, CloudRain, ArrowUpRight, ArrowDownRight,
  Sprout, DollarSign, Ship, HeartPulse, Cloud, ChevronDown,
  Upload, FileText, X, Play, Database, Newspaper, Radio, Bell,
  TrendingDown,
} from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Filler, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend);

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalysisResult {
  bioFertReduction: number;
  bioIrrigation: number;
  inputs: { fert: number; labor: number };
  loanRate: number;
  plantHealth: {
    bioHealthIndex: number;
    gradeARatio: number;
    gradeBRatio: number;
    expectedLifespan: number;
    soilPH: number;
    soilMoisture: number;
    npk: {
      nitrogen:   { ppm: number; pct: number };
      phosphorus: { ppm: number; pct: number };
      potassium:  { ppm: number; pct: number };
    };
  };
  environment: {
    avgTemp: number; avgHumidity: number; solarRadiation: number;
    windSpeed: number; pressure: number; co2: number;
  };
  weatherRisk: 'rain' | 'drought' | 'wind' | null;
  weatherDetails: {
    avgRainfall: number; avgTempMax: number; maxWindSpeed: number;
    forecast: { day: string; emoji: string; temp: string; alert: boolean }[];
  };
  financial: {
    expectedProfit: number; cashRunway: number;
    fertCost: number; laborCost: number; weatherLoss: number;
    suggestedLoanRate: number; pricePerKg?: number;
  };
  // FIX #12: Sales insights from route.ts v2.1
  salesInsights?: {
    avgPricePerKg: number; avgVolumeKg: number;
    priceVolatilityPct: number; minPrice: number; maxPrice: number;
    dominantChannel: string; hasData: boolean;
    unsalableRisk?: boolean;
    alternativeStrategy?: string | null;
  };
  compliance: { label: string; status: string; detail: string }[];
  recommendation: string;
  // Live Tavily search results passed through from backend (Defect 2 fix)
  marketNews?: { query: string; title: string; snippet: string; url: string }[];
  summary: {
    totalDataPoints: number; plantGrowthRecords: number;
    envRecords: number; weatherRecords: number; salesRecords?: number;
    overallHealthScore: number; riskLevel: string; filesUploaded: number;
  };
}

// ─── Utility Hooks & Components ───────────────────────────────────────────────

function useAnimatedNumber(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevTarget = useRef(target);
  useEffect(() => {
    const startVal = prevTarget.current === target ? 0 : value;
    prevTarget.current = target;
    startRef.current = null;
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(startVal + (target - startVal) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return value;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div style={{ height: 5, background: '#e4ede8', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min((value / max) * 100, 100)}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
    </div>
  );
}

function PulsingDot({ color = '#059669' }: { color?: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 8, height: 8, flexShrink: 0 }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color, opacity: 0.35, animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }} />
    </span>
  );
}

function Tag({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color, background: bg, padding: '3px 10px', borderRadius: 20 }}>
      {label}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: '#8aac98', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' as const, marginBottom: 14 }}>{children}</div>
  );
}

function SimSlider({
  label, unit, min, max, value, onChange, zone, formatVal
}: {
  label: string; unit: string; min: number; max: number;
  value: number; onChange: (v: number) => void;
  zone?: [number, number]; formatVal?: (v: number) => string;
}) {
  const inZone = zone ? value >= zone[0] && value <= zone[1] : true;
  const display = formatVal ? formatVal(value) : String(value);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#4d7a62' }}>{label} <span style={{ opacity: 0.6 }}>({unit})</span></label>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: inZone ? '#059669' : '#d97706' }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: '#c3d9cc', fontFamily: "'JetBrains Mono',monospace" }}>{min}</span>
        {zone && <span style={{ fontSize: 10, color: inZone ? '#059669' : '#d97706', fontWeight: 700 }}>{inZone ? '✓ Safe Zone' : '⚠ Alert'}</span>}
        <span style={{ fontSize: 10, color: '#c3d9cc', fontFamily: "'JetBrains Mono',monospace" }}>{max}</span>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ background: '#f6faf8', border: '1px solid #e4ede8', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#8aac98', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function HealthGauge({ value, size = 80 }: { value: number; size?: number }) {
  const color = value >= 75 ? '#059669' : value >= 55 ? '#d97706' : '#ef4444';
  const pct = value / 100;
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ * 0.75;
  const offset = circ * 0.125;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e4ede8" strokeWidth={7} strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeDashoffset={-offset} strokeLinecap="round" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.4s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 4 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 9, color: '#8aac98', fontWeight: 600 }}>/100</span>
      </div>
    </div>
  );
}

// ─── Upload Zone Sub-Component ────────────────────────────────────────────────

function UploadZone({
  id, icon, title, description, hint, accepted, file, onFile, dragOver, onDragOver, onDragLeave,
}: {
  id: string; icon: React.ReactNode; title: string; description: string;
  hint: string; accepted: string; file: File | null;
  onFile: (f: File | null) => void;
  dragOver: boolean; onDragOver: () => void; onDragLeave: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onDragLeave();
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div
      onClick={() => !file && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${dragOver ? '#059669' : file ? '#a7f3d0' : '#d1e8da'}`,
        borderRadius: 18,
        padding: '28px 24px',
        background: dragOver ? 'rgba(5,150,105,0.04)' : file ? '#edfaf4' : '#fafcfb',
        cursor: file ? 'default' : 'pointer',
        transition: 'all 0.22s ease',
        position: 'relative',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accepted}
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />

      {file ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 42, height: 42, background: '#d1fae5', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckCircle2 size={20} color="#059669" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46', marginBottom: 3 }}>{title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={13} color="#059669" />
              <span style={{ fontSize: 12, color: '#059669', fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{file.name}</span>
              <span style={{ fontSize: 11, color: '#8aac98' }}>({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onFile(null); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#8aac98', display: 'flex', alignItems: 'center' }}
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 42, height: 42, background: '#e8f5ee', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {icon}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a3a28', marginBottom: 2 }}>{title}</div>
              <div style={{ fontSize: 12, color: '#6b8f7e' }}>{description}</div>
            </div>
          </div>
          <div style={{ background: '#f0f9f4', border: '1px solid #d1e8da', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#8aac98', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Expected Columns</div>
            <div style={{ fontSize: 11, color: '#4d7a62', fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.8 }}>{hint}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#8aac98' }}>
            <Upload size={14} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Click to upload or drag & drop</span>
            <span style={{ fontSize: 11, background: '#e4ede8', borderRadius: 6, padding: '2px 8px' }}>CSV / JSON</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BioFinOracle() {

  // ── Page routing ────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState<'upload' | 'dashboard'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // ── File upload state ────────────────────────────────────────────────────────
  const [plantFile,   setPlantFile]   = useState<File | null>(null);
  const [envFile,     setEnvFile]     = useState<File | null>(null);
  const [weatherFile, setWeatherFile] = useState<File | null>(null);
  // FIX #9: 4th upload slot for sales/pricing history
  const [salesFile,   setSalesFile]   = useState<File | null>(null);
  const [dragOver,    setDragOver]    = useState<string | null>(null);

  // ── Dashboard state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]     = useState('page1');
  const [inputs, setInputs]           = useState({ fert: 400, labor: 120 });
  const [staffSalary, setStaffSalary] = useState(3400);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditDone, setAuditDone] = useState(false);
  const [stressEvent, setStressEvent] = useState<{ id: string; title: string; loss: number; impact: string } | null>(null);
  const [now, setNow] = useState(new Date());
  const [hasMounted, setHasMounted] = useState(false);
  const [actionExecuted, setActionExecuted] = useState(false);

  const [bioFertReduction, setBioFertReduction] = useState(0);
  const [bioIrrigation, setBioIrrigation] = useState(4);

  const [weatherEvent2, setWeatherEvent2] = useState<'rain' | 'drought' | 'wind' | null>(null);

  const [thaiSupply, setThaiSupply] = useState(0);
  const [portLockDays, setPortLockDays] = useState(0);
  const [shipDelay, setShipDelay] = useState(0);

  const [loanRate, setLoanRate] = useState(5);
  const [laborIncrease, setLaborIncrease] = useState(0);
  const [paymentDelay, setPaymentDelay] = useState(0);

  useEffect(() => {
    setHasMounted(true);
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Terminal animation ───────────────────────────────────────────────────────
  const [terminalStep, setTerminalStep] = useState(0);
  useEffect(() => {
    if (activeTab !== 'page1') return;
    // FIX #4: Only cycle forward to max (4) then freeze; reset only after 6s pause
    const delay = terminalStep >= 4 ? 6000 : 2800;
    const t = setTimeout(() => setTerminalStep(s => s >= 4 ? 1 : s + 1), delay);
    return () => clearTimeout(t);
  }, [terminalStep, activeTab]);

  // ── Execute handler ──────────────────────────────────────────────────────────
  const processingSteps = [
    'Uploading data files…',
    'Parsing CSV records…',
    'Running bio-health analysis…',
    'Computing financial projections…',
    'Generating AI recommendations…',
    'Preparing dashboard…',
  ];

  const handleExecute = useCallback(async () => {
    setIsProcessing(true);
    setApiError(null);
    setProcessingStep(0);

    for (let i = 1; i <= 5; i++) {
      await new Promise(r => setTimeout(r, 320 + i * 80));
      setProcessingStep(i);
    }

    try {
      const fd = new FormData();
      if (plantFile)   fd.append('plantGrowth',    plantFile);
      if (envFile)     fd.append('envVars',         envFile);
      if (weatherFile) fd.append('weatherRecords',  weatherFile);
      if (salesFile)   fd.append('salesHistory',    salesFile);

      const res  = await fetch('/api/analyze', { method: 'POST', body: fd });
      const data: AnalysisResult = await res.json();

      if (!res.ok) throw new Error((data as any).error || 'Server error');

      setAnalysisResult(data);
      setInputs(data.inputs);
      setBioFertReduction(data.bioFertReduction);
      setBioIrrigation(data.bioIrrigation);
      setLoanRate(data.loanRate);
      if (data.weatherRisk) setWeatherEvent2(data.weatherRisk);

    } catch (err) {
      // Defect 5 fix: stop here — do NOT push to dashboard with null analysisResult
      setApiError(String(err));
      setIsProcessing(false);
      return;
    }

    // Only reached when the API call succeeded and state has been populated
    setProcessingStep(5);
    await new Promise(r => setTimeout(r, 400));
    setIsProcessing(false);
    setCurrentPage('dashboard');
  }, [plantFile, envFile, weatherFile, salesFile]);

  // ── Derived computed values ──────────────────────────────────────────────────
  // Defect 1 fix: anchor ALL derived metrics to the AI's computed base values.
  // Sliders now apply *deltas* on top of the AI result rather than recalculating
  // from scratch — so the expensive LLM reasoning is never thrown away.
  const aiBaseBioHealth = analysisResult?.plantHealth.bioHealthIndex ?? 72;
  const aiBaseFertRed   = analysisResult?.bioFertReduction            ?? 0;
  const aiBaseIrrig     = analysisResult?.bioIrrigation               ?? 4;

  const bioHealthIndex = Math.round(Math.max(38,
    aiBaseBioHealth
    - (bioFertReduction - aiBaseFertRed) * 1.1
    - (Math.abs(bioIrrigation - 4) - Math.abs(aiBaseIrrig - 4)) * 4.5
  ));

  const aiBaseGradeA    = analysisResult?.plantHealth.gradeARatio   ?? 68;
  const aiBaseGradeB    = analysisResult?.plantHealth.gradeBRatio   ?? 22;
  const gradeARatio     = Math.round(Math.max(28, Math.min(90,
    aiBaseGradeA
    - (bioFertReduction - aiBaseFertRed) * 0.85
    - (Math.abs(bioIrrigation - 4) - Math.abs(aiBaseIrrig - 4)) * 2.8
  )));
  const gradeBRatio     = Math.round(Math.max(5, Math.min(65,
    aiBaseGradeB
    + (bioFertReduction - aiBaseFertRed) * 0.6
    + (Math.abs(bioIrrigation - 4) - Math.abs(aiBaseIrrig - 4)) * 2.0
  )));
  const aiBaseLifespan   = analysisResult?.plantHealth.expectedLifespan ?? 14;
  const expectedLifespan = Math.max(6, +(
    aiBaseLifespan
    - (bioFertReduction - aiBaseFertRed) * 0.14
    - (Math.abs(bioIrrigation - 4) - Math.abs(aiBaseIrrig - 4)) * 0.55
  ).toFixed(1));
  const bioHealthColor  = bioHealthIndex >= 75 ? '#059669' : bioHealthIndex >= 55 ? '#d97706' : '#ef4444';

  const weatherScenarios = {
    rain:    { label: 'Heavy Downpour',        yar: 42, recoveryCost: 18000, coverage: 12000, emoji: '🌧', color: '#3b82f6' },
    drought: { label: 'Prolonged Drought',      yar: 65, recoveryCost: 28000, coverage: 15000, emoji: '☀️', color: '#ef4444' },
    wind:    { label: 'Category 10 Windstorm',  yar: 28, recoveryCost:  8500, coverage: 10000, emoji: '🌀', color: '#7c3aed' },
  };
  const wx = weatherEvent2 ? weatherScenarios[weatherEvent2] : null;
  const insuranceGap = wx ? Math.max(0, wx.recoveryCost - wx.coverage) : 0;

  const localRatio  = Math.round(Math.min(60, Math.max(15, 40 + portLockDays * 1.4 - thaiSupply * 0.3)));
  const sgRatio     = Math.round(Math.min(60, Math.max(10, 40 - portLockDays * 1.7 + thaiSupply * 0.25)));
  const hkRatio     = Math.max(5, 100 - localRatio - sgRatio);
  const delayLoss   = Math.round(shipDelay * 420 + shipDelay * thaiSupply * 35);
  const supplyLabel = `${localRatio}% : ${sgRatio}% : ${hkRatio}%`;

  const adjustedRunway = Math.max(18, Math.round(142 - (loanRate - 5) * 5.5 - laborIncrease * 1.8 - paymentDelay * 0.55));
  const runwayColor = adjustedRunway >= 120 ? '#059669' : adjustedRunway >= 70 ? '#d97706' : '#ef4444';
  const financingMonth = adjustedRunway < 120 ? Math.ceil(adjustedRunway / 30) : null;
  const totalCashBurn = Math.round((loanRate - 5) * 800 + laborIncrease * 600 + paymentDelay * 250);

  // Defect 1 fix: profit starts from the AI's expectedProfit and applies slider deltas.
  // baseRevenue = 35000 is only used when there is no AI result (no files uploaded).
  const stats = useMemo(() => {
    const aiExpectedProfit  = analysisResult?.financial.expectedProfit ?? 18500;
    const aiBaseFert        = analysisResult?.inputs.fert              ?? 400;
    const aiBaseLabor       = analysisResult?.inputs.labor             ?? 120;

    // Cost delta: extra spend (or saving) vs what the AI already priced in
    const costDelta = (inputs.fert - aiBaseFert) * 12 + (inputs.labor - aiBaseLabor) * 15;

    // Yield adjustment delta (relative to AI's optimal fert level)
    let yieldAdj = 0;
    if (inputs.fert < 300) yieldAdj = -4000;
    else if (inputs.fert > 500 && inputs.fert < 650) yieldAdj = 5500;
    else if (inputs.fert >= 650) yieldAdj = -6000;
    let aiYieldAdj = 0;
    if (aiBaseFert < 300) aiYieldAdj = -4000;
    else if (aiBaseFert > 500 && aiBaseFert < 650) aiYieldAdj = 5500;
    else if (aiBaseFert >= 650) aiYieldAdj = -6000;
    const yieldAdjDelta = yieldAdj - aiYieldAdj;

    // Bio-health penalty delta
    const aiBioHP = aiBaseBioHealth >= 75 ? 0 : aiBaseBioHealth >= 55 ? -3000 : -8000;
    const curBioHP = bioHealthIndex >= 75  ? 0 : bioHealthIndex >= 55  ? -3000 : -8000;

    // Financial sandbox drag: interest rate and payment delay deduct from profit
    const simulatedFinancialDrag = ((loanRate - 5) * 800) + (paymentDelay * 250);

    const profit = aiExpectedProfit
      - costDelta
      + yieldAdjDelta
      + (curBioHP - aiBioHP)
      + (stressEvent?.loss || 0)
      - simulatedFinancialDrag;

    const runway = (inputs.fert * 12 + inputs.labor * 15) > 15000 ? 92 : 142;
    const waste  = Math.max(5, +(18.4 - (bioHealthIndex - 70) * 0.08).toFixed(1));
    return { profit, runway, waste, confidence: 92 };
  }, [analysisResult, inputs, stressEvent, bioHealthIndex, aiBaseBioHealth, loanRate, paymentDelay]);

  const animatedProfit = useAnimatedNumber(stats.profit);

  // FIX #5: Derived risk level for header badge
  const derivedRiskLevel = analysisResult?.summary.riskLevel
    ?? (bioHealthIndex < 55 || weatherEvent2 ? 'HIGH'
      : bioHealthIndex < 75 || !!stressEvent ? 'MEDIUM'
      : 'LOW');
  const riskColor  = derivedRiskLevel === 'HIGH' ? '#ef4444' : derivedRiskLevel === 'MEDIUM' ? '#d97706' : '#059669';
  const riskBg     = derivedRiskLevel === 'HIGH' ? '#fef2f2' : derivedRiskLevel === 'MEDIUM' ? '#fffbeb' : '#edfaf4';
  const riskBorder = derivedRiskLevel === 'HIGH' ? '#fecaca' : derivedRiskLevel === 'MEDIUM' ? '#fde68a' : '#a7f3d0';

  const chartData = {
    labels: ['Extreme Bear', 'Below Avg', 'Expected', 'Good', 'Extreme Bull'],
    datasets: [{
      fill: true, label: 'Probability Density',
      // FIX: Thai supply surge shifts curve left (bearish); high profit shifts it right (bullish)
      data: [
        Math.max(4,  8  + thaiSupply * 0.30),
        Math.max(10, 22 + thaiSupply * 0.40 - (stats.profit > 15000 ? 5 : 0)),
        Math.max(40, 70 + (stats.profit / 6000) - thaiSupply * 0.80),
        Math.max(8,  28 - thaiSupply * 0.20),
        Math.max(3,  8  - thaiSupply * 0.15),
      ],
      borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.08)',
      borderWidth: 2, tension: 0.45,
      pointBackgroundColor: '#059669', pointRadius: 4, pointHoverRadius: 6,
    }],
  };

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#fff', borderColor: '#d1fae5', borderWidth: 1, titleColor: '#059669', bodyColor: '#374151', padding: 12 } },
    scales: {
      y: { display: false },
      x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 11 } }, border: { display: false } },
    },
  };

  const stressEvents = [
    { id: 'port',  title: 'Port Klang 7-Day Logistics Disruption',     loss: -15000, impact: 'Logistics disruption · Direct loss RM 15,000' },
    { id: 'flood', title: 'Extreme Rainfall · Farmland Flooded 3 Days', loss: -22000, impact: '40% yield loss · Estimated loss RM 22,000' },
    { id: 'thai', title: 'Thai Dumping · Market Premium Eliminated', loss: -9500, impact: 'Price drop RM 8/kg · Loss RM 9,500' },
    { id: 'pest', title: 'Pest Outbreak · Emergency Spray', loss: -6000, impact: 'Pesticide costs surge · Loss RM 6,000' },
  ];

  const complianceItems = analysisResult?.compliance ?? [
    { label: 'Invoice XML Format',             status: 'error', detail: 'Missing <TaxTotal> node' },
    { label: 'MyInvois Digital Signature',     status: 'ok',    detail: 'Certificate valid until 2027-03' },
    { label: 'Supplier TIN Verification',      status: 'error', detail: '3 supplier TINs unverified' },
    { label: 'SST Tax Rate Accuracy',          status: 'ok',    detail: 'All compliant with 6% standard rate' },
    { label: 'Compliance Submission Deadline', status: 'warn',  detail: '18 days until Q2 deadline' },
    { label: 'e-Invoicing Version',            status: 'ok',    detail: 'Upgraded to MyInvois 2.1' },
  ];

  const board = [
    { role: 'CFO', icon: '💼', cond: inputs.fert > 650, warn: 'Capital overload: fertilizer ratio exceeds optimal range by 30%. Optimization recommended.', ok: 'Financial structure is sound. Cost allocation is within the safe zone.' },
    { role: 'COO', icon: '⚙️', cond: inputs.labor > 200, warn: 'Overtime hours exceeded. Efficiency decline risk — recommend automated harvesting equipment.', ok: 'Operations efficiency is normal. Labor input is reasonable.' },
    { role: 'CMO', icon: '📊', cond: !!stressEvent, warn: 'External stress event triggered. Recommend immediately activating Singapore pre-sale price lock.', ok: 'Market supply and demand stable. Seize the current shipping window.' },
  ];

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e4ede8', borderRadius: 20, padding: 24 };

  // Terminal animation state for Command Center
  const [terminalStep, setTerminalStep] = useState(0);
  useEffect(() => {
    if (activeTab !== 'page1') return;
    const t = setTimeout(() => setTerminalStep(s => (s + 1) % 5), 2800);
    return () => clearTimeout(t);
  }, [terminalStep, activeTab]);

  const terminalLines = [
    { prefix: '[> Sensory_Agent]', color: '#34d399', text: 'Soil Moisture: 88%. Analyzing weather API...' },
    { prefix: '[> Risk_Agent]', color: '#f97316', text: 'Alert: 85% Storm Probability on Apr 22.' },
    { prefix: '[> Market_Agent]', color: '#a78bfa', text: 'Cross-referencing: Thai supply +15k tons arriving next week. Model predicts 12% price drop.' },
    { prefix: '» Causal Conclusion:', color: '#34d399', text: 'Accelerating harvest by 48H preserves 80% Grade A premium. Generating execution protocol ...' },
  ];

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e4ede8', borderRadius: 20, padding: 24 };

  const npkData = analysisResult?.plantHealth.npk ?? {
    nitrogen:   { ppm: 42,  pct: 72 },
    phosphorus: { ppm: 18,  pct: 56 },
    potassium:  { ppm: 120, pct: 88 },
  };

  // FIX #6 & #7: Pull all env readings from API result
  const envData     = analysisResult?.environment ?? { avgTemp: 30, avgHumidity: 82, windSpeed: 22, pressure: 1008, solarRadiation: 750, co2: 412 };
  const soilPH      = analysisResult?.plantHealth.soilPH      ?? 6.5;
  const soilMoisture = analysisResult?.plantHealth.soilMoisture ?? 82;

  const forecastData = analysisResult?.weatherDetails.forecast ?? [
    { day: 'Today', emoji: '☀️', temp: '32°C', alert: false },
    { day: 'Tue',   emoji: '🌤️', temp: '31°C', alert: false },
    { day: 'Wed',   emoji: '☀️', temp: '30°C', alert: false },
    { day: 'Thu',   emoji: '⛈️', temp: '29°C', alert: true  },
    { day: 'Fri',   emoji: '⛈️', temp: '28°C', alert: true  },
    { day: 'Sat',   emoji: '☀️', temp: '27°C', alert: false },
    { day: 'Sun',   emoji: '☀️', temp: '26°C', alert: false },
  ];

  // ── Shared styles ────────────────────────────────────────────────────────────
  const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Sora:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @keyframes ping      { 75%,100%{ transform:scale(2.2); opacity:0; } }
    @keyframes fadeUp    { from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:translateY(0); } }
    @keyframes fadeIn    { from{ opacity:0; } to{ opacity:1; } }
    @keyframes spin      { to{ transform:rotate(360deg); } }
    @keyframes pulse     { 0%,100%{ opacity:1; } 50%{ opacity:0.5; } }
    @keyframes blink     { 0%,100%{ opacity:1; } 50%{ opacity:0; } }
    @keyframes scanline  { from{ transform:translateY(-100%); } to{ transform:translateY(100vh); } }
    @keyframes barGrow   { from{ width:0; } to{ width:var(--target-w); } }
    .tab-content { animation: fadeUp 0.3s ease forwards; }
    .upload-page { animation: fadeIn 0.4s ease forwards; }
    input[type=range]{ -webkit-appearance:none; width:100%; height:4px; border-radius:2px; background:#e4ede8; outline:none; cursor:pointer; }
    input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:#059669; border:2px solid #fff; box-shadow:0 0 0 3px rgba(5,150,105,0.2); cursor:pointer; transition:box-shadow 0.2s; }
    input[type=range]::-webkit-slider-thumb:hover{ box-shadow:0 0 0 5px rgba(5,150,105,0.25); }
    input[type=number]{ background:#f6faf8; border:1.5px solid #d1e8da; color:#1a3a28; border-radius:12px; padding:12px 16px; font-size:14px; font-family:'JetBrains Mono',monospace; width:100%; outline:none; transition:border-color 0.2s; }
    input[type=number]:focus{ border-color:#059669; }
    ::-webkit-scrollbar{ width:4px; } ::-webkit-scrollbar-track{ background:transparent; } ::-webkit-scrollbar-thumb{ background:#c9ddd2; border-radius:2px; }
    .sim-module-label{ font-size:10px; color:#8aac98; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; margin-bottom:4px; }
    .cursor-blink{ display:inline-block; width:8px; height:14px; background:#34d399; margin-left:2px; animation:blink 1s step-end infinite; vertical-align:middle; }
    .upload-zone-hover:hover{ border-color:#059669 !important; background:rgba(5,150,105,0.03) !important; }
  `;

  // ═══════════════════════════════════════════════════════════════════════════
  // ── UPLOAD / LANDING PAGE ─────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  if (currentPage === 'upload') {
    return (
      <>
        <style>{globalStyles}</style>
        <div className="upload-page" style={{
          minHeight: '100vh', background: '#f2f7f4',
          fontFamily: "'Sora',sans-serif", color: '#1a3a28',
          display: 'flex', flexDirection: 'column',
        }}>

          {/* ── Header ── */}
          <header style={{ background: '#fff', borderBottom: '1px solid #e4ede8', padding: '0 40px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#34d399,#059669)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Leaf size={17} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f2d1e', lineHeight: 1 }}>BioFin <span style={{ color: '#059669' }}>Oracle</span></div>
                <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>Smart Agriculture Decision Engine v2.0</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#edfaf4', border: '1px solid #a7f3d0', borderRadius: 20, padding: '6px 14px' }}>
              <Database size={12} color="#059669" />
              <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>Data Import Portal</span>
            </div>
          </header>

          {/* ── Hero ── */}
          <div style={{ background: 'linear-gradient(160deg, #0f2d1e 0%, #1a4a30 60%, #0d3320 100%)', padding: '52px 40px 48px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: -80, right: -80, width: 340, height: 340, background: 'radial-gradient(circle, rgba(52,211,153,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -60, left: '30%', width: 260, height: 260, background: 'radial-gradient(circle, rgba(5,150,105,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ maxWidth: 960, margin: '0 auto', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <PulsingDot color="#34d399" />
                <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const }}>Step 1 of 2 — Upload Farm Data</span>
              </div>
              <h1 style={{ fontSize: 42, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 16 }}>
                Upload Your Farm Data<br />
                <span style={{ color: '#34d399' }}>to Activate AI Analysis</span>
              </h1>
              <p style={{ fontSize: 15, color: '#a1c4a1', lineHeight: 1.7, maxWidth: 580, marginBottom: 28 }}>
                Import your plant growth records, environmental sensor data, historical weather logs, and sales pricing history. BioFin Oracle will analyse every data point and generate a full farm intelligence report.
              </p>
              <div style={{ display: 'flex', gap: 32 }}>
                {[
                  { label: 'Data types supported', val: 'CSV & JSON' },
                  { label: 'Analysis dimensions',  val: '14+' },
                  { label: 'AI agents deployed',   val: '4' },
                  { label: 'File slots',            val: '4' },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 800, color: '#34d399', lineHeight: 1 }}>{val}</div>
                    <div style={{ fontSize: 11, color: '#4d7a62', fontWeight: 500, marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Upload Body ── */}
          <div style={{ flex: 1, padding: '40px', maxWidth: 1060, margin: '0 auto', width: '100%' }}>

            {/* FIX #9: 4-slot 2x2 grid (was 3-column) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginBottom: 32 }}>
              <UploadZone
                id="plantGrowth"
                icon={<Sprout size={20} color="#059669" />}
                title="Plant Growth Conditions"
                description="Fertilizer, irrigation, labor, soil metrics per date"
                hint={`date\nfertilizer_kg_ha\nirrigation_mm\nirrigation_frequency\nlabor_hours\nsoil_ph\nsoil_moisture\nnitrogen_ppm\nphosphorus_ppm\npotassium_ppm`}
                accepted=".csv,.json"
                file={plantFile}
                onFile={setPlantFile}
                dragOver={dragOver === 'plant'}
                onDragOver={() => setDragOver('plant')}
                onDragLeave={() => setDragOver(null)}
              />
              <UploadZone
                id="envVars"
                icon={<Thermometer size={20} color="#3b82f6" />}
                title="Environment Variables"
                description="Temperature, humidity, solar, CO₂ readings"
                hint={`date\ntemperature_c\nhumidity_pct\nsolar_radiation\nwind_speed\nco2_ppm\nbarometric_pressure`}
                accepted=".csv,.json"
                file={envFile}
                onFile={setEnvFile}
                dragOver={dragOver === 'env'}
                onDragOver={() => setDragOver('env')}
                onDragLeave={() => setDragOver(null)}
              />
              <UploadZone
                id="weatherRecords"
                icon={<CloudRain size={20} color="#7c3aed" />}
                title="Weather Records"
                description="Rainfall, temperature range, wind, storm flags"
                hint={`date\nrainfall_mm\ntemp_max\ntemp_min\nwind_speed_kmh\nstorm_warning`}
                accepted=".csv,.json"
                file={weatherFile}
                onFile={setWeatherFile}
                dragOver={dragOver === 'weather'}
                onDragOver={() => setDragOver('weather')}
                onDragLeave={() => setDragOver(null)}
              />
              {/* FIX #9: New sales history upload zone */}
              <UploadZone
                id="salesHistory"
                icon={<TrendingUp size={20} color="#d97706" />}
                title="Sales & Pricing History"
                description="Historical price per kg, volume, and channel data"
                hint={`date\nprice_per_kg\nvolume_kg\nchannel\nrevenue`}
                accepted=".csv,.json"
                file={salesFile}
                onFile={setSalesFile}
                dragOver={dragOver === 'sales'}
                onDragOver={() => setDragOver('sales')}
                onDragLeave={() => setDragOver(null)}
              />
            </div>

            {/* Info callout */}
            <div style={{ background: '#fff', border: '1px solid #e4ede8', borderRadius: 16, padding: '18px 24px', display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 32 }}>
              <div style={{ width: 36, height: 36, background: '#eff6ff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Activity size={16} color="#3b82f6" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a3a28', marginBottom: 5 }}>All files are optional — but more data means better insights</div>
                <p style={{ fontSize: 12.5, color: '#6b8f7e', lineHeight: 1.6, margin: 0 }}>
                  You can proceed with zero, one, or all four files. BioFin Oracle will use sensible defaults for missing data and clearly indicate which metrics are estimated vs data-driven. The new <strong style={{ color: '#d97706' }}>Sales History</strong> file unlocks price volatility analysis and market arbitrage recommendations.
                </p>
              </div>
              <div style={{ flexShrink: 0, background: '#f6faf8', border: '1px solid #e4ede8', borderRadius: 12, padding: '8px 16px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 800, color: '#059669' }}>
                  {[plantFile, envFile, weatherFile, salesFile].filter(Boolean).length}
                  <span style={{ fontSize: 13, color: '#8aac98', marginLeft: 2 }}>/4</span>
                </div>
                <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginTop: 2 }}>Files ready</div>
              </div>
            </div>

            {/* API error banner */}
            {apiError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 24 }}>
                <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12.5, color: '#991b1b', lineHeight: 1.6 }}>
                  <strong>API error:</strong> {apiError}<br />
                  <span style={{ opacity: 0.8 }}>The dashboard will open with default values. Ensure the /api/analyze route is configured in your Next.js app.</span>
                </div>
              </div>
            )}

            {/* Processing overlay */}
            {isProcessing && (
              <div style={{ background: '#fff', border: '1px solid #a7f3d0', borderRadius: 20, padding: '28px 32px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 28 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid #e4ede8', borderTop: '3px solid #059669', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2d1e', marginBottom: 10 }}>{processingSteps[processingStep]}</div>
                  <div style={{ height: 6, background: '#e4ede8', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${((processingStep + 1) / processingSteps.length) * 100}%`, background: 'linear-gradient(90deg, #059669, #34d399)', borderRadius: 3, transition: 'width 0.35s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#8aac98', fontFamily: "'JetBrains Mono',monospace" }}>
                    <span>Initializing</span>
                    <span style={{ color: '#059669', fontWeight: 700 }}>{Math.round(((processingStep + 1) / processingSteps.length) * 100)}%</span>
                    <span>Complete</span>
                  </div>
                </div>
              </div>
            )}

            {/* Execute button */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={handleExecute}
                disabled={isProcessing}
                style={{
                  background: isProcessing ? '#e4ede8' : 'linear-gradient(135deg, #059669, #047857)',
                  color: isProcessing ? '#8aac98' : '#fff',
                  fontWeight: 800, fontSize: 16, padding: '18px 56px',
                  borderRadius: 16, border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer',
                  fontFamily: "'Sora',sans-serif",
                  display: 'flex', alignItems: 'center', gap: 12,
                  boxShadow: isProcessing ? 'none' : '0 8px 32px rgba(5,150,105,0.3)',
                  transition: 'all 0.25s', letterSpacing: '-0.01em',
                }}
              >
                {isProcessing
                  ? <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</>
                  : <><Play size={18} /> Execute Analysis &amp; Enter Dashboard</>
                }
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <span style={{ fontSize: 11.5, color: '#8aac98' }}>
                Your data is processed server-side and never stored permanently. &nbsp;•&nbsp; Supported: CSV (comma-separated) and JSON arrays.
              </span>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Sora:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes ping { 75%,100%{ transform:scale(2.2); opacity:0; } }
        @keyframes fadeUp { from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:translateY(0); } }
        @keyframes spin { to{ transform:rotate(360deg); } }
        @keyframes pulse { 0%,100%{ opacity:1; } 50%{ opacity:0.5; } }
        @keyframes blink { 0%,100%{ opacity:1; } 50%{ opacity:0; } }
        .tab-content { animation: fadeUp 0.3s ease forwards; }
        input[type=range]{ -webkit-appearance:none; width:100%; height:4px; border-radius:2px; background:#e4ede8; outline:none; cursor:pointer; }
        input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:#059669; border:2px solid #fff; box-shadow:0 0 0 3px rgba(5,150,105,0.2); cursor:pointer; transition:box-shadow 0.2s; }
        input[type=range]::-webkit-slider-thumb:hover{ box-shadow:0 0 0 5px rgba(5,150,105,0.25); }
        input[type=number]{ background:#f6faf8; border:1.5px solid #d1e8da; color:#1a3a28; border-radius:12px; padding:12px 16px; font-size:14px; font-family:'JetBrains Mono',monospace; width:100%; outline:none; transition:border-color 0.2s; }
        input[type=number]:focus{ border-color:#059669; }
        ::-webkit-scrollbar{ width:4px; } ::-webkit-scrollbar-track{ background:transparent; } ::-webkit-scrollbar-thumb{ background:#c9ddd2; border-radius:2px; }
        .sim-module-label{ font-size:10px; color:#8aac98; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; margin-bottom:4px; }
        .cursor-blink{ display:inline-block; width:8px; height:14px; background:#34d399; margin-left:2px; animation:blink 1s step-end infinite; vertical-align:middle; }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#f2f7f4', color:'#1a3a28', fontFamily:"'Sora',sans-serif", overflow:'hidden' }}>

        {/* Header */}
        <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 32px', height:60, background:'#fff', borderBottom:'1px solid #e4ede8', zIndex:20, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:34, height:34, background:'linear-gradient(135deg,#34d399,#059669)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Leaf size={17} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:800, letterSpacing:'-0.02em', color:'#0f2d1e', lineHeight:1 }}>BioFin <span style={{ color:'#059669' }}>Oracle</span></div>
              <div style={{ fontSize:10, color:'#8aac98', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', marginTop:2 }}>Smart Agriculture Decision Engine v2.0</div>
            </div>
            <div style={{ marginLeft:8, display:'flex', alignItems:'center', gap:6, background:'#edfaf4', border:'1px solid #a7f3d0', borderRadius:20, padding:'4px 12px' }}>
              <PulsingDot /><span style={{ fontSize:11, color:'#059669', fontWeight:700 }}>Live Monitoring</span>
            </div>
            {/* FIX #3: Back button always visible, not gated on analysisResult */}
            <button
              onClick={() => setCurrentPage('upload')}
              style={{ marginLeft: 8, background: 'none', border: '1px solid #d1e8da', borderRadius: 20, padding: '4px 12px', fontSize: 11, color: '#4d7a62', fontWeight: 600, cursor: 'pointer', fontFamily: "'Sora',sans-serif", display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Upload size={11} /> Re-upload Data
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {analysisResult && (
              <div style={{ background: '#f6faf8', border: '1px solid #e4ede8', borderRadius: 12, padding: '6px 14px', display: 'flex', gap: 6, alignItems: 'center' }}>
                <Database size={12} color="#8aac98" />
                <span style={{ fontSize: 11, color: '#4d7a62', fontWeight: 600 }}>{analysisResult.summary.totalDataPoints} records loaded</span>
              </div>
            )}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Current Time</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 600, color: '#4d7a62' }}>
                {hasMounted ? now.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "--:--:--"}
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: '#e4ede8' }} />
            {/* FIX #5: Risk Index badge */}
            <div style={{ textAlign: 'center', background: riskBg, border: `1px solid ${riskBorder}`, borderRadius: 12, padding: '7px 14px' }}>
              <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Risk Index</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700, color: riskColor, lineHeight: 1.2 }}>{derivedRiskLevel}</div>
            </div>
            <div style={{ width: 1, height: 28, background: '#e4ede8' }} />
            <div style={{ textAlign: 'center', background: stats.runway < 100 ? '#fffbeb' : '#edfaf4', border: `1px solid ${stats.runway < 100 ? '#fde68a' : '#a7f3d0'}`, borderRadius: 12, padding: '7px 16px' }}>
              <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cash Runway</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 19, fontWeight: 700, color: hasMounted && stats.runway < 100 ? '#d97706' : '#059669', lineHeight: 1.2 }}>
                {hasMounted ? stats.runway : "---"}<span style={{ fontSize: 11, marginLeft: 2, opacity: 0.6 }}>days</span>
              </div>
            </div>
          </div>
          </div>
        </header>

        {/* Nav */}
        <nav style={{ display:'flex', background:'#fff', borderBottom:'1px solid #e4ede8', padding:'0 32px', flexShrink:0 }}>
          {[
            { id: 'page1', label: '1. Command Center',      Icon: Zap        },
            { id: 'page2', label: '2. Simulation Sandbox',  Icon: BarChart3  },
            { id: 'page3', label: '3. Global Operations',   Icon: Globe      },
            { id: 'page4', label: '4. SME Compliance & ROI', Icon: ShieldCheck },
          ].map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              display:'flex', alignItems:'center', gap:7, padding:'13px 18px',
              background:activeTab===id?'#059669':'none',
              border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
              fontFamily:"'Sora',sans-serif", transition:'all 0.2s',
              color:activeTab===id?'#fff':'#6b8f7e',
              borderRadius: activeTab===id ? 50 : 0,
              borderBottom: activeTab===id ? 'none' : '2px solid transparent',
              marginBottom: activeTab===id ? 0 : -1,
              marginTop: activeTab===id ? 6 : 0,
            }}>
              <Icon size={14} />{label}
            </button>
          ))}
        </nav>

        {/* Main */}
        <main style={{ flex:1, overflowY:'auto', padding:'26px 32px' }}>

          {/* ═══════════════════ PAGE 1 — COMMAND CENTER ═══════════════════ */}
          {activeTab === 'page1' && (
            <div className="tab-content" style={{ maxWidth:1100, margin:'0 auto', display:'flex', flexDirection:'column', gap:24 }}>

              {/* AI recommendation banner */}
              {analysisResult && (
                <div style={{ background: '#edfaf4', border: '1px solid #a7f3d0', borderRadius: 16, padding: '16px 22px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 36, height: 36, background: '#d1fae5', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Zap size={16} color="#059669" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 4 }}>AI Analysis — {analysisResult.summary.riskLevel} Risk · {analysisResult.summary.totalDataPoints} records processed</div>
                    <p style={{ fontSize: 13.5, color: '#065f46', lineHeight: 1.6, margin: 0 }}>{analysisResult.recommendation}</p>
                  </div>
                </div>
              )}

              {/* SECTION 1: Critical Action */}
              <div style={{ background: '#fff', border: '1px solid #c6e6d4', borderRadius: 22, padding: '36px 40px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -60, right: -60, width: 260, height: 260, background: 'radial-gradient(circle,rgba(5,150,105,0.05) 0%,transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                      <PulsingDot color="#059669" />
                      <span style={{ fontSize:11, color:'#059669', fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase' as const }}>Critical Action Recommended</span>
                    </div>
                    <h2 style={{ fontSize:52, fontWeight:800, letterSpacing:'-0.03em', color:'#065f46', lineHeight:1.05, marginBottom:32 }}>
                      Advance<br />Harvest<br />by 48 Hours
                    </h2>
                    <button
                      onClick={() => setActionExecuted(true)}
                      style={{
                        background: actionExecuted ? '#edfaf4' : '#059669',
                        color: actionExecuted ? '#059669' : '#fff',
                        fontWeight:700, fontSize:16, padding:'16px 36px', borderRadius:14,
                        border: actionExecuted ? '1.5px solid #a7f3d0' : 'none',
                        cursor:'pointer', fontFamily:"'Sora',sans-serif",
                        display:'inline-flex', alignItems:'center', gap:10, transition:'all 0.25s',
                        boxShadow: actionExecuted ? 'none' : '0 4px 20px rgba(5,150,105,0.3)',
                      }}
                    >
                      {actionExecuted
                        ? <><CheckCircle2 size={17} /> Order Dispatched</>
                        : <><ChevronRight size={17} /> Execute Logistics & Labor Dispatch</>}
                    </button>
                  </div>

                  {/* Right — Agentic Decision Ledger terminal */}
                  <div style={{ width:480, flexShrink:0, background:'#0f1f17', borderRadius:18, padding:'22px 26px', fontFamily:"'JetBrains Mono',monospace" }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, paddingBottom:16, borderBottom:'1px solid #1e3a2a' }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#34d399' }}>Agentic Decision Ledger</span>
                      <span style={{ fontSize:11, color:'#4d7a62' }}>Node: Deterministic Causal</span>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                      {terminalLines.map((line, i) => (
                        <div key={i} style={{
                          fontSize:12.5, lineHeight:1.7, color:'#a1c4a1',
                          opacity: i < terminalStep ? 1 : 0,
                          transition:'opacity 0.5s ease',
                          borderTop: i === 3 ? '1px solid #1e3a2a' : 'none',
                          paddingTop: i === 3 ? 14 : 0,
                        }}>
                          <span style={{ color:line.color, fontWeight:700 }}>{line.prefix}</span>{' '}
                          <span style={{ color: i === 3 ? '#34d399' : '#c9ddd2' }}>{line.text}</span>
                          {i === terminalStep - 1 && i === terminalLines.length - 1 && (
                            <span className="cursor-blink" />
                          )}
                        </div>
                      ))}
                      {terminalStep === 0 && (
                        <div style={{ fontSize:12, color:'#4d7a62' }}>Initializing agents<span className="cursor-blink" /></div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scroll divider */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'4px 0' }}>
                <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase' as const, color:'#8aac98' }}>Scroll for Deep Analytics</span>
                <ChevronDown size={16} color="#8aac98" />
              </div>

              {/* ── SECTION 2: Biological & Soil Health ── */}
              <div style={{ background:'#fff', border:'1px solid #e4ede8', borderRadius:22, padding:'32px 36px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:28 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    {/* Sparkle icon via SVG */}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
                    </svg>
                    <span style={{ fontSize:22, fontWeight:800, color:'#0f2d1e', letterSpacing:'-0.02em' }}>Biological & Soil Health</span>
                  </div>
                  <div style={{ background:'#edfaf4', border:'1px solid #a7f3d0', borderRadius:50, padding:'6px 18px', fontSize:13, fontWeight:700, color:'#059669' }}>
                    Status: Optimal
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:36 }}>
                  {/* NPK Nutrient Stratification */}
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#1a3a28', marginBottom:20 }}>NPK Nutrient Stratification</div>
                    {[
                      { label:'Nitrogen (N) - 42 ppm', pct:72, status:'Perfect', statusColor:'#059669' },
                      { label:'Phosphorus (P) - 18 ppm', pct:56, status:'Good', statusColor:'#059669' },
                      { label:'Potassium (K) - 120 ppm', pct:88, status:'Optimal (Fruiting Phase)', statusColor:'#059669' },
                    ].map(({ label, pct, status, statusColor }) => (
                      <div key={label} style={{ marginBottom:22 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                          <span style={{ fontSize:13, color:'#4d7a62', fontWeight:500 }}>{label}</span>
                          <span style={{ fontSize:12, fontWeight:700, color:statusColor }}>{status}</span>
                        </div>
                        <div style={{ height:8, background:'#e4ede8', borderRadius:4, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:'#059669', borderRadius:4, transition:'width 0.6s ease' }} />
                        </div>
                      </div>
                    ))}

                    {/* FIX #6: Soil pH & Moisture display (was missing entirely) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                      <div style={{ background: '#f6faf8', border: `1px solid ${soilPH >= 5.8 && soilPH <= 7.0 ? '#d1fae5' : '#fde68a'}`, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 6 }}>Soil pH</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 800, color: soilPH >= 5.8 && soilPH <= 7.0 ? '#059669' : '#d97706' }}>{soilPH.toFixed(1)}</div>
                        <div style={{ fontSize: 10, color: '#8aac98', marginTop: 4 }}>Target: 5.8–7.0</div>
                      </div>
                      <div style={{ background: '#f6faf8', border: `1px solid ${soilMoisture >= 70 && soilMoisture <= 90 ? '#d1fae5' : '#fde68a'}`, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 6 }}>Soil Moisture</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 800, color: soilMoisture >= 70 && soilMoisture <= 90 ? '#059669' : '#d97706' }}>{soilMoisture}%</div>
                        <div style={{ fontSize: 10, color: '#8aac98', marginTop: 4 }}>Target: 70–90%</div>
                      </div>
                    </div>
                  </div>

                  {/* Canopy & Drone Analytics */}
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#1a3a28', marginBottom:20 }}>Canopy & Drone Analytics</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
                      <div style={{ background:'#f6faf8', border:'1px solid #e4ede8', borderRadius:14, padding:'18px', textAlign:'center' }}>
                        <div style={{ fontSize:11, color:'#8aac98', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' as const, marginBottom:8 }}>Chlorophyll Index</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:32, fontWeight:800, color:'#059669', lineHeight:1 }}>48.2</div>
                        <div style={{ fontSize:11, color:'#8aac98', marginTop:6 }}>+2.1 vs last month</div>
                      </div>
                      <div style={{ background:'#f6faf8', border:'1px solid #e4ede8', borderRadius:14, padding:'18px', textAlign:'center' }}>
                        <div style={{ fontSize:11, color:'#8aac98', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' as const, marginBottom:8 }}>Root Moisture Depth</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:32, fontWeight:800, color:'#3b82f6', lineHeight:1 }}>45 cm</div>
                        <div style={{ fontSize:11, color:'#8aac98', marginTop:6 }}>Optimal Saturation</div>
                      </div>
                    </div>
                    <div style={{ background:'#edfaf4', border:'1px solid #a7f3d0', borderRadius:14, padding:'16px 18px', display:'flex', alignItems:'flex-start', gap:14 }}>
                      <div style={{ width:34, height:34, background:'#d1fae5', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <CheckCircle2 size={16} color="#059669" />
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#0f2d1e', marginBottom:5 }}>Thermal Drone Scan Complete</div>
                        <div style={{ fontSize:12, color:'#4d7a62', lineHeight:1.6 }}>Zero thermal anomalies detected. No evidence of Phytophthora (Stem Canker) in Sector A.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── SECTION 3: Meteorological Pulse ── */}
              <div style={{ background:'#fff', border:'1px solid #e4ede8', borderRadius:22, padding:'32px 36px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:28 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <Cloud size={22} color="#d97706" />
                    <span style={{ fontSize:22, fontWeight:800, color:'#d97706', letterSpacing:'-0.02em' }}>Meteorological Pulse</span>
                  </div>
                  <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:50, padding:'6px 18px', fontSize:13, fontWeight:700, color:'#92400e' }}>
                    Alert: Severe Weather ETA
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:36 }}>
                  {/* 7-Day Forecast */}
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#4d7a62', marginBottom:16 }}>7-Day Localized Micro-Climate Forecast</div>
                    <div style={{ display:'flex', gap:8, marginBottom:20 }}>
                      {[
                        { day:'Today', emoji:'☀️', temp:'32°C', alert:false },
                        { day:'Tue',   emoji:'🌤️', temp:'31°C', alert:false },
                        { day:'Wed',   emoji:'☀️', temp:'30°C', alert:false },
                        { day:'Thu',   emoji:'⛈️', temp:'29°C', alert:true  },
                        { day:'Fri',   emoji:'⛈️', temp:'28°C', alert:true  },
                        { day:'Sat',   emoji:'☀️', temp:'27°C', alert:false },
                        { day:'Sun',   emoji:'☀️', temp:'26°C', alert:false },
                      ].map(({ day, emoji, temp, alert }) => (
                        <div key={day} style={{
                          flex:1, textAlign:'center', padding:'10px 6px', borderRadius:12,
                          border:`1.5px solid ${alert?'#fde68a':'#e4ede8'}`,
                          background:alert?'#fffbeb':'#f6faf8',
                        }}>
                          <div style={{ fontSize:10, color:alert?'#92400e':'#8aac98', fontWeight:600, marginBottom:5 }}>{day}</div>
                          <div style={{ fontSize:18, marginBottom:5 }}>{emoji}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:alert?'#d97706':'#1a3a28' }}>{temp}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:14, padding:'16px 18px', display:'flex', gap:12, alignItems:'flex-start' }}>
                      <span style={{ fontSize:18, flexShrink:0 }}>⚠️</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#92400e', marginBottom:5 }}>Squall Line Trajectory Locked</div>
                        <div style={{ fontSize:12, color:'#78350f', lineHeight:1.6 }}>High probability of extreme wind sheer (24+ km/h) causing mass fruit-drop on Thursday evening.</div>
                      </div>
                    </div>
                  </div>

                  {/* Live Sensor Telemetry */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#4d7a62', marginBottom: 16 }}>Live Sensor Telemetry</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {/* FIX #7: Added Humidity and CO2 from API data */}
                      {[
                        { label: 'Wind Speed',          value: `${envData.windSpeed} km/h`,       sub: 'Rising',   valueColor: '#d97706', borderBottom: true  },
                        { label: 'Barometric Pressure', value: `${envData.pressure} hPa`,          sub: 'Dropping', valueColor: '#1a3a28', borderBottom: true  },
                        { label: 'Humidity',            value: `${envData.avgHumidity}%`,          sub: '',         valueColor: '#3b82f6', borderBottom: true  },
                        { label: 'CO₂ Concentration',  value: `${envData.co2} ppm`,               sub: envData.co2 > 450 ? 'Elevated' : 'Normal', valueColor: envData.co2 > 450 ? '#d97706' : '#059669', borderBottom: true },
                        { label: 'Solar Radiation',    value: `${envData.solarRadiation} W/m²`,   sub: '',         valueColor: '#059669', borderBottom: false },
                      ].map(({ label, value, sub, valueColor, borderBottom }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: borderBottom ? '1px solid #f0f7f3' : 'none' }}>
                          <span style={{ fontSize: 13, color: '#8aac98', fontWeight: 500 }}>{label}</span>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 800, color: valueColor }}>{value}</span>
                            {sub && <span style={{ fontSize: 12, color: '#8aac98' }}>({sub})</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── SECTION 4: Financial Market & Trade ── */}
              <div style={{ background:'#fff', border:'1px solid #e4ede8', borderRadius:22, padding:'32px 36px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:28, paddingBottom:20, borderBottom:'1px solid #f0f7f3' }}>
                  <TrendingUp size={22} color="#1a3a28" />
                  <span style={{ fontSize:22, fontWeight:800, color:'#0f2d1e', letterSpacing:'-0.02em' }}>Financial Market & Trade</span>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:40 }}>
                  {/* Left */}
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#4d7a62', marginBottom:14 }}>Export vs Local Demand</div>
                    {/* Split bar */}
                    <div style={{ height:40, borderRadius:10, overflow:'hidden', display:'flex', marginBottom:20 }}>
                      <div style={{ flex:3, background:'#059669', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <span style={{ color:'#fff', fontSize:13, fontWeight:700 }}>Export (China/SG) 75%</span>
                      </div>
                      <div style={{ flex:1, background:'#a7f3d0', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <span style={{ color:'#065f46', fontSize:13, fontWeight:700 }}>Domestic 25%</span>
                      </div>
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                      <div style={{ background:'#f6faf8', border:'1px solid #e4ede8', borderRadius:14, padding:'16px' }}>
                        <div style={{ fontSize:10, color:'#8aac98', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' as const, marginBottom:8 }}>Exchange Rate (MYR/USD)</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:24, fontWeight:800, color:'#1a3a28' }}>4.72</div>
                        <div style={{ fontSize:12, color:'#059669', fontWeight:600, marginTop:4 }}>↑ Favorable</div>
                      </div>
                      <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:14, padding:'16px' }}>
                        <div style={{ fontSize:10, color:'#8aac98', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' as const, marginBottom:8 }}>Competitor Volume (Thai)</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:24, fontWeight:800, color:'#d97706' }}>+15k tons</div>
                        <div style={{ fontSize:12, color:'#8aac98', fontWeight:500, marginTop:4 }}>ETA 5d</div>
                      </div>
                    </div>
                    {/* Sales insights from API when available */}
                    {analysisResult?.salesInsights?.hasData && (
                      <div style={{ marginTop: 14, background: analysisResult.salesInsights.priceVolatilityPct > 25 ? '#fffbeb' : '#edfaf4', border: `1px solid ${analysisResult.salesInsights.priceVolatilityPct > 25 ? '#fde68a' : '#a7f3d0'}`, borderRadius: 14, padding: '14px 16px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', marginBottom: 6 }}>📊 Sales History Insights</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#8aac98' }}>Avg Price</div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: '#1a3a28', fontSize: 14 }}>RM {analysisResult.salesInsights.avgPricePerKg}/kg</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#8aac98' }}>Volatility</div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: analysisResult.salesInsights.priceVolatilityPct > 25 ? '#d97706' : '#059669', fontSize: 14 }}>{analysisResult.salesInsights.priceVolatilityPct}%</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#8aac98' }}>Top Channel</div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: '#3b82f6', fontSize: 12 }}>{analysisResult.salesInsights.dominantChannel}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 52, fontWeight: 800, color: '#059669', lineHeight: 1 }}>RM {analysisResult?.financial.pricePerKg ?? 55}</span>
                      <span style={{ fontSize: 16, color: '#4d7a62', fontWeight: 600 }}>/ kg (Farm-Gate)</span>
                    </div>
                    <div style={{ borderLeft:'3px solid #059669', paddingLeft:12, marginBottom:24 }}>
                      <p style={{ fontSize:13, color:'#4d7a62', lineHeight:1.6 }}>Price currently holding, but massive downward pressure expected by weekend due to Thai supply dump.</p>
                    </div>
                    {/* Bar chart (SVG) */}
                    <div style={{ position:'relative', height:90 }}>
                      <div style={{ display:'flex', gap:5, height:80, alignItems:'flex-end', paddingBottom:0 }}>
                        {[
                          { month:'Jan', h:28 }, { month:'', h:34 }, { month:'', h:32 },
                          { month:'Feb', h:42 }, { month:'', h:44 }, { month:'', h:40 },
                          { month:'Mar', h:52 }, { month:'', h:56 }, { month:'', h:54 },
                          { month:'Apr', h:80, now:true },
                        ].map((b, i) => (
                          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end' }}>
                            <div style={{
                              width:'100%', height:`${b.h}%`,
                              background: b.now ? '#059669' : '#a7f3d0',
                              borderRadius:'4px 4px 0 0',
                              transition:'height 0.6s ease',
                            }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:10, color:'#8aac98' }}>
                        <span>Jan</span><span>Feb</span><span>Mar</span><span style={{ color:'#059669', fontWeight:700 }}>Apr (Now)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 5: Transparency & Evidence Feed (FIX #8 — entirely new section) */}
              <div style={{ background: '#fff', border: '1px solid #e4ede8', borderRadius: 22, padding: '32px 36px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                  <Radio size={20} color="#7c3aed" />
                  <span style={{ fontSize: 22, fontWeight: 800, color: '#0f2d1e', letterSpacing: '-0.02em' }}>Transparency &amp; Evidence Feed</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 20, padding: '4px 12px' }}>
                    <PulsingDot color="#7c3aed" />
                    <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>Live Intelligence Channels</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                  {/* Channel 1: News Aggregation — live Tavily results when available */}
                  <div style={{ background: '#fafcfb', border: '1px solid #e4ede8', borderRadius: 16, padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <div style={{ width: 30, height: 30, background: '#eff6ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Newspaper size={14} color="#3b82f6" />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1a3a28' }}>Market News Aggregation</span>
                      {analysisResult?.marketNews?.length ? (
                        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#059669', background: '#edfaf4', border: '1px solid #a7f3d0', borderRadius: 10, padding: '2px 7px' }}>LIVE</span>
                      ) : (
                        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#8aac98', background: '#f6faf8', border: '1px solid #e4ede8', borderRadius: 10, padding: '2px 7px' }}>DEMO</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {(analysisResult?.marketNews?.length
                        ? analysisResult.marketNews.slice(0, 3).map(n => ({
                            tag:   `🌐 ${new URL(n.url).hostname.replace('www.', '')}`,
                            text:  n.snippet,
                            color: '#3b82f6',
                            bg:    '#eff6ff',
                            url:   n.url,
                          }))
                        : [
                            { tag: '🌐 Reuters', text: 'Thai durian supply surplus detected — estimated 15k extra tons entering Singapore market by Friday.', color: '#d97706', bg: '#fffbeb', url: null },
                            { tag: '📰 FAMA',    text: 'MyHargaTani shows local Musang King averaging RM 54–58/kg this week, within seasonal norms.',          color: '#059669', bg: '#edfaf4', url: null },
                            { tag: '🏦 DOSM',    text: 'Macro export data: Malaysian agricultural exports up 8.2% YoY in Q1 2026.',                            color: '#3b82f6', bg: '#eff6ff', url: null },
                          ]
                      ).map((item, i) => (
                        <div key={i} style={{ background: item.bg, borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: item.color }}>{item.tag}</span>
                            {item.url && (
                              <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 9, color: '#8aac98', textDecoration: 'none', fontWeight: 600 }}>↗ Source</a>
                            )}
                          </div>
                          <p style={{ fontSize: 11.5, color: '#4d7a62', lineHeight: 1.6, margin: 0 }}>{item.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Channel 2: Sensor Stream */}
                  <div style={{ background: '#fafcfb', border: '1px solid #e4ede8', borderRadius: 16, padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <div style={{ width: 30, height: 30, background: '#edfaf4', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Activity size={14} color="#059669" />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1a3a28' }}>Orchard Sensor Stream</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {[
                        { label: 'Soil Moisture (Sector A)', val: `${soilMoisture}%`, alert: soilMoisture < 65 || soilMoisture > 92 },
                        { label: 'Soil pH (Sector A)',       val: soilPH.toFixed(1),  alert: soilPH < 5.8 || soilPH > 7.0 },
                        { label: 'CO₂ Concentration',       val: `${envData.co2} ppm`, alert: envData.co2 > 450 },
                        { label: 'Canopy Humidity',         val: `${envData.avgHumidity}%`, alert: false },
                        { label: 'Ambient Temp',            val: `${envData.avgTemp}°C`, alert: envData.avgTemp > 36 },
                        { label: 'Wind Speed',              val: `${envData.windSpeed} km/h`, alert: envData.windSpeed > 24 },
                      ].map(({ label, val, alert }, i, arr) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid #f0f7f3' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: alert ? '#d97706' : '#059669', flexShrink: 0 }} />
                            <span style={{ fontSize: 11.5, color: '#6b8f7e' }}>{label}</span>
                          </div>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: alert ? '#d97706' : '#1a3a28' }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Channel 3: Regulatory Alerts */}
                  <div style={{ background: '#fafcfb', border: '1px solid #e4ede8', borderRadius: 16, padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <div style={{ width: 30, height: 30, background: '#fffbeb', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Bell size={14} color="#d97706" />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1a3a28' }}>Regulatory Alerts</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[
                        { tag: '🇪🇺 EU EUDR',  severity: 'warn',  text: 'New deforestation regulation (EUDR) applies to Malaysian tropical fruit exports from Jan 2026. Traceability documentation required.', color: '#d97706', bg: '#fffbeb' },
                        { tag: '🏛️ MOA',       severity: 'info',  text: 'Ministry of Agriculture announces updated MyGAP certification scheme — renewal applications open until May 31.', color: '#3b82f6', bg: '#eff6ff' },
                        { tag: '📋 LHDN',      severity: 'warn',  text: 'e-Invoicing Phase 3 mandatory for all SMEs with turnover above RM 500k by August 2026. Compliance deadline: 18 days.', color: '#d97706', bg: '#fffbeb' },
                      ].map((item, i) => (
                        <div key={i} style={{ background: item.bg, borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.tag}</div>
                          <p style={{ fontSize: 11.5, color: '#4d7a62', lineHeight: 1.6, margin: 0 }}>{item.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ═══════════════════ PAGE 2 — SIMULATION SANDBOX ═══════════════════ */}
          {activeTab === 'page2' && (
            <div className="tab-content" style={{ maxWidth:1200, margin:'0 auto', display:'flex', flexDirection:'column', gap:20 }}>

              {/* Row 1: Twin + Chart */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
                  <div style={card}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:24 }}>
                      <Calculator size={16} color="#059669" />
                      <span style={{ fontSize:14, fontWeight:700, color:'#0f2d1e' }}>Digital Twin Simulation</span>
                    </div>
                    {[
                      { key: 'fert'  as const, label: 'Fertilizer Input',  unit: 'kg/ha', min: 200, max: 800, zone: [300, 650] as [number,number] },
                      { key: 'labor' as const, label: 'Extra Labor Hours', unit: 'hours', min: 0,   max: 300, zone: [0, 200]   as [number,number] },
                    ].map(({ key, label, unit, min, max, zone }) => {
                      const val = inputs[key];
                      const inZone = val >= zone[0] && val <= zone[1];
                      return (
                        <div key={key} style={{ marginBottom:24 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:11 }}>
                            <label style={{ fontSize:13, fontWeight:600, color:'#4d7a62' }}>{label} <span style={{ opacity:0.6 }}>({unit})</span></label>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:700, color:inZone?'#059669':'#d97706' }}>{val}</span>
                          </div>
                          <input type="range" min={min} max={max} value={val} onChange={e => setInputs({ ...inputs, [key]:+e.target.value })} />
                          <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
                            <span style={{ fontSize:10, color:'#c3d9cc', fontFamily:"'JetBrains Mono',monospace" }}>{min}</span>
                            <span style={{ fontSize:10, color:inZone?'#059669':'#d97706', fontWeight:700 }}>{inZone?'✓ Optimal Range':'⚠ Out of Safe Zone'}</span>
                            <span style={{ fontSize:10, color:'#c3d9cc', fontFamily:"'JetBrains Mono',monospace" }}>{max}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={card}>
                    <SectionLabel>Virtual Board Advisory</SectionLabel>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {board.map(({ role, icon, cond, warn, ok }) => (
                        <div key={role} style={{ display:'flex', gap:12, alignItems:'flex-start', background:cond?'#fffbeb':'#f6faf8', border:`1px solid ${cond?'#fde68a':'#e4ede8'}`, borderRadius:12, padding:'12px 14px' }}>
                          <span style={{ fontSize:18, lineHeight:1 }}>{icon}</span>
                          <div>
                            <div style={{ fontSize:11, fontWeight:700, color:cond?'#d97706':'#059669', marginBottom:3 }}>{role}</div>
                            <div style={{ fontSize:12.5, color:'#4d7a62', lineHeight:1.5 }}>{cond ? warn : ok}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e', marginBottom: 4 }}>Profit Distribution</div>
                  <div style={{ fontSize: 11, color: '#8aac98', marginBottom: 22, fontStyle: 'italic' }}>Simulating 10,000 scenario combinations…</div>
                  {/* FIX #2 note: bio health penalty now reflected here via stats.profit */}
                  {bioHealthIndex < 75 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 11.5, color: '#92400e' }}>
                      ⚠ Bio-health index {bioHealthIndex}/100 — applying {bioHealthIndex < 55 ? 'RM 8,000' : 'RM 3,000'} yield penalty to profit projection
                    </div>
                  )}
                  <div style={{ height: 210 }}><Line data={chartData} options={chartOptions as any} /></div>
                  <div style={{ borderTop: '1px solid #f0f7f3', paddingTop: 20, marginTop: 20, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Expected Net Profit</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
                      <span style={{ fontSize: 18, color: '#059669', fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>RM</span>
                      <span style={{ fontSize: 46, fontWeight: 800, color: stats.profit < 0 ? '#ef4444' : '#0f2d1e', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '-0.04em', lineHeight: 1 }}>
                        {animatedProfit.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ marginTop:14, display:'flex', gap:20, justifyContent:'center' }}>
                      {[{ label:'Confidence', val:`${stats.confidence}%`, color:'#3b82f6' }, { label:'Waste Optimized', val:`-${stats.waste}%`, color:'#059669' }].map(({ label, val, color }) => (
                        <div key={label} style={{ textAlign:'center' }}>
                          <div style={{ fontSize:10, color:'#8aac98', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' as const }}>{label}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color, fontSize:18 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section Divider */}
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ height:1, flex:1, background:'#e4ede8' }} />
                <div style={{ display:'flex', alignItems:'center', gap:8, background:'#edfaf4', border:'1px solid #a7f3d0', borderRadius:20, padding:'5px 16px' }}>
                  <Zap size={11} color="#059669" />
                  <span style={{ fontSize:10, fontWeight:700, color:'#059669', letterSpacing:'0.12em', textTransform:'uppercase' as const }}>Extended Simulation Modules</span>
                </div>
                <div style={{ height:1, flex:1, background:'#e4ede8' }} />
              </div>

              {/* Row 2: 4 Simulation Modules */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

                {/* MODULE 1: Bio Asset Health */}
                <div style={{ ...card, display:'flex', flexDirection:'column', gap:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:20 }}>
                    <div style={{ width:34, height:34, background:'#edfaf4', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Sprout size={17} color="#059669" />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e', lineHeight: 1.2 }}>Bio-Cultivation Optimiser</div>
                      <div style={{ fontSize: 11, color: '#8aac98', marginTop: 2 }}>Sliders now drive bio health penalty in profit calculation</div>
                    </div>
                  </div>
                  <SimSlider label="Bio-Fertilizer Reduction" unit="%" min={0} max={50} value={bioFertReduction} onChange={setBioFertReduction} zone={[0, 20]} formatVal={v => `-${v}%`} />
                  <SimSlider label="Irrigation Frequency"    unit="×/week" min={1} max={8} value={bioIrrigation} onChange={setBioIrrigation} zone={[3, 5]} />
                  <div style={{ borderTop: '1px solid #f0f7f3', paddingTop: 16, marginTop: 4 }}>
                    <div style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'center' }}>
                      <HealthGauge value={bioHealthIndex} size={86} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#8aac98', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 6 }}>Bio Health Index</div>
                        <div style={{ fontSize: 12, color: bioHealthColor, fontWeight: 700, marginBottom: 10 }}>{bioHealthIndex >= 75 ? '✓ Optimal Zone' : bioHealthIndex >= 55 ? '⚠ Warning' : '⛔ Critical'}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <MetricBox label="Grade A"  value={`${gradeARatio}%`}   color="#059669" />
                          <MetricBox label="Grade B"  value={`${gradeBRatio}%`}   color="#d97706" />
                          <MetricBox label="Lifespan" value={`${expectedLifespan}y`} color="#3b82f6" sub="expected" />
                          <MetricBox label="Bio Idx"  value={`${bioHealthIndex}`} color={bioHealthColor} sub="/100" />
                        </div>
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      <div>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, alignItems:'center' }}>
                          <span style={{ fontSize:12, color:'#4d7a62', fontWeight:500 }}>Grade A Ratio</span>
                          <span style={{ display:'flex', gap:8, alignItems:'center' }}>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color:'#059669' }}>{gradeARatio}%</span>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color:'#d97706' }}>{gradeBRatio}%</span>
                          </span>
                        </div>
                        <div style={{ display:'flex', gap:2, height:8, borderRadius:4, overflow:'hidden' }}>
                          <div style={{ width:`${gradeARatio}%`, background:'#059669', transition:'width 0.6s ease' }} />
                          <div style={{ width:`${gradeBRatio}%`, background:'#d97706', transition:'width 0.6s ease' }} />
                          <div style={{ flex:1, background:'#e4ede8' }} />
                        </div>
                        <div style={{ display:'flex', gap:12, marginTop:4 }}>
                          <span style={{ fontSize:10, color:'#059669', fontWeight:600 }}>● Grade A RM 55/kg</span>
                          <span style={{ fontSize:10, color:'#d97706', fontWeight:600 }}>● Grade B RM 38/kg</span>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:10 }}>
                        <MetricBox label="Crop Lifespan" value={`${expectedLifespan} yrs`} color={expectedLifespan >= 13 ? '#059669' : expectedLifespan >= 10 ? '#d97706' : '#ef4444'} />
                        <MetricBox label="Unit Revenue Est." value={`RM ${Math.round(gradeARatio * 0.55 * 55 + gradeBRatio * 0.45 * 38)}`} color="#1a3a28" sub="per 100kg mixed output" />
                      </div>
                    </div>
                  </div>
                  {bioFertReduction > 15 && (
                    <div style={{ marginTop:12, background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'10px 13px' }}>
                      <div style={{ fontSize:11, color:'#92400e', lineHeight:1.6 }}>
                        ⚠ Reducing fertilizer by {bioFertReduction}% will lower Grade A ratio by {Math.round(bioFertReduction * 0.85 - 15 * 0.85)} ppts, losing approx RM {Math.round((bioFertReduction - 15) * 180).toLocaleString()} per hectare.
                      </div>
                    </div>
                  )}
                </div>

                {/* MODULE 2: Weather Risk */}
                <div style={{ ...card, display:'flex', flexDirection:'column', gap:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:20 }}>
                    <div style={{ width:34, height:34, background:'#fffbeb', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <CloudRain size={17} color="#d97706" />
                    </div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#0f2d1e', lineHeight:1.2 }}>Weather Risk & Loss Forecast</div>
                      <div style={{ fontSize:11, color:'#8aac98', marginTop:2 }}>Select extreme weather events to forecast yield & financial loss</div>
                    </div>
                  </div>
                  <div style={{ marginBottom:18 }}>
                    <div className="sim-module-label">Select Weather Scenario</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {(Object.entries(weatherScenarios) as [string, typeof weatherScenarios.rain][]).map(([key, sc]) => {
                        const active = weatherEvent2 === key;
                        return (
                          <button key={key}
                            onClick={() => setWeatherEvent2(active ? null : key as any)}
                            style={{
                              textAlign:'left', padding:'11px 14px', borderRadius:11,
                              border:`1.5px solid ${active ? sc.color : '#e4ede8'}`,
                              background:active ? `${sc.color}10` : '#f6faf8',
                              cursor:'pointer', fontFamily:"'Sora',sans-serif",
                              display:'flex', justifyContent:'space-between', alignItems:'center',
                              transition:'all 0.2s',
                            }}
                          >
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <span style={{ fontSize:18 }}>{sc.emoji}</span>
                              <span style={{ fontSize:13, fontWeight:active ? 700 : 500, color:active ? sc.color : '#4d7a62' }}>{sc.label}</span>
                            </div>
                            {active && <Tag label="Active" color={sc.color} bg={`${sc.color}20`} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ borderTop:'1px solid #f0f7f3', paddingTop:16, flex:1, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
                    {wx ? (
                      <>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
                          <div style={{ background:`${wx.color}10`, border:`1px solid ${wx.color}30`, borderRadius:12, padding:'12px 10px', textAlign:'center' }}>
                            <div style={{ fontSize:9, color:wx.color, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' as const, marginBottom:5 }}>Yield-at-Risk (YaR)</div>
                            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:800, color:wx.color }}>{wx.yar}%</div>
                          </div>
                          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:'12px 10px', textAlign:'center' }}>
                            <div style={{ fontSize:9, color:'#ef4444', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' as const, marginBottom:5 }}>Recovery Cost</div>
                            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:800, color:'#ef4444', lineHeight:1.3 }}>RM {wx.recoveryCost.toLocaleString()}</div>
                          </div>
                          <div style={{ background:insuranceGap>0?'#fff7ed':'#edfaf4', border:`1px solid ${insuranceGap>0?'#fed7aa':'#a7f3d0'}`, borderRadius:12, padding:'12px 10px', textAlign:'center' }}>
                            <div style={{ fontSize:9, color:insuranceGap>0?'#c2410c':'#059669', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' as const, marginBottom:5 }}>Coverage Gap</div>
                            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:800, color:insuranceGap>0?'#c2410c':'#059669', lineHeight:1.3 }}>
                              {insuranceGap > 0 ? `RM ${insuranceGap.toLocaleString()}` : 'Full Cover'}
                            </div>
                          </div>
                        </div>
                        <div style={{ marginBottom:14 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#8aac98', marginBottom:6 }}>
                            <span>Insurance Payout RM {wx.coverage.toLocaleString()}</span>
                            <span>Actual Loss RM {wx.recoveryCost.toLocaleString()}</span>
                          </div>
                          <div style={{ height:8, background:'#e4ede8', borderRadius:4, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${(wx.coverage / wx.recoveryCost) * 100}%`, background:'#059669', transition:'width 0.7s ease', borderRadius:4 }} />
                          </div>
                          <div style={{ fontSize:10, color:'#8aac98', marginTop:4, textAlign:'right' }}>
                            Coverage Ratio {Math.round((wx.coverage / wx.recoveryCost) * 100)}%
                          </div>
                        </div>
                        <div style={{ background:insuranceGap>0?'#fef2f2':'#edfaf4', border:`1px solid ${insuranceGap>0?'#fecaca':'#a7f3d0'}`, borderRadius:10, padding:'11px 13px' }}>
                          <div style={{ fontSize:11, color:insuranceGap>0?'#991b1b':'#065f46', lineHeight:1.6 }}>
                            {insuranceGap > 0
                              ? `⚠ Current agricultural insurance has a coverage gap of RM ${insuranceGap.toLocaleString()}. Consider upgrading to total loss or weather index insurance.`
                              : `✓ Current insurance fully covers estimated losses for the ${wx.label} scenario.`}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign:'center', padding:'30px 0', color:'#8aac98', fontSize:13, fontStyle:'italic' }}>
                        ☁️ Select an extreme weather scenario to begin loss forecast
                      </div>
                    )}
                  </div>
                </div>

                {/* MODULE 3: Supply Chain */}
                <div style={{ ...card, display:'flex', flexDirection:'column', gap:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:20 }}>
                    <div style={{ width:34, height:34, background:'#eff6ff', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Ship size={17} color="#3b82f6" />
                    </div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#0f2d1e', lineHeight:1.2 }}>Global Supply Chain & Market Arbitrage</div>
                      <div style={{ fontSize:11, color:'#8aac98', marginTop:2 }}>Optimize channel allocation under regional supply & logistics shocks</div>
                    </div>
                  </div>
                  <SimSlider label="Thai Supply Surge"       unit="%"    min={0} max={40} value={thaiSupply}   onChange={setThaiSupply}   zone={[0, 10]} formatVal={v => `+${v}%`} />
                  <SimSlider label="Singapore Port Lockdown" unit="days" min={0} max={21} value={portLockDays} onChange={setPortLockDays} zone={[0, 3]}  />
                  <SimSlider label="Shipping Delay"          unit="days" min={0} max={7}  value={shipDelay}    onChange={setShipDelay}    zone={[0, 2]}  />
                  <div style={{ borderTop: '1px solid #f0f7f3', paddingTop: 16, marginTop: 4 }}>
                    <div className="sim-module-label">AI Optimal Channel Allocation</div>
                    {[
                      { label: 'Local Market',     pct: localRatio, color: '#059669' },
                      { label: 'Singapore Export', pct: sgRatio,    color: '#3b82f6' },
                      { label: 'Hong Kong Export', pct: hkRatio,    color: '#7c3aed' },
                    ].map(({ label, pct, color }) => (
                      <div key={label} style={{ marginBottom:12 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, alignItems:'center' }}>
                          <span style={{ fontSize:12, color:'#4d7a62', fontWeight:500 }}>{label}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, color }}>{pct}%</span>
                        </div>
                        <div style={{ height:6, background:'#e4ede8', borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:3, transition:'width 0.6s ease' }} />
                        </div>
                      </div>
                    ))}
                    <div style={{ display:'flex', gap:10, marginTop:14 }}>
                      <div style={{ flex:1, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:12, padding:'12px 13px', textAlign:'center' }}>
                        <div style={{ fontSize:10, color:'#3b82f6', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' as const, marginBottom:5 }}>Channel Mix</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color:'#1e40af' }}>{supplyLabel}</div>
                        <div style={{ fontSize:10, color:'#8aac98', marginTop:3 }}>Local : SG : HK</div>
                      </div>
                      <div style={{ flex:1, background:delayLoss>0?'#fef2f2':'#edfaf4', border:`1px solid ${delayLoss>0?'#fecaca':'#a7f3d0'}`, borderRadius:12, padding:'12px 13px', textAlign:'center' }}>
                        <div style={{ fontSize:10, color:delayLoss>0?'#ef4444':'#059669', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' as const, marginBottom:5 }}>Delay Net Loss</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color:delayLoss>0?'#ef4444':'#059669' }}>
                          {delayLoss > 0 ? `RM ${delayLoss.toLocaleString()}` : 'No Loss'}
                        </div>
                        <div style={{ fontSize:10, color:'#8aac98', marginTop:3 }}>Quality drop + spread</div>
                      </div>
                    </div>
                    {(thaiSupply > 10 || portLockDays > 3) && (
                      <div style={{ marginTop:12, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'11px 13px' }}>
                        <div style={{ fontSize:11, color:'#1e40af', lineHeight:1.6 }}>
                          🧭 AI Recommendation: {portLockDays > 3 ? `During ${portLockDays}-day port lockdown, divert ${Math.min(30, portLockDays * 1.5).toFixed(0)}% of exports to Hong Kong channel.` : `Thai supply surge of ${thaiSupply}% detected — lock in Singapore premium orders to avoid direct price competition.`}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* MODULE 4: Cash Flow Runway */}
                <div style={{ ...card, display:'flex', flexDirection:'column', gap:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:20 }}>
                    <div style={{ width:34, height:34, background:'#f5f3ff', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <DollarSign size={17} color="#7c3aed" />
                    </div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#0f2d1e', lineHeight:1.2 }}>Financial Viability · Cash Flow Runway</div>
                      <div style={{ fontSize:11, color:'#8aac98', marginTop:2 }}>Simulate survival boundary under rate, labor & receivables pressure</div>
                    </div>
                  </div>
                  <SimSlider label="Loan Interest Rate" unit="%" min={3} max={15} value={loanRate} onChange={setLoanRate} zone={[3, 7]} formatVal={v => `${v}%`} />
                  <SimSlider label="Labor Cost Increase" unit="%" min={0} max={30} value={laborIncrease} onChange={setLaborIncrease} zone={[0, 10]} formatVal={v => `+${v}%`} />
                  <SimSlider label="Payment Delay" unit="days" min={0} max={60} value={paymentDelay} onChange={setPaymentDelay} zone={[0, 14]} />
                  <div style={{ borderTop:'1px solid #f0f7f3', paddingTop:16, marginTop:4 }}>
                    <div style={{ marginBottom:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
                        <span style={{ fontSize:12, color:'#4d7a62', fontWeight:600 }}>Cash Flow Survival Runway</span>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:26, fontWeight:800, color:runwayColor, lineHeight:1 }}>
                          {adjustedRunway} <span style={{ fontSize:12, opacity:0.7 }}>days</span>
                        </span>
                      </div>
                      <div style={{ height:10, background:'#e4ede8', borderRadius:5, overflow:'hidden' }}>
                        <div style={{
                          height:'100%',
                          width:`${Math.min((adjustedRunway / 180) * 100, 100)}%`,
                          background:`linear-gradient(90deg, ${runwayColor}, ${runwayColor}aa)`,
                          borderRadius:5, transition:'width 0.7s ease',
                        }} />
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontSize:10, color:'#8aac98' }}>
                        <span>Critical &lt;30d</span>
                        <span>Warning 30–90d</span>
                        <span>Safe &gt;120d</span>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                      <div style={{ background:adjustedRunway < 60 ? '#fef2f2' : '#f6faf8', border:`1px solid ${adjustedRunway < 60 ? '#fecaca' : '#e4ede8'}`, borderRadius:12, padding:'12px', textAlign:'center' }}>
                        <div style={{ fontSize:10, color:'#8aac98', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' as const, marginBottom:5 }}>Insolvency Threshold</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:700, color:adjustedRunway < 60 ? '#ef4444' : '#4d7a62', lineHeight:1.2 }}>
                          {adjustedRunway < 60 ? '⛔ Triggered' : `Month ${Math.ceil(adjustedRunway / 30) + 1}`}
                        </div>
                        <div style={{ fontSize:10, color:'#8aac98', marginTop:3 }}>Zero-revenue scenario</div>
                      </div>
                      <div style={{ background:financingMonth ? '#fffbeb' : '#edfaf4', border:`1px solid ${financingMonth ? '#fde68a' : '#a7f3d0'}`, borderRadius:12, padding:'12px', textAlign:'center' }}>
                        <div style={{ fontSize:10, color:'#8aac98', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' as const, marginBottom:5 }}>Financing Trigger</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:700, color:financingMonth ? '#d97706' : '#059669', lineHeight:1.2 }}>
                          {financingMonth ? `Month ${financingMonth}` : 'None Required'}
                        </div>
                        <div style={{ fontSize:10, color:'#8aac98', marginTop:3 }}>External capital expected</div>
                      </div>
                    </div>
                    {totalCashBurn > 0 && (
                      <div style={{ background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:10, padding:'11px 13px' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#5b21b6', marginBottom:4 }}>📊 Compounding Stress Effect</div>
                        <div style={{ fontSize:11, color:'#6d28d9', lineHeight:1.7 }}>
                          Current parameter set burns an extra <strong>RM {totalCashBurn.toLocaleString()}/month</strong>, shortening runway by <strong>{142 - adjustedRunway} days</strong> vs baseline.
                          {financingMonth && ` Recommend completing financing negotiations before Month ${financingMonth}.`}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ═══════════════════ PAGE 3 — GLOBAL OPERATIONS ═══════════════════ */}
          {activeTab === 'page3' && (
            <div className="tab-content" style={{ maxWidth:1000, margin:'0 auto', display:'flex', flexDirection:'column', gap:20 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
                <div style={card}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
                    <Globe size={16} color="#3b82f6" />
                    <span style={{ fontSize:14, fontWeight:700, color:'#0f2d1e' }}>Global Stress Test</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:9, marginBottom:16 }}>
                    {stressEvents.map(ev => {
                      const active = stressEvent?.id === ev.id;
                      return (
                        <button key={ev.id} onClick={() => setStressEvent(active ? null : ev)} style={{
                          textAlign:'left', padding:'12px 15px', borderRadius:11,
                          border:`1.5px solid ${active?'#fde68a':'#e4ede8'}`,
                          background:active?'#fffbeb':'#f6faf8',
                          cursor:'pointer', transition:'all 0.2s', fontFamily:"'Sora',sans-serif",
                          color:active?'#92400e':'#4d7a62', fontSize:13, fontWeight:active?600:500,
                          display:'flex', justifyContent:'space-between', alignItems:'center',
                        }}>
                          <span>{ev.title}</span>
                          {active && <Tag label="Active" color="#92400e" bg="#fde68a" />}
                        </button>
                      );
                    })}
                  </div>
                  {stressEvent ? (
                    <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:'14px 16px' }}>
                      <div style={{ display:'flex', gap:8 }}>
                        <AlertCircle size={14} color="#ef4444" style={{ marginTop:2, flexShrink:0 }} />
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:'#ef4444', marginBottom:4 }}>Risk Activated</div>
                          <div style={{ fontSize:12, color:'#6b7280', lineHeight:1.6 }}>{stressEvent.impact}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:700, color:'#ef4444', marginTop:8 }}>
                            Loss RM {Math.abs(stressEvent.loss).toLocaleString()}
                          </div>
                          <div style={{ marginTop:10, padding:'10px 12px', background:'#fff', borderRadius:9, border:'1px solid #fecaca' }}>
                            <div style={{ fontSize:11, color:'#374151', lineHeight:1.6 }}>
                              <strong style={{ color:'#059669' }}>AI Response Strategy:</strong> Activate Singapore pre-sale price lock immediately, notify Johor cooperative for joint procurement hedge — recovers est. {Math.round(Math.abs(stressEvent.loss) * 0.35 / 1000)}k in losses.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:'10px 0', fontSize:12, color:'#8aac98', fontStyle:'italic' }}>Click any scenario to begin stress test</div>
                  )}
                </div>

                <div style={card}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#0f2d1e', marginBottom:18 }}>Competitor Intelligence</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
                    {[
                      { label:'Thai B League', status:'⚠ Price War Alert', color:'#d97706', bg:'#fffbeb', detail:'Expected price cut of RM 5–8/kg, covering Singapore & Hong Kong markets.' },
                      { label:'Vietnam New Entrant', status:'● Low Threat', color:'#059669', bg:'#edfaf4', detail:'Quality certification below MyGAPs standard — unlikely to capture premium orders near-term.' },
                      { label:'Local Cooperative Alliance', status:'✓ Recommend Lock-in', color:'#3b82f6', bg:'#eff6ff', detail:'Johor cooperative proposes joint procurement — can reduce logistics costs by ~18%.' },
                    ].map(({ label, status, color, bg, detail }) => (
                      <div key={label} style={{ background:'#f6faf8', borderRadius:11, padding:'12px 14px', border:'1px solid #e4ede8' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                          <span style={{ fontSize:12, fontWeight:600, color:'#1a3a28' }}>{label}</span>
                          <span style={{ fontSize:10, fontWeight:700, color, background:bg, padding:'2px 9px', borderRadius:10 }}>{status}</span>
                        </div>
                        <p style={{ fontSize:12, color:'#6b8f7e', lineHeight:1.6, margin:0 }}>{detail}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:16, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:12, padding:'13px 16px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#1e40af', marginBottom:5 }}>AI Hedging Strategy Recommendation</div>
                    <p style={{ fontSize:12.5, color:'#374151', lineHeight:1.6, margin:0 }}>Immediately lock <strong style={{ color:'#1e40af' }}>40%</strong> Singapore pre-sale orders and launch Johor joint procurement negotiations — building a dual price moat.</p>
                  </div>
                </div>
              </div>

              {/* SECTION: Unsalable Inventory Pivot & Dynamic Logistics (滞销解决方案) */}
              <div style={{ ...card }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                  <RefreshCw size={16} color="#7c3aed" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e' }}>Unsalable Inventory Pivot &amp; Dynamic Logistics</span>
                  {(analysisResult?.salesInsights?.unsalableRisk || thaiSupply > 20) && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 20, padding: '2px 10px' }}>
                      ⚠ Risk Detected
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                  {/* Left: Product Diversion Strategy */}
                  <div style={{
                    background: analysisResult?.salesInsights?.unsalableRisk || thaiSupply > 20 ? '#fffbeb' : '#f6faf8',
                    border: `1px solid ${analysisResult?.salesInsights?.unsalableRisk || thaiSupply > 20 ? '#fde68a' : '#e4ede8'}`,
                    borderRadius: 12, padding: 16,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: analysisResult?.salesInsights?.unsalableRisk || thaiSupply > 20 ? '#d97706' : '#4d7a62', marginBottom: 8 }}>
                      Product Diversion Strategy
                    </div>
                    <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.6, margin: 0 }}>
                      {analysisResult?.salesInsights?.alternativeStrategy
                        || (thaiSupply > 20
                          ? 'High market saturation detected. AI recommends converting 25% of near-ripe harvest into frozen durian paste for dessert manufacturers. Estimated margin retention: 68%.'
                          : 'Market absorption is optimal. No by-product conversion required at current supply levels.')}
                    </p>
                    {(analysisResult?.salesInsights?.unsalableRisk || thaiSupply > 20) && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                        {[
                          { label: 'Grade B/C Pivot', val: '30%', color: '#d97706' },
                          { label: 'Margin Retained', val: '68%', color: '#059669' },
                        ].map(({ label, val, color }) => (
                          <div key={label} style={{ flex: 1, textAlign: 'center', background: '#fff', borderRadius: 8, padding: '8px 6px', border: '1px solid #fde68a' }}>
                            <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 3 }}>{label}</div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 800, color }}>{val}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: Dynamic Logistics Matching */}
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#1e40af', marginBottom: 8 }}>
                      Dynamic Logistics Matching
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                      {[
                        { name: 'Lalamove Cold Chain',  status: 'Available',                              cost: 'RM 120/trip', statusColor: '#059669' },
                        { name: 'NinjaVan Agri',        status: 'High Demand',                            cost: 'RM 145/trip', statusColor: '#d97706' },
                        { name: 'GDex Chilled Express', status: portLockDays > 5 ? 'Overloaded' : 'Standby', cost: 'RM 138/trip', statusColor: portLockDays > 5 ? '#ef4444' : '#8aac98' },
                      ].map(provider => (
                        <div key={provider.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '9px 12px', borderRadius: 8, border: '1px solid #e0eeff' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#1a3a28' }}>{provider.name}</span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 10, color: provider.statusColor, fontWeight: 700 }}>{provider.status}</div>
                            <div style={{ fontSize: 11, color: '#6b7280', fontFamily: "'JetBrains Mono',monospace" }}>{provider.cost}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {portLockDays > 5 && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 11px', fontSize: 11, color: '#991b1b', lineHeight: 1.6 }}>
                        ⚠ Port lockdown ({portLockDays}d active) — reroute cold-chain volume to land freight.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                {[
                  { label: 'Current Risk Exposure', val: stressEvent ? `RM ${Math.abs(stressEvent.loss).toLocaleString()}` : 'RM 0', sub: stressEvent ? '↓ Stress event active' : 'No active stress event', ok: !stressEvent },
                  { label: 'Hedge Coverage',        val: '40%',  sub: '↑ Pre-sale price lock',          ok: true },
                  { label: 'Market Win Rate',       val: '67%',  sub: 'Based on Monte Carlo simulation', ok: true },
                ].map(({ label, val, sub, ok }) => (
                  <div key={label} style={{ ...card, padding:'18px 20px' }}>
                    <div style={{ fontSize:10, color:'#8aac98', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' as const, marginBottom:7 }}>{label}</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:700, color:ok?'#0f2d1e':'#ef4444' }}>{val}</div>
                    <div style={{ fontSize:11, color:ok?'#059669':'#ef4444', fontWeight:600, marginTop:4 }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════════════ PAGE 4 — COMPLIANCE & ROI ═══════════════════ */}
          {activeTab === 'page4' && (
            <div className="tab-content" style={{ maxWidth:1000, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <div style={card}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
                  <ShieldCheck size={16} color="#059669" />
                  <span style={{ fontSize:14, fontWeight:700, color:'#0f2d1e' }}>2026 e-Invoicing Compliance</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18 }}>
                  {complianceItems.map(({ label, status, detail }) => {
                    const color = status==='ok'?'#059669':status==='warn'?'#d97706':'#ef4444';
                    const Icon = status==='ok'?CheckCircle2:status==='warn'?Clock:AlertCircle;
                    return (
                      <div key={label} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 13px', background:'#f6faf8', border:'1px solid #e4ede8', borderRadius:10 }}>
                        <Icon size={14} color={color} style={{ flexShrink:0 }} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12.5, fontWeight:600, color:'#1a3a28', marginBottom:2 }}>{label}</div>
                          <div style={{ fontSize:11, color:'#8aac98' }}>{detail}</div>
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, color, background:`${color}18`, padding:'2px 8px', borderRadius:6, flexShrink:0, textTransform:'uppercase' as const, letterSpacing:'0.06em' }}>
                          {status==='ok'?'Pass':status==='warn'?'Warning':'Error'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => { setIsAuditing(true); setAuditDone(false); setTimeout(()=>{ setIsAuditing(false); setAuditDone(true); }, 1800); }}
                  style={{ width:'100%', background:isAuditing?'#f6faf8':'#059669', color:isAuditing?'#059669':'#fff', fontWeight:700, fontSize:14, padding:'13px', borderRadius:12, border:`1.5px solid ${isAuditing?'#a7f3d0':'transparent'}`, cursor:'pointer', fontFamily:"'Sora',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'all 0.25s' }}
                >
                  {isAuditing ? <><RefreshCw size={14} style={{ animation:'spin 1s linear infinite' }} /> Running LHDN Rule Scan...</> : auditDone ? <><CheckCircle2 size={14} /> Scan Complete — 2 Errors Found</> : 'Run LHDN Compliance Audit'}
                </button>
              </div>

              <div style={{ ...card, display:'flex', flexDirection:'column', gap:18 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <TrendingUp size={16} color="#3b82f6" />
                  <span style={{ fontSize:14, fontWeight:700, color:'#0f2d1e' }}>Automated ROI Estimator</span>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#8aac98', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' as const, display:'block', marginBottom:8 }}>Monthly Staff Salary (RM)</label>
                  <input type="number" value={staffSalary} onChange={e => setStaffSalary(+e.target.value)} />
                </div>
                {/* FIX #1: ROI formula corrected
                    Old: payback = 500/staffSalary (WRONG — divides by full salary, not savings)
                    New: payback = systemCost / monthlySavings = 500 / (staffSalary * 0.15)
                    Old: annualizedROI = (500/staffSalary/12)*100 (WRONG)
                    New: annualizedROI = (monthlySavings / systemCost) * 100
                */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {(() => {
                    const monthlySavings = staffSalary * 0.15;  // 15% of salary saved via automation
                    const systemCost     = 500;                  // RM/month system subscription
                    return [
                      { label: 'Payback Period',       val: `${(systemCost / monthlySavings).toFixed(1)} months`, color: '#059669' },
                      { label: 'Annualized ROI',        val: `${((monthlySavings / systemCost) * 100).toFixed(0)}%`, color: '#3b82f6' },
                      { label: 'Monthly Labor Savings', val: `RM ${monthlySavings.toFixed(0)}`, color: '#7c3aed' },
                      { label: 'Efficiency Gain',       val: '+32%', color: '#d97706' },
                    ];
                  })().map(({ label, val, color }) => (
                    <div key={label} style={{ background: '#f6faf8', border: '1px solid #e4ede8', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 7 }}>{label}</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 19, fontWeight: 700, color }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#edfaf4', border: '1px solid #a7f3d0', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 700, marginBottom: 6 }}>System Value Summary</div>
                  <p style={{ fontSize: 12.5, color: '#4d7a62', lineHeight: 1.7, margin: 0 }}>
                    At a base salary of RM {staffSalary.toLocaleString()}/month, BioFin Oracle automates 15% of manual labor (RM {(staffSalary * 0.15).toFixed(0)}/mo saved) against a RM 500/mo system cost, delivering full ROI in <strong style={{ color: '#059669' }}>{(500 / (staffSalary * 0.15)).toFixed(1)} months</strong> and a sustained annualized return of <strong style={{ color: '#059669' }}>{((staffSalary * 0.15 / 500) * 100).toFixed(0)}%</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer style={{ background:'#fff', borderTop:'1px solid #e4ede8', padding:'12px 32px', display:'flex', justifyContent:'space-around', alignItems:'center', flexShrink:0 }}>
          {[
            { label: 'Projected Profit',    val: `RM ${animatedProfit.toLocaleString()}`, color: stats.profit < 0 ? '#ef4444' : '#0f2d1e' },
            { label: 'Waste Reduced',       val: `-${stats.waste}%`,                      color: '#059669' },
            { label: 'Decision Confidence', val: `${stats.confidence}%`,                  color: '#3b82f6' },
            { label: 'Cash Runway',         val: `${adjustedRunway} days`,                color: runwayColor },
            { label: 'Risk Index',          val: derivedRiskLevel,                        color: riskColor },
          ].map(({ label, val, color }, i) => (
            <React.Fragment key={label}>
              {i > 0 && <div style={{ width:1, height:26, background:'#e4ede8' }} />}
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:9, color:'#8aac98', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase' as const, marginBottom:3 }}>{label}</div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:17, fontWeight:700, color }}>{val}</div>
              </div>
            </React.Fragment>
          ))}
        </footer>
      </div>
    </>
  );
}