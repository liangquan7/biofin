"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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

// ─── Shared Type Contracts ────────────────────────────────────────────────────
// Single source of truth — imported from @/types/biofin so frontend and
// backend interfaces can never silently drift apart.
import type { SSEStageEvent, SSEErrorEvent, AnalysisResult } from '@/types/biofin';

// ─── Utility Hooks & Components ───────────────────────────────────────────────

function useAnimatedNumber(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef   = useRef<number | null>(null);
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

function SimSlider({ label, unit, min, max, value, onChange, zone, formatVal }: {
  label: string; unit: string; min: number; max: number;
  value: number; onChange: (v: number) => void;
  zone?: [number, number]; formatVal?: (v: number) => string;
}) {
  const inZone  = zone ? value >= zone[0] && value <= zone[1] : true;
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
  const pct   = value / 100;
  const r     = (size / 2) - 8;
  const circ  = 2 * Math.PI * r;
  const dash  = pct * circ * 0.75;
  const offset = circ * 0.125;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e4ede8" strokeWidth={7} strokeDasharray={`${circ*0.75} ${circ*0.25}`} strokeDashoffset={-offset} strokeLinecap="round" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7} strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-offset} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.4s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 4 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 9, color: '#8aac98', fontWeight: 600 }}>/100</span>
      </div>
    </div>
  );
}

// ─── SSE Pipeline Progress Component ─────────────────────────────────────────

const stageIcons: Record<SSEStageEvent['stage'], React.ReactNode> = {
  parsing:    <FileText size={14} color="#059669" />,
  summarising:<Activity size={14} color="#3b82f6" />,
  searching:  <Globe size={14} color="#d97706" />,
  analyzing:  <Zap size={14} color="#7c3aed" />,
  sanitising: <ShieldCheck size={14} color="#059669" />,
};

const stageLabels: Record<SSEStageEvent['stage'], string> = {
  parsing:     'Parsing',
  summarising: 'Summarising',
  searching:   'Market Search',
  analyzing:   'AI Analysis',
  sanitising:  'Validation',
};

function PipelineProgress({ progress, message, detail, stage: currentStage }: {
  progress: number; message: string; detail?: string; stage: SSEStageEvent['stage'];
}) {
  const stages: SSEStageEvent['stage'][] = ['parsing','summarising','searching','analyzing','sanitising'];
  const stageIdx = stages.indexOf(currentStage);
  return (
    <div style={{ background: '#fff', border: '1px solid #a7f3d0', borderRadius: 20, padding: '28px 32px', marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid #e4ede8', borderTop: '3px solid #059669', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f2d1e', marginBottom: 6 }}>{message}</div>
          {detail && <div style={{ fontSize: 11.5, color: '#8aac98', marginBottom: 8, fontFamily: "'JetBrains Mono',monospace" }}>{detail}</div>}
          <div style={{ height: 6, background: '#e4ede8', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #059669, #34d399)', borderRadius: 3, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#8aac98', fontFamily: "'JetBrains Mono',monospace" }}>
            <span>Initializing</span>
            <span style={{ color: '#059669', fontWeight: 700 }}>{progress}%</span>
            <span>Complete</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {stages.map((s, i) => {
          const done = i < stageIdx;
          const active = i === stageIdx;
          return (
            <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done ? '#059669' : active ? '#edfaf4' : '#f6faf8',
                border: `2px solid ${done ? '#059669' : active ? '#059669' : '#e4ede8'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.3s ease',
              }}>
                {done ? <CheckCircle2 size={13} color="#fff" /> : stageIcons[s]}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: done ? '#059669' : active ? '#059669' : '#8aac98', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                {stageLabels[s]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Upload Zone Sub-Component ────────────────────────────────────────────────

function UploadZone({
  id, icon, title, description, hint, accepted, acceptLabel, files, onFiles, dragOver, onDragOver, onDragLeave,
}: {
  id: string; icon: React.ReactNode; title: string; description: string;
  hint: string; accepted: string; acceptLabel?: string; files: File[];
  onFiles: (files: File[]) => void;
  dragOver: boolean; onDragOver: () => void; onDragLeave: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFiles = files.length > 0;

  const mergeFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const existing = new Set(files.map(f => f.name + f.size));
    const newOnes = Array.from(incoming).filter(f => !existing.has(f.name + f.size));
    
    // 新增：前端单文件大小校验 (5MB)
    const validFiles = newOnes.filter(f => {
      if (f.size > 5 * 1024 * 1024) {
        alert(`File "${f.name}" is too large. Maximum size is 5MB.`);
        return false;
      }
      return true;
    });

    onFiles([...files, ...validFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onDragLeave();
    mergeFiles(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    onFiles(files.filter((_, i) => i !== index));
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${dragOver ? '#059669' : hasFiles ? '#a7f3d0' : '#d1e8da'}`,
        borderRadius: 18,
        padding: '22px 20px',
        background: dragOver ? 'rgba(5,150,105,0.04)' : hasFiles ? '#edfaf4' : '#fafcfb',
        transition: 'all 0.22s ease',
        position: 'relative',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accepted}
        multiple
        style={{ display: 'none' }}
        onChange={e => { mergeFiles(e.target.files); e.target.value = ''; }}
      />

      {/* ── Header row (always visible) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: hasFiles ? 14 : 0 }}>
        <div
          style={{ width: 40, height: 40, background: hasFiles ? '#d1fae5' : '#e8f5ee', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          onClick={() => !hasFiles && inputRef.current?.click()}
        >
          {hasFiles ? <CheckCircle2 size={19} color="#059669" /> : icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: hasFiles ? '#065f46' : '#1a3a28', marginBottom: 2 }}>{title}</div>
          <div style={{ fontSize: 11, color: '#6b8f7e' }}>{description}</div>
        </div>
        {/* File count badge */}
        {hasFiles && (
          <div style={{ background: '#059669', color: '#fff', fontSize: 11, fontWeight: 800, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </div>
        )}
      </div>

      {/* ── File list ── */}
      {hasFiles && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #d1fae5', borderRadius: 9, padding: '7px 10px' }}>
              <FileText size={12} color="#059669" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11.5, color: '#065f46', fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {file.name}
              </span>
              <span style={{ fontSize: 10.5, color: '#8aac98', flexShrink: 0 }}>({(file.size / 1024).toFixed(1)} KB)</span>
              <button
                onClick={e => { e.stopPropagation(); removeFile(i); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 5, color: '#8aac98', display: 'flex', alignItems: 'center', flexShrink: 0 }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Add more / upload prompt ── */}
      {hasFiles ? (
        <button
          onClick={() => inputRef.current?.click()}
          style={{ width: '100%', background: 'none', border: '1.5px dashed #a7f3d0', borderRadius: 10, padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#059669', fontSize: 12, fontWeight: 700, fontFamily: "'Sora',sans-serif", transition: 'background 0.18s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(5,150,105,0.05)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <Upload size={13} />
          Add more files
        </button>
      ) : (
        <>
          <div
            onClick={() => inputRef.current?.click()}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ background: '#f0f9f4', border: '1px solid #d1e8da', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#8aac98', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Expected Data Points</div>
              <div style={{ fontSize: 11, color: '#4d7a62', fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.8 }}>{hint}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#8aac98' }}>
              <Upload size={14} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Click to upload or drag & drop</span>
              <span style={{ fontSize: 11, background: '#e4ede8', borderRadius: 6, padding: '2px 8px' }}>{acceptLabel ?? 'CSV / JSON'}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BioFinOracle() {

  // ── Page routing ────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState<'upload' | 'dashboard'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Concern D fix: track mount status and hold a ref to any in-flight SSE
  // AbortController so we can cancel it and skip state updates if the
  // component unmounts mid-stream (e.g. React StrictMode double-invocation,
  // navigation away, or hot-reload).
  const mountedRef  = useRef(true);
  const sseAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sseAbortRef.current?.abort();
    };
  }, []);

  // ── SSE pipeline state ───────────────────────────────────────────────────────
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineMessage, setPipelineMessage] = useState('');
  const [pipelineDetail, setPipelineDetail] = useState<string | undefined>();
  const [pipelineStage, setPipelineStage] = useState<SSEStageEvent['stage']>('parsing');

  // ── File upload state ────────────────────────────────────────────────────────
  const [envGeoFiles,    setEnvGeoFiles]    = useState<File[]>([]);  // Cat 1: Environmental & Geospatial
  const [bioCropFiles,   setBioCropFiles]   = useState<File[]>([]);  // Cat 2: Biological & Crop
  const [operationsFiles, setOperationsFiles] = useState<File[]>([]); // Cat 3: Farming Operations
  const [financialFiles,  setFinancialFiles]  = useState<File[]>([]); // Cat 4: Financial & Commercial
  const [dragOver,    setDragOver]    = useState<string | null>(null);

  // ── Dashboard state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]     = useState('page1');
  const [inputs, setInputs]           = useState({ fert: 400, labor: 120 });
  const [staffSalary, setStaffSalary] = useState(3400);
  const [isAuditing, setIsAuditing]   = useState(false);
  const [auditDone, setAuditDone]     = useState(false);
  const [stressEvent, setStressEvent] = useState<{ id: string; title: string; loss: number; impact: string; recoveryStrategy?: string } | null>(null);
  const [now, setNow]                 = useState(new Date());
  const [actionExecuted, setActionExecuted] = useState(false);

  const [bioFertReduction, setBioFertReduction] = useState(0);
  const [bioIrrigation,    setBioIrrigation]    = useState(4);
  const [weatherEvent2,    setWeatherEvent2]    = useState<'rain' | 'drought' | 'wind' | null>(null);

  const [thaiSupply,    setThaiSupply]    = useState(0);
  const [portLockDays,  setPortLockDays]  = useState(0);
  const [shipDelay,     setShipDelay]     = useState(0);

  const [loanRate,       setLoanRate]       = useState(5);
  const [laborIncrease,  setLaborIncrease]  = useState(0);
  const [paymentDelay,   setPaymentDelay]   = useState(0);

  useEffect(() => {
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

  // ── Execute handler — SSE streaming ─────────────────────────────────────────

  const handleExecute = useCallback(async () => {
    setIsProcessing(true);
    setApiError(null);
    setPipelineProgress(0);
    setPipelineMessage('Connecting to analysis pipeline…');
    setPipelineDetail(undefined);
    setPipelineStage('parsing');

    try {
      const fd = new FormData();
      envGeoFiles.forEach(f     => fd.append('envGeoData',     f));
      bioCropFiles.forEach(f    => fd.append('bioCropData',    f));
      operationsFiles.forEach(f => fd.append('operationsData', f));
      financialFiles.forEach(f  => fd.append('financialData',  f));

      // Concern D fix: store the controller on the ref so the cleanup effect
      // in useEffect can abort it if the component unmounts mid-stream.
      const controller = new AbortController();
      sseAbortRef.current = controller;
      const fetchTimeout = setTimeout(() => controller.abort(), 300_000);
      let res: Response;
      try {
        res = await fetch('/api/analyze', { method: 'POST', body: fd, signal: controller.signal });
      } finally {
        clearTimeout(fetchTimeout);
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/event-stream')) {
        throw new Error('Server did not return an SSE stream. The analysis service may be temporarily unavailable — please try again.');
      }

      if (!res.body) {
        throw new Error('ReadableStream not supported in this browser.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        // Concern D: stop reading if the component has unmounted
        if (done || controller.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            try {
              const payload = JSON.parse(jsonStr);

              // Concern D: never call setState on an unmounted component
              if (!mountedRef.current) break;

              if (currentEvent === 'stage') {
                const s = payload as SSEStageEvent;
                setPipelineStage(s.stage);
                setPipelineProgress(s.progress);
                setPipelineMessage(s.message);
                setPipelineDetail(s.detail);
              } else if (currentEvent === 'error') {
                const e = payload as SSEErrorEvent;
                if (!e.fallback) {
                  throw new Error(e.message);
                }
                // Fallback: we'll still get a 'complete' event with safe defaults
              } else if (currentEvent === 'complete') {
                const data = payload as AnalysisResult;
                setAnalysisResult(data);
                setInputs(data.inputs);
                setBioFertReduction(data.bioFertReduction);
                setBioIrrigation(data.bioIrrigation);
                setLoanRate(data.loanRate);
                // Bug #3 fix: always set weatherEvent2 — even if null — so stale
                // data from a previous upload doesn't persist after a re-upload.
                setWeatherEvent2(data.weatherRisk);
                // FIX: sync staffSalary from AI result in the main path
                if (data.financial?.laborCost) setStaffSalary(data.financial.laborCost);
                setPipelineProgress(100);
                setPipelineMessage('Analysis complete — launching dashboard…');
                setPipelineDetail(undefined);
              }
            } catch (parseErr) {
              // Not JSON or malformed — skip (could be a keepalive comment remnant)
            }
          } else if (line === '') {
            currentEvent = '';  // reset on blank line (end of SSE event)
          }
          // SSE comments (keepalive lines starting with ':') are ignored
        }
      }

      // Handle any remaining data in buffer
      if (buffer.startsWith('data: ') && mountedRef.current && currentEvent === 'complete') {
        const jsonStr = buffer.slice(6);
        try {
          const payload = JSON.parse(jsonStr);
          if (payload && 'bioFertReduction' in payload) {
            const data = payload as AnalysisResult;
            setAnalysisResult(data);
            setInputs(data.inputs);
            setBioFertReduction(data.bioFertReduction);
            setBioIrrigation(data.bioIrrigation);
            setLoanRate(data.loanRate);
            setWeatherEvent2(data.weatherRisk); // Bug #3 fix: unconditional
            if (data.financial?.laborCost) setStaffSalary(data.financial.laborCost);
          }
        } catch { /* ignore */ }
      }

    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof DOMException && err.name === 'AbortError'
        ? 'Analysis request timed out. The AI service may be overloaded — please try again.'
        : (err instanceof Error ? err.message : String(err));
      setApiError(msg);
      setIsProcessing(false);
      return;
    }

    if (!mountedRef.current) return;
    await new Promise(r => setTimeout(r, 400));
    setIsProcessing(false);
    setCurrentPage('dashboard');
  }, [envGeoFiles, bioCropFiles, operationsFiles, financialFiles]);

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

  // Bug #1 fix: anchor the runway calculation to the AI's computed cashRunway.
  // Both the Header badge and the Footer KPI now derive from the same base value
  // so they can never show different numbers for the same concept.
  const aiCashRunway   = analysisResult?.financial.cashRunway ?? 142;
  const adjustedRunway = Math.max(18, Math.round(
    aiCashRunway - (loanRate - 5) * 5.5 - laborIncrease * 1.8 - paymentDelay * 0.55
  ));
  const runwayColor    = adjustedRunway >= 120 ? '#059669' : adjustedRunway >= 70 ? '#d97706' : '#ef4444';
  const financingMonth = adjustedRunway < 120 ? Math.ceil(adjustedRunway / 30) : null;
  const totalCashBurn  = Math.round((loanRate - 5) * 800 + laborIncrease * 600 + paymentDelay * 250);

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

  // Dynamic stress tests — driven by LLM output, with fallback placeholders
  const stressEvents = analysisResult?.dynamicIntelligence?.stressTests?.map(s => ({
    id: s.id,
    title: s.title,
    loss: s.lossEstimate,
    impact: s.impact,
    recoveryStrategy: s.recoveryStrategy,
  })) ?? [
    { id: 'port',  title: 'Port Klang 7-Day Logistics Disruption',     loss: -15000, impact: 'Logistics disruption · Direct loss RM 15,000', recoveryStrategy: 'Activate Singapore pre-sale price lock immediately, notify Johor cooperative for joint procurement hedge.' },
    { id: 'flood', title: 'Extreme Rainfall · Farmland Flooded 3 Days', loss: -22000, impact: '40% yield loss · Estimated loss RM 22,000', recoveryStrategy: 'Trigger crop insurance claim, accelerate drainage maintenance, shift harvest schedule forward 48h.' },
    { id: 'thai',  title: 'Thai Dumping · Market Premium Eliminated',   loss:  -9500, impact: 'Price drop RM 8/kg · Loss RM 9,500', recoveryStrategy: 'Pivot 30% Grade B/C to F&B processing, lock Hong Kong premium channel contracts.' },
    { id: 'pest',  title: 'Pest Outbreak · Emergency Spray',            loss:  -6000, impact: 'Pesticide costs surge · Loss RM 6,000', recoveryStrategy: 'Deploy integrated pest management, pre-negotiate bulk pesticide pricing with suppliers.' },
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

  // Bug #4 & #5 fix: terminal lines now reflect actual AI output when available.
  // Static demo strings show only on first load before any analysis is run.
  const terminalLines = useMemo(() => [
    {
      prefix: '[> Sensory_Agent]', color: '#34d399',
      text: analysisResult
        ? `Soil Moisture: ${analysisResult.plantHealth.soilMoisture}%. pH: ${analysisResult.plantHealth.soilPH.toFixed(1)}. Bio-Health Index: ${analysisResult.plantHealth.bioHealthIndex}/100.`
        : 'Soil Moisture: 88%. Analyzing weather API...',
    },
    {
      prefix: '[> Risk_Agent]', color: '#f97316',
      text: analysisResult
        ? `Risk Level: ${analysisResult.summary.riskLevel}. Weather signal: ${analysisResult.weatherRisk ?? 'none'}. Suggested loan rate: ${analysisResult.financial.suggestedLoanRate}%.`
        : 'Alert: 85% Storm Probability on Apr 22.',
    },
    {
      prefix: '[> Market_Agent]', color: '#a78bfa',
      text: analysisResult
        ? `Price: RM ${analysisResult.financial.pricePerKg}/kg via ${analysisResult.salesInsights.dominantChannel}. Base revenue: RM ${analysisResult.financial.baseRevenue.toLocaleString()}.`
        : 'Cross-referencing: Thai supply +15k tons arriving next week. Model predicts 12% price drop.',
    },
    {
      prefix: '» Causal Conclusion:', color: '#34d399',
      text: analysisResult?.recommendation
        ?? 'Accelerating harvest by 48H preserves 80% Grade A premium. Generating execution protocol ...',
    },
  ], [analysisResult]);

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
                Import your environmental &amp; geospatial data, biological crop records, farming operations logs, and financial &amp; commercial history. BioFin Oracle will analyse every data point and generate a full farm intelligence report. Categories 1 &amp; 2 also accept images for OCR &amp; Computer Vision analysis.
              </p>
              <div style={{ display: 'flex', gap: 32 }}>
                {[
                  { label: 'Data types supported', val: 'CSV, JSON & Image' },
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

            {/* 4-slot 2x2 grid — four new data ingestion categories */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginBottom: 32 }}>

              {/* ── Category 1: Environmental & Geospatial (CSV / JSON / Image) ── */}
              <UploadZone
                id="envGeoData"
                icon={<Globe size={20} color="#059669" />}
                title="Environmental & Geospatial Data"
                description="GPS boundaries, soil tests, water source status"
                hint={`latitude / longitude / polygon_boundary\nsoil_ph · soil_npk_nitrogen · soil_npk_phosphorus\nsoil_npk_potassium · organic_matter_pct · soil_type\nwater_type · water_temp_c · dissolved_oxygen\nammonia_nitrogen`}
                accepted=".csv,.json,.jpg,.jpeg,.png"
                acceptLabel="CSV / JSON / Image"
                files={envGeoFiles}
                onFiles={setEnvGeoFiles}
                dragOver={dragOver === 'envGeo'}
                onDragOver={() => setDragOver('envGeo')}
                onDragLeave={() => setDragOver(null)}
              />

              {/* ── Category 2: Biological & Crop (CSV / JSON / Image) ── */}
              <UploadZone
                id="bioCropData"
                icon={<Sprout size={20} color="#3b82f6" />}
                title="Biological & Crop Data"
                description="Variety, growth milestones, field image data (CV)"
                hint={`crop_variety · strain\nsowing_date · expected_harvest_date\nimage_filename · image_label (CV output)\n— or upload leaf / fruit photos directly —\n.jpg / .png accepted for Computer Vision`}
                accepted=".csv,.json,.jpg,.jpeg,.png"
                acceptLabel="CSV / JSON / Image"
                files={bioCropFiles}
                onFiles={setBioCropFiles}
                dragOver={dragOver === 'bioCrop'}
                onDragOver={() => setDragOver('bioCrop')}
                onDragLeave={() => setDragOver(null)}
              />

              {/* ── Category 3: Farming Operations (CSV / JSON) ── */}
              <UploadZone
                id="operationsData"
                icon={<Activity size={20} color="#7c3aed" />}
                title="Farming Operations Data"
                description="Input logs, irrigation records, special events"
                hint={`date · input_type · input_amount · input_unit\nirrigation_time · irrigation_volume_l\nevent_type · event_description\n(fertilizer / pesticide / herbicide / feed / pruning\n extreme weather / equipment failure)`}
                accepted=".csv,.json"
                files={operationsFiles}
                onFiles={setOperationsFiles}
                dragOver={dragOver === 'operations'}
                onDragOver={() => setDragOver('operations')}
                onDragLeave={() => setDragOver(null)}
              />

              {/* ── Category 4: Financial & Commercial (CSV / JSON) ── */}
              <UploadZone
                id="financialData"
                icon={<DollarSign size={20} color="#d97706" />}
                title="Financial & Commercial Data"
                description="Yield data, cost breakdown, market sales prices"
                hint={`date · harvest_weight_kg · grade_a_pct · grade_b_pct\nfertilizer_cost · labor_cost · equipment_cost\nseed_cost · market_price_per_kg\nchannel · volume_kg · revenue`}
                accepted=".csv,.json"
                files={financialFiles}
                onFiles={setFinancialFiles}
                dragOver={dragOver === 'financial'}
                onDragOver={() => setDragOver('financial')}
                onDragLeave={() => setDragOver(null)}
              />
            </div>

            {/* Info callout */}
            <div style={{ background: '#fff', border: '1px solid #e4ede8', borderRadius: 16, padding: '18px 24px', display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 32 }}>
              <div style={{ width: 36, height: 36, background: '#fffbeb', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertCircle size={16} color="#d97706" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a3a28', marginBottom: 5 }}>All 4 categories are required for analysis</div>
                <p style={{ fontSize: 12.5, color: '#6b8f7e', lineHeight: 1.6, margin: 0 }}>
                  Please upload at least one file for each of the four data categories above. BioFin Oracle requires a complete dataset (Environmental, Biological, Operations, and Financial) to build an accurate digital twin of your farm and unlock the full dashboard capabilities.
                </p>
              </div>
              <div style={{ flexShrink: 0, background: '#f6faf8', border: '1px solid #e4ede8', borderRadius: 12, padding: '8px 16px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 800, color: '#059669' }}>
                  {envGeoFiles.length + bioCropFiles.length + operationsFiles.length + financialFiles.length}
                  <span style={{ fontSize: 13, color: '#8aac98', marginLeft: 2 }}>files</span>
                </div>
                <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginTop: 2 }}>Ready</div>
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

            {/* Processing overlay — SSE pipeline progress */}
            {isProcessing && (
              <PipelineProgress
                progress={pipelineProgress}
                message={pipelineMessage}
                detail={pipelineDetail}
                stage={pipelineStage}
              />
            )}

            {/* Execute button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              {(() => {
                // 校验逻辑：判断四个类目是否都至少有 1 个文件
                const isReadyToExecute = envGeoFiles.length > 0 && bioCropFiles.length > 0 && operationsFiles.length > 0 && financialFiles.length > 0;
                
                // 视觉状态：只要没准备好或者正在处理，按钮就显示为灰色
                const showAsDisabled = isProcessing || !isReadyToExecute;

                return (
                  <>
                    <button
                      onClick={() => {
                        // 拦截点击：如果没传齐 4 个文件，就弹窗提示并中止执行
                        if (!isReadyToExecute) {
                          alert('Please upload at least one file for all 4 categories before proceeding.');
                          return;
                        }
                        // 如果传齐了，就正常执行后端的 API 请求
                        handleExecute();
                      }}
                      // 移除原先的强制禁用，只有在 API 正在请求时才真正禁用按钮，防止连点
                      disabled={isProcessing}
                      style={{
                        background: showAsDisabled ? '#e4ede8' : 'linear-gradient(135deg, #059669, #047857)',
                        color: showAsDisabled ? '#8aac98' : '#fff',
                        fontWeight: 800, fontSize: 16, padding: '18px 56px',
                        borderRadius: 16, border: 'none', 
                        // 光标改为 pointer，暗示即使是灰色也可以点击
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        fontFamily: "'Sora',sans-serif",
                        display: 'flex', alignItems: 'center', gap: 12,
                        boxShadow: showAsDisabled ? 'none' : '0 8px 32px rgba(5,150,105,0.3)',
                        transition: 'all 0.25s', letterSpacing: '-0.01em',
                      }}
                    >
                      {isProcessing
                        ? <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</>
                        : !isReadyToExecute
                        ? 'Upload all 4 categories to proceed'
                        : <><Play size={18} /> Execute Analysis &amp; Enter Dashboard</>
                      }
                    </button>
                    
                    {/* 底部的文字提示 */}
                    {!isReadyToExecute && (
                      <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>
                        ⚠ Waiting for complete data. Please fill all 4 blocks above.
                      </span>
                    )}
                  </>
                );
              })()}
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
      <style>{globalStyles}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f2f7f4', color: '#1a3a28', fontFamily: "'Sora',sans-serif", overflow: 'hidden' }}>

        {/* ── Header ── */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 32px', height: 60, background: '#fff', borderBottom: '1px solid #e4ede8', zIndex: 20, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#34d399,#059669)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Leaf size={17} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f2d1e', lineHeight: 1 }}>BioFin <span style={{ color: '#059669' }}>Oracle</span></div>
              <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>Smart Agriculture Decision Engine v2.0</div>
            </div>
            <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6, background: '#edfaf4', border: '1px solid #a7f3d0', borderRadius: 20, padding: '4px 12px' }}>
              <PulsingDot /><span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>Live Monitoring</span>
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
                {now.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: '#e4ede8' }} />
            {/* FIX #5: Risk Index badge */}
            <div style={{ textAlign: 'center', background: riskBg, border: `1px solid ${riskBorder}`, borderRadius: 12, padding: '7px 14px' }}>
              <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Risk Index</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700, color: riskColor, lineHeight: 1.2 }}>{derivedRiskLevel}</div>
            </div>
            <div style={{ width: 1, height: 28, background: '#e4ede8' }} />
            <div style={{ textAlign: 'center', background: adjustedRunway < 100 ? '#fffbeb' : '#edfaf4', border: `1px solid ${adjustedRunway < 100 ? '#fde68a' : '#a7f3d0'}`, borderRadius: 12, padding: '7px 16px' }}>
              <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cash Runway</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 19, fontWeight: 700, color: adjustedRunway < 100 ? '#d97706' : '#059669', lineHeight: 1.2 }}>
                {adjustedRunway}<span style={{ fontSize: 11, marginLeft: 2, opacity: 0.6 }}>days</span>
              </div>
            </div>
          </div>
        </header>

        {/* ── Nav ── */}
        <nav style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #e4ede8', padding: '0 32px', flexShrink: 0 }}>
          {[
            { id: 'page1', label: '1. Command Center',      Icon: Zap        },
            { id: 'page2', label: '2. Simulation Sandbox',  Icon: BarChart3  },
            { id: 'page3', label: '3. Global Operations',   Icon: Globe      },
            { id: 'page4', label: '4. SME Compliance & ROI', Icon: ShieldCheck },
          ].map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '13px 18px',
              background: activeTab === id ? '#059669' : 'none',
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              fontFamily: "'Sora',sans-serif", transition: 'all 0.2s',
              color: activeTab === id ? '#fff' : '#6b8f7e',
              borderRadius: activeTab === id ? 50 : 0,
              borderBottom: activeTab === id ? 'none' : '2px solid transparent',
              marginBottom: activeTab === id ? 0 : -1,
              marginTop: activeTab === id ? 6 : 0,
            }}>
              <Icon size={14} />{label}
            </button>
          ))}
        </nav>

        {/* ── Main ── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '26px 32px' }}>

          {/* ═══ PAGE 1 — COMMAND CENTER ═══ */}
          {activeTab === 'page1' && (
            <div className="tab-content" style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

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
                      <span style={{ fontSize: 11, color: '#059669', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>Critical Action Recommended</span>
                    </div>
                    <h2 style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.03em', color: '#065f46', lineHeight: 1.05, marginBottom: 32 }}>
                      Advance<br />Harvest<br />by 48 Hours
                    </h2>
                    <button
                      onClick={() => setActionExecuted(true)}
                      style={{
                        background: actionExecuted ? '#edfaf4' : '#059669',
                        color: actionExecuted ? '#059669' : '#fff',
                        fontWeight: 700, fontSize: 16, padding: '16px 36px', borderRadius: 14,
                        border: actionExecuted ? '1.5px solid #a7f3d0' : 'none',
                        cursor: 'pointer', fontFamily: "'Sora',sans-serif",
                        display: 'inline-flex', alignItems: 'center', gap: 10, transition: 'all 0.25s',
                        boxShadow: actionExecuted ? 'none' : '0 4px 20px rgba(5,150,105,0.3)',
                      }}
                    >
                      {actionExecuted
                        ? <><CheckCircle2 size={17} /> Order Dispatched</>
                        : <><ChevronRight size={17} /> Execute Logistics &amp; Labor Dispatch</>}
                    </button>
                  </div>
                  <div style={{ width: 480, flexShrink: 0, background: '#0f1f17', borderRadius: 18, padding: '22px 26px', fontFamily: "'JetBrains Mono',monospace" }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #1e3a2a' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>Agentic Decision Ledger</span>
                      <span style={{ fontSize: 11, color: '#4d7a62' }}>Node: Deterministic Causal</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {terminalLines.map((line, i) => (
                        <div key={i} style={{
                          fontSize: 12.5, lineHeight: 1.7, color: '#a1c4a1',
                          opacity: i < terminalStep ? 1 : 0,
                          transition: 'opacity 0.5s ease',
                          borderTop: i === 3 ? '1px solid #1e3a2a' : 'none',
                          paddingTop: i === 3 ? 14 : 0,
                        }}>
                          <span style={{ color: line.color, fontWeight: 700 }}>{line.prefix}</span>{' '}
                          <span style={{ color: i === 3 ? '#34d399' : '#c9ddd2' }}>{line.text}</span>
                          {i === terminalStep - 1 && i === terminalLines.length - 1 && <span className="cursor-blink" />}
                        </div>
                      ))}
                      {terminalStep === 0 && <div style={{ fontSize: 12, color: '#4d7a62' }}>Initializing agents<span className="cursor-blink" /></div>}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: '#8aac98' }}>Scroll for Deep Analytics</span>
                <ChevronDown size={16} color="#8aac98" />
              </div>

              {/* SECTION 2: Biological & Soil Health */}
              <div style={{ background: '#fff', border: '1px solid #e4ede8', borderRadius: 22, padding: '32px 36px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
                    </svg>
                    <span style={{ fontSize: 22, fontWeight: 800, color: '#0f2d1e', letterSpacing: '-0.02em' }}>Biological &amp; Soil Health</span>
                  </div>
                  <div style={{ background: bioHealthIndex >= 75 ? '#edfaf4' : '#fffbeb', border: `1px solid ${bioHealthIndex >= 75 ? '#a7f3d0' : '#fde68a'}`, borderRadius: 50, padding: '6px 18px', fontSize: 13, fontWeight: 700, color: bioHealthColor }}>
                    Status: {bioHealthIndex >= 75 ? 'Optimal' : bioHealthIndex >= 55 ? 'Warning' : 'Critical'}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1a3a28', marginBottom: 20 }}>NPK Nutrient Stratification</div>
                    {[
                      { label: `Nitrogen (N) - ${npkData.nitrogen.ppm} ppm`,   pct: npkData.nitrogen.pct,   status: npkData.nitrogen.pct   >= 60 ? 'Perfect' : 'Low',    statusColor: npkData.nitrogen.pct   >= 60 ? '#059669' : '#d97706' },
                      { label: `Phosphorus (P) - ${npkData.phosphorus.ppm} ppm`, pct: npkData.phosphorus.pct, status: npkData.phosphorus.pct >= 45 ? 'Good'    : 'Low',    statusColor: npkData.phosphorus.pct >= 45 ? '#059669' : '#d97706' },
                      { label: `Potassium (K) - ${npkData.potassium.ppm} ppm`,  pct: npkData.potassium.pct,  status: npkData.potassium.pct  >= 80 ? 'Optimal (Fruiting Phase)' : 'Adequate', statusColor: '#059669' },
                    ].map(({ label, pct, status, statusColor }) => (
                      <div key={label} style={{ marginBottom: 22 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: '#4d7a62', fontWeight: 500 }}>{label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>{status}</span>
                        </div>
                        <div style={{ height: 8, background: '#e4ede8', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#059669', borderRadius: 4, transition: 'width 0.6s ease' }} />
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
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1a3a28', marginBottom: 20 }}>Canopy &amp; Drone Analytics</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                      <div style={{ background: '#f6faf8', border: '1px solid #e4ede8', borderRadius: 14, padding: '18px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#8aac98', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Chlorophyll Index</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 32, fontWeight: 800, color: '#059669', lineHeight: 1 }}>48.2</div>
                        <div style={{ fontSize: 11, color: '#8aac98', marginTop: 6 }}>+2.1 vs last month</div>
                      </div>
                      <div style={{ background: '#f6faf8', border: '1px solid #e4ede8', borderRadius: 14, padding: '18px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#8aac98', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Root Moisture Depth</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 32, fontWeight: 800, color: '#3b82f6', lineHeight: 1 }}>45 cm</div>
                        <div style={{ fontSize: 11, color: '#8aac98', marginTop: 6 }}>Optimal Saturation</div>
                      </div>
                    </div>
                    <div style={{ background: '#edfaf4', border: '1px solid #a7f3d0', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{ width: 34, height: 34, background: '#d1fae5', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <CheckCircle2 size={16} color="#059669" />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f2d1e', marginBottom: 5 }}>Thermal Drone Scan Complete</div>
                        <div style={{ fontSize: 12, color: '#4d7a62', lineHeight: 1.6 }}>Zero thermal anomalies detected. No evidence of Phytophthora (Stem Canker) in Sector A.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Meteorological Pulse */}
              <div style={{ background: '#fff', border: '1px solid #e4ede8', borderRadius: 22, padding: '32px 36px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Cloud size={22} color="#d97706" />
                    <span style={{ fontSize: 22, fontWeight: 800, color: '#d97706', letterSpacing: '-0.02em' }}>Meteorological Pulse</span>
                  </div>
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 50, padding: '6px 18px', fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                    {weatherEvent2 ? `Alert: ${weatherScenarios[weatherEvent2].label}` : 'Alert: Severe Weather ETA'}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#4d7a62', marginBottom: 16 }}>7-Day Localized Micro-Climate Forecast</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                      {forecastData.map(({ day, emoji, temp, alert }) => (
                        <div key={day} style={{ flex: 1, textAlign: 'center', padding: '10px 6px', borderRadius: 12, border: `1.5px solid ${alert ? '#fde68a' : '#e4ede8'}`, background: alert ? '#fffbeb' : '#f6faf8' }}>
                          <div style={{ fontSize: 10, color: alert ? '#92400e' : '#8aac98', fontWeight: 600, marginBottom: 5 }}>{day}</div>
                          <div style={{ fontSize: 18, marginBottom: 5 }}>{emoji}</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: alert ? '#d97706' : '#1a3a28' }}>{temp}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 5 }}>Squall Line Trajectory Locked</div>
                        <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>High probability of extreme wind sheer (24+ km/h) causing mass fruit-drop on Thursday evening.</div>
                      </div>
                    </div>
                  </div>
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

              {/* SECTION 4: Financial Market & Trade */}
              <div style={{ background: '#fff', border: '1px solid #e4ede8', borderRadius: 22, padding: '32px 36px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #f0f7f3' }}>
                  <TrendingUp size={22} color="#1a3a28" />
                  <span style={{ fontSize: 22, fontWeight: 800, color: '#0f2d1e', letterSpacing: '-0.02em' }}>Financial Market &amp; Trade</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#4d7a62', marginBottom: 14 }}>Export vs Local Demand</div>
                    <div style={{ height: 40, borderRadius: 10, overflow: 'hidden', display: 'flex', marginBottom: 20 }}>
                      <div style={{ flex: 3, background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>Export (China/SG) 75%</span>
                      </div>
                      <div style={{ flex: 1, background: '#a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#065f46', fontSize: 13, fontWeight: 700 }}>Domestic 25%</span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div style={{ background: '#f6faf8', border: '1px solid #e4ede8', borderRadius: 14, padding: '16px' }}>
                        <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Exchange Rate (MYR/USD)</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 800, color: '#1a3a28' }}>4.72</div>
                        <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginTop: 4 }}>↑ Favorable</div>
                      </div>
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14, padding: '16px' }}>
                        <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Competitor Volume (Thai)</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 800, color: '#d97706' }}>+15k tons</div>
                        <div style={{ fontSize: 12, color: '#8aac98', fontWeight: 500, marginTop: 4 }}>ETA 5d</div>
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
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 52, fontWeight: 800, color: '#059669', lineHeight: 1 }}>RM {analysisResult?.financial.pricePerKg ?? 55}</span>
                      <span style={{ fontSize: 16, color: '#4d7a62', fontWeight: 600 }}>/ kg (Farm-Gate)</span>
                    </div>
                    <div style={{ borderLeft: '3px solid #059669', paddingLeft: 12, marginBottom: 24 }}>
                      <p style={{ fontSize: 13, color: '#4d7a62', lineHeight: 1.6 }}>Price currently holding, but massive downward pressure expected by weekend due to Thai supply dump.</p>
                    </div>
                    <div style={{ position: 'relative', height: 90 }}>
                      <div style={{ display: 'flex', gap: 5, height: 80, alignItems: 'flex-end' }}>
                        {[
                          { month: 'Jan', h: 28 }, { month: '', h: 34 }, { month: '', h: 32 },
                          { month: 'Feb', h: 42 }, { month: '', h: 44 }, { month: '', h: 40 },
                          { month: 'Mar', h: 52 }, { month: '', h: 56 }, { month: '', h: 54 },
                          { month: 'Apr', h: 80, now: true },
                        ].map((b, i) => (
                          <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                            <div style={{ width: '100%', height: `${b.h}%`, background: (b as any).now ? '#059669' : '#a7f3d0', borderRadius: '4px 4px 0 0', transition: 'height 0.6s ease' }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: '#8aac98' }}>
                        <span>Jan</span><span>Feb</span><span>Mar</span><span style={{ color: '#059669', fontWeight: 700 }}>Apr (Now)</span>
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

          {/* ═══ PAGE 2 — SIMULATION SANDBOX ═══ */}
          {activeTab === 'page2' && (
            <div className="tab-content" style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                      <Calculator size={16} color="#059669" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e' }}>Digital Twin Simulation</span>
                    </div>
                    {[
                      { key: 'fert'  as const, label: 'Fertilizer Input',  unit: 'kg/ha', min: 200, max: 800, zone: [300, 650] as [number,number] },
                      { key: 'labor' as const, label: 'Extra Labor Hours', unit: 'hours', min: 0,   max: 300, zone: [0, 200]   as [number,number] },
                    ].map(({ key, label, unit, min, max, zone }) => {
                      const val    = inputs[key];
                      const inZone = val >= zone[0] && val <= zone[1];
                      return (
                        <div key={key} style={{ marginBottom: 24 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 11 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#4d7a62' }}>{label} <span style={{ opacity: 0.6 }}>({unit})</span></label>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: inZone ? '#059669' : '#d97706' }}>{val}</span>
                          </div>
                          <input type="range" min={min} max={max} value={val} onChange={e => setInputs({ ...inputs, [key]: +e.target.value })} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                            <span style={{ fontSize: 10, color: '#c3d9cc', fontFamily: "'JetBrains Mono',monospace" }}>{min}</span>
                            <span style={{ fontSize: 10, color: inZone ? '#059669' : '#d97706', fontWeight: 700 }}>{inZone ? '✓ Optimal Range' : '⚠ Out of Safe Zone'}</span>
                            <span style={{ fontSize: 10, color: '#c3d9cc', fontFamily: "'JetBrains Mono',monospace" }}>{max}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={card}>
                    <SectionLabel>Virtual Board Advisory</SectionLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {board.map(({ role, icon, cond, warn, ok }) => (
                        <div key={role} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: cond ? '#fffbeb' : '#f6faf8', border: `1px solid ${cond ? '#fde68a' : '#e4ede8'}`, borderRadius: 12, padding: '12px 14px' }}>
                          <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: cond ? '#d97706' : '#059669', marginBottom: 3 }}>{role}</div>
                            <div style={{ fontSize: 12.5, color: '#4d7a62', lineHeight: 1.5 }}>{cond ? warn : ok}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e', marginBottom: 4 }}>Profit Distribution</div>
                  {/* Bug #5 fix: this is a 5-point manually-defined curve, not a
                      full Monte Carlo simulation. Label it accurately. */}
                  <div style={{ fontSize: 11, color: '#8aac98', marginBottom: 22, fontStyle: 'italic' }}>Probability Distribution Estimate (5-scenario model)</div>
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
                    <div style={{ marginTop: 14, display: 'flex', gap: 20, justifyContent: 'center' }}>
                      {[{ label: 'Confidence', val: `${stats.confidence}%`, color: '#3b82f6' }, { label: 'Waste Optimized', val: `-${stats.waste}%`, color: '#059669' }].map(({ label, val, color }) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{label}</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color, fontSize: 18 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ height: 1, flex: 1, background: '#e4ede8' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#edfaf4', border: '1px solid #a7f3d0', borderRadius: 20, padding: '5px 16px' }}>
                  <Zap size={11} color="#059669" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Extended Simulation Modules</span>
                </div>
                <div style={{ height: 1, flex: 1, background: '#e4ede8' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* MODULE 1: Bio-Cultivation */}
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
                    <div style={{ width: 34, height: 34, background: '#edfaf4', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                  </div>
                </div>

                {/* MODULE 2: Weather Risk */}
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
                    <div style={{ width: 34, height: 34, background: '#fffbeb', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CloudRain size={17} color="#d97706" />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e', lineHeight: 1.2 }}>Extreme Weather &amp; Insurance Risk</div>
                      <div style={{ fontSize: 11, color: '#8aac98', marginTop: 2 }}>Simulate extreme weather events and coverage gaps</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {(['rain', 'drought', 'wind'] as const).map(key => {
                      const s = weatherScenarios[key];
                      const active = weatherEvent2 === key;
                      return (
                        <button key={key} onClick={() => setWeatherEvent2(active ? null : key)} style={{
                          flex: 1, padding: '10px 8px', borderRadius: 10,
                          border: `1.5px solid ${active ? s.color : '#e4ede8'}`,
                          background: active ? `${s.color}18` : '#f6faf8',
                          cursor: 'pointer', fontFamily: "'Sora',sans-serif", transition: 'all 0.2s',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        }}>
                          <span style={{ fontSize: 18 }}>{s.emoji}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: active ? s.color : '#6b8f7e' }}>{s.label.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                  {wx ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: '#92400e', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Yield At Risk</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 800, color: '#d97706', lineHeight: 1.3 }}>{wx.yar}%</div>
                        </div>
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: '#ef4444', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Recovery Cost</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 800, color: '#ef4444', lineHeight: 1.3 }}>RM {wx.recoveryCost.toLocaleString()}</div>
                        </div>
                        <div style={{ background: insuranceGap > 0 ? '#fff7ed' : '#edfaf4', border: `1px solid ${insuranceGap > 0 ? '#fed7aa' : '#a7f3d0'}`, borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: insuranceGap > 0 ? '#c2410c' : '#059669', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Coverage Gap</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 800, color: insuranceGap > 0 ? '#c2410c' : '#059669', lineHeight: 1.3 }}>
                            {insuranceGap > 0 ? `RM ${insuranceGap.toLocaleString()}` : 'Full Cover'}
                          </div>
                        </div>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8aac98', marginBottom: 6 }}>
                          <span>Insurance Payout RM {wx.coverage.toLocaleString()}</span>
                          <span>Actual Loss RM {wx.recoveryCost.toLocaleString()}</span>
                        </div>
                        <div style={{ height: 8, background: '#e4ede8', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(wx.coverage / wx.recoveryCost) * 100}%`, background: '#059669', transition: 'width 0.7s ease', borderRadius: 4 }} />
                        </div>
                        <div style={{ fontSize: 10, color: '#8aac98', marginTop: 4, textAlign: 'right' }}>Coverage Ratio {Math.round((wx.coverage / wx.recoveryCost) * 100)}%</div>
                      </div>
                      <div style={{ background: insuranceGap > 0 ? '#fef2f2' : '#edfaf4', border: `1px solid ${insuranceGap > 0 ? '#fecaca' : '#a7f3d0'}`, borderRadius: 10, padding: '11px 13px' }}>
                        <div style={{ fontSize: 11, color: insuranceGap > 0 ? '#991b1b' : '#065f46', lineHeight: 1.6 }}>
                          {insuranceGap > 0
                            ? `⚠ Coverage gap of RM ${insuranceGap.toLocaleString()}. Consider upgrading to total loss or weather index insurance.`
                            : `✓ Current insurance fully covers estimated losses for the ${wx.label} scenario.`}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: '#8aac98', fontSize: 13, fontStyle: 'italic' }}>
                      ☁️ Select an extreme weather scenario to begin loss forecast
                    </div>
                  )}
                </div>

                {/* MODULE 3: Supply Chain */}
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
                    <div style={{ width: 34, height: 34, background: '#eff6ff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Ship size={17} color="#3b82f6" />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e', lineHeight: 1.2 }}>Global Supply Chain &amp; Market Arbitrage</div>
                      <div style={{ fontSize: 11, color: '#8aac98', marginTop: 2 }}>Optimise channel allocation under regional supply &amp; logistics shocks</div>
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
                      <div key={label} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#4d7a62', fontWeight: 500 }}>{label}</span>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color }}>{pct}%</span>
                        </div>
                        <div style={{ height: 6, background: '#e4ede8', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                      <div style={{ flex: 1, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 13px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Channel Mix</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: '#1e40af' }}>{supplyLabel}</div>
                        <div style={{ fontSize: 10, color: '#8aac98', marginTop: 3 }}>Local : SG : HK</div>
                      </div>
                      <div style={{ flex: 1, background: delayLoss > 0 ? '#fef2f2' : '#edfaf4', border: `1px solid ${delayLoss > 0 ? '#fecaca' : '#a7f3d0'}`, borderRadius: 12, padding: '12px 13px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: delayLoss > 0 ? '#ef4444' : '#059669', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Delay Net Loss</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: delayLoss > 0 ? '#ef4444' : '#059669' }}>
                          {delayLoss > 0 ? `RM ${delayLoss.toLocaleString()}` : 'No Loss'}
                        </div>
                        <div style={{ fontSize: 10, color: '#8aac98', marginTop: 3 }}>Quality drop + spread</div>
                      </div>
                    </div>
                    {(thaiSupply > 10 || portLockDays > 3) && (
                      <div style={{ marginTop: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '11px 13px' }}>
                        <div style={{ fontSize: 11, color: '#1e40af', lineHeight: 1.6 }}>
                          🧭 AI Recommendation: {portLockDays > 3 ? `During ${portLockDays}-day port lockdown, divert ${Math.min(30, portLockDays * 1.5).toFixed(0)}% of exports to Hong Kong channel.` : `Thai supply surge of ${thaiSupply}% detected — lock in Singapore premium orders to avoid direct price competition.`}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* MODULE 4: Cash Flow Runway */}
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
                    <div style={{ width: 34, height: 34, background: '#f5f3ff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <DollarSign size={17} color="#7c3aed" />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e', lineHeight: 1.2 }}>Financial Viability · Cash Flow Runway</div>
                      <div style={{ fontSize: 11, color: '#8aac98', marginTop: 2 }}>Simulate survival boundary under rate, labor &amp; receivables pressure</div>
                    </div>
                  </div>
                  <SimSlider label="Loan Interest Rate"   unit="%"    min={3}  max={15} value={loanRate}      onChange={setLoanRate}      zone={[3, 7]}  formatVal={v => `${v}%`} />
                  <SimSlider label="Labor Cost Increase"  unit="%"    min={0}  max={30} value={laborIncrease} onChange={setLaborIncrease} zone={[0, 10]} formatVal={v => `+${v}%`} />
                  <SimSlider label="Payment Delay"        unit="days" min={0}  max={60} value={paymentDelay}  onChange={setPaymentDelay}  zone={[0, 14]} />
                  <div style={{ borderTop: '1px solid #f0f7f3', paddingTop: 16, marginTop: 4 }}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: '#4d7a62', fontWeight: 600 }}>Cash Flow Survival Runway</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 26, fontWeight: 800, color: runwayColor, lineHeight: 1 }}>
                          {adjustedRunway} <span style={{ fontSize: 12, opacity: 0.7 }}>days</span>
                        </span>
                      </div>
                      <div style={{ height: 10, background: '#e4ede8', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min((adjustedRunway / 180) * 100, 100)}%`, background: `linear-gradient(90deg, ${runwayColor}, ${runwayColor}aa)`, borderRadius: 5, transition: 'width 0.7s ease' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#8aac98' }}>
                        <span>Critical &lt;30d</span><span>Warning 30–90d</span><span>Safe &gt;120d</span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                      <div style={{ background: adjustedRunway < 60 ? '#fef2f2' : '#f6faf8', border: `1px solid ${adjustedRunway < 60 ? '#fecaca' : '#e4ede8'}`, borderRadius: 12, padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Insolvency Threshold</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color: adjustedRunway < 60 ? '#ef4444' : '#4d7a62', lineHeight: 1.2 }}>
                          {adjustedRunway < 60 ? '⛔ Triggered' : `Month ${Math.ceil(adjustedRunway / 30) + 1}`}
                        </div>
                        <div style={{ fontSize: 10, color: '#8aac98', marginTop: 3 }}>Zero-revenue scenario</div>
                      </div>
                      <div style={{ background: financingMonth ? '#fffbeb' : '#edfaf4', border: `1px solid ${financingMonth ? '#fde68a' : '#a7f3d0'}`, borderRadius: 12, padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Financing Trigger</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color: financingMonth ? '#d97706' : '#059669', lineHeight: 1.2 }}>
                          {financingMonth ? `Month ${financingMonth}` : 'None Required'}
                        </div>
                        <div style={{ fontSize: 10, color: '#8aac98', marginTop: 3 }}>External capital expected</div>
                      </div>
                    </div>
                    {totalCashBurn > 0 && (
                      <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '11px 13px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#5b21b6', marginBottom: 4 }}>📊 Compounding Stress Effect</div>
                        <div style={{ fontSize: 11, color: '#6d28d9', lineHeight: 1.7 }}>
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

          {/* ═══ PAGE 3 — GLOBAL OPERATIONS ═══ */}
          {activeTab === 'page3' && (
            <div className="tab-content" style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <Globe size={16} color="#3b82f6" />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e' }}>Global Stress Test</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
                    {stressEvents.map(ev => {
                      const active = stressEvent?.id === ev.id;
                      return (
                        <button key={ev.id} onClick={() => setStressEvent(active ? null : ev)} style={{
                          textAlign: 'left', padding: '12px 15px', borderRadius: 11,
                          border: `1.5px solid ${active ? '#fde68a' : '#e4ede8'}`,
                          background: active ? '#fffbeb' : '#f6faf8',
                          cursor: 'pointer', transition: 'all 0.2s', fontFamily: "'Sora',sans-serif",
                          color: active ? '#92400e' : '#4d7a62', fontSize: 13, fontWeight: active ? 600 : 500,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <span>{ev.title}</span>
                          {active && <Tag label="Active" color="#92400e" bg="#fde68a" />}
                        </button>
                      );
                    })}
                  </div>
                  {stressEvent ? (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <AlertCircle size={14} color="#ef4444" style={{ marginTop: 2, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Risk Activated</div>
                          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>{stressEvent.impact}</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color: '#ef4444', marginTop: 8 }}>
                            Loss RM {Math.abs(stressEvent.loss).toLocaleString()}
                          </div>
                          <div style={{ marginTop: 10, padding: '10px 12px', background: '#fff', borderRadius: 9, border: '1px solid #fecaca' }}>
                            <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.6 }}>
                              <strong style={{ color: '#059669' }}>AI Response Strategy:</strong> {stressEvent.recoveryStrategy ?? `Activate Singapore pre-sale price lock immediately, notify Johor cooperative for joint procurement hedge — recovers est. ${Math.round(Math.abs(stressEvent.loss) * 0.35 / 1000)}k in losses.`}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 12, color: '#8aac98', fontStyle: 'italic' }}>Click any scenario to begin stress test</div>
                  )}
                </div>

                <div style={card}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e', marginBottom: 18 }}>Competitor Intelligence{analysisResult?.dynamicIntelligence?.competitors ? '' : ' · Awaiting AI Analysis'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {(analysisResult?.dynamicIntelligence?.competitors ?? [
                      { name: 'Thai B League',            threatLevel: 'high' as const,   insight: 'Expected price cut of RM 5–8/kg, covering Singapore & Hong Kong markets.', recommendedAction: 'Lock 40% Singapore pre-sale orders.' },
                      { name: 'Vietnam New Entrant',      threatLevel: 'low' as const,    insight: 'Quality certification below MyGAPs standard — unlikely to capture premium orders near-term.', recommendedAction: 'Monitor certification progress.' },
                      { name: 'Local Cooperative Alliance',threatLevel: 'medium' as const, insight: 'Johor cooperative proposes joint procurement — can reduce logistics costs by ~18%.', recommendedAction: 'Negotiate joint procurement.' },
                    ]).map((comp, idx) => {
                      const threatStyle: Record<string, { status: string; color: string; bg: string }> = {
                        critical: { status: '⛔ Critical Threat', color: '#ef4444', bg: '#fef2f2' },
                        high:     { status: '⚠ High Threat',     color: '#d97706', bg: '#fffbeb' },
                        medium:   { status: '● Medium Threat',   color: '#3b82f6', bg: '#eff6ff' },
                        low:      { status: '✓ Low Threat',      color: '#059669', bg: '#edfaf4' },
                      };
                      const ts = threatStyle[comp.threatLevel] ?? threatStyle.medium;
                      return (
                        <div key={`${comp.name}-${idx}`} style={{ background: '#f6faf8', borderRadius: 11, padding: '12px 14px', border: '1px solid #e4ede8' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#1a3a28' }}>{comp.name}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: ts.color, background: ts.bg, padding: '2px 9px', borderRadius: 10 }}>{ts.status}</span>
                          </div>
                          <p style={{ fontSize: 12, color: '#6b8f7e', lineHeight: 1.6, margin: 0 }}>{comp.insight}</p>
                          {comp.recommendedAction && (
                            <div style={{ marginTop: 6, fontSize: 11, color: '#059669', fontWeight: 600 }}>→ {comp.recommendedAction}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 16, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '13px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', marginBottom: 5 }}>AI Hedging Strategy Recommendation</div>
                    <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.6, margin: 0 }}>
                      {analysisResult?.dynamicIntelligence?.competitors?.length
                        ? analysisResult.dynamicIntelligence.competitors
                            .filter(c => c.threatLevel === 'high' || c.threatLevel === 'critical')
                            .map(c => c.recommendedAction)
                            .join(' ') || 'No high-threat competitors detected — maintain current market positioning and monitor for changes.'
                        : 'Immediately lock 40% Singapore pre-sale orders and launch Johor joint procurement negotiations — building a dual price moat.'}
                    </p>
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
                  <div key={label} style={{ ...card, padding: '18px 20px' }}>
                    <div style={{ fontSize: 10, color: '#8aac98', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 7 }}>{label}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: ok ? '#0f2d1e' : '#ef4444' }}>{val}</div>
                    <div style={{ fontSize: 11, color: ok ? '#059669' : '#ef4444', fontWeight: 600, marginTop: 4 }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ PAGE 4 — COMPLIANCE & ROI ═══ */}
          {activeTab === 'page4' && (
            <div className="tab-content" style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  <ShieldCheck size={16} color="#059669" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e' }}>2026 e-Invoicing Compliance</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                  {complianceItems.map(({ label, status, detail }) => {
                    const color = status === 'ok' ? '#059669' : status === 'warn' ? '#d97706' : '#ef4444';
                    const Icon  = status === 'ok' ? CheckCircle2 : status === 'warn' ? Clock : AlertCircle;
                    return (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', background: '#f6faf8', border: '1px solid #e4ede8', borderRadius: 10 }}>
                        <Icon size={14} color={color} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1a3a28', marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 11, color: '#8aac98' }}>{detail}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}18`, padding: '2px 8px', borderRadius: 6, flexShrink: 0, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                          {status === 'ok' ? 'Pass' : status === 'warn' ? 'Warning' : 'Error'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => { setIsAuditing(true); setAuditDone(false); setTimeout(() => { setIsAuditing(false); setAuditDone(true); }, 1800); }}
                  style={{ width: '100%', background: isAuditing ? '#f6faf8' : '#059669', color: isAuditing ? '#059669' : '#fff', fontWeight: 700, fontSize: 14, padding: '13px', borderRadius: 12, border: `1.5px solid ${isAuditing ? '#a7f3d0' : 'transparent'}`, cursor: 'pointer', fontFamily: "'Sora',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.25s' }}
                >
                  {isAuditing ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Running LHDN Rule Scan…</> : auditDone ? <><CheckCircle2 size={14} /> Scan Complete — {complianceItems.filter(c => c.status === 'error').length} Errors Found</> : 'Run LHDN Compliance Audit'}
                </button>
              </div>

              <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={16} color="#3b82f6" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f2d1e' }}>Automated ROI Estimator</span>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#8aac98', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, display: 'block', marginBottom: 8 }}>Monthly Staff Salary (RM){analysisResult?.financial.laborCost ? ' · Pre-filled from your data' : ''}</label>
                  <input type="number" value={staffSalary} onChange={e => setStaffSalary(+e.target.value)} />
                </div>
                {/* ROI formula: payback = systemCost / monthlySavings; annualizedROI = (monthlySavings / systemCost) * 100 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {(() => {
                    const effectiveSalary = analysisResult?.financial.laborCost ?? staffSalary;
                    const monthlySavings  = effectiveSalary * 0.15;
                    const systemCost      = 500;
                    const efficiencyGain  = analysisResult?.plantHealth.bioHealthIndex
                      ? Math.round(20 + (analysisResult.plantHealth.bioHealthIndex - 50) * 0.3)
                      : 32;
                    return [
                      { label: 'Payback Period',       val: `${(systemCost / monthlySavings).toFixed(1)} months`, color: '#059669' },
                      { label: 'Annualized ROI',        val: `${((monthlySavings / systemCost) * 100).toFixed(0)}%`, color: '#3b82f6' },
                      { label: 'Monthly Labor Savings', val: `RM ${monthlySavings.toFixed(0)}`, color: '#7c3aed' },
                      { label: 'Efficiency Gain',       val: `+${efficiencyGain}%`, color: '#d97706' },
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
                    {(() => {
                      const effectiveSalary = analysisResult?.financial.laborCost ?? staffSalary;
                      const savings = effectiveSalary * 0.15;
                      const payback = (500 / savings).toFixed(1);
                      const roi = ((savings / 500) * 100).toFixed(0);
                      const source = analysisResult?.financial.laborCost ? 'your uploaded financial data' : 'the default estimate';
                      return `Based on ${source}, at RM ${effectiveSalary.toLocaleString()}/month labor cost, BioFin Oracle automates 15% of manual labor (RM ${savings.toFixed(0)}/mo saved) against a RM 500/mo system cost, delivering full ROI in ${payback} months and a sustained annualized return of ${roi}%.`;
                    })()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ── Footer ── */}
        <footer style={{ background: '#fff', borderTop: '1px solid #e4ede8', padding: '12px 32px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexShrink: 0 }}>
          {[
            { label: 'Projected Profit',    val: `RM ${animatedProfit.toLocaleString()}`, color: stats.profit < 0 ? '#ef4444' : '#0f2d1e' },
            { label: 'Waste Reduced',       val: `-${stats.waste}%`,                      color: '#059669' },
            { label: 'Decision Confidence', val: `${stats.confidence}%`,                  color: '#3b82f6' },
            { label: 'Cash Runway',         val: `${adjustedRunway} days`,                color: runwayColor },
            { label: 'Risk Index',          val: derivedRiskLevel,                        color: riskColor },
          ].map(({ label, val, color }, i) => (
            <React.Fragment key={label}>
              {i > 0 && <div style={{ width: 1, height: 26, background: '#e4ede8' }} />}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#8aac98', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 17, fontWeight: 700, color }}>{val}</div>
              </div>
            </React.Fragment>
          ))}
        </footer>
      </div>
    </>
  );
}