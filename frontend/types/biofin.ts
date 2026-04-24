// ─── BioFin Oracle — Shared Type Contracts ───────────────────────────────────
//
// Single source of truth for the SSE event shapes and the AnalysisResult
// interface. Import from both route.ts (backend) and page.tsx (frontend) to
// guarantee the two sides never silently drift apart.
//
// Architecture note: keeping interfaces here (rather than co-located with
// either file) means a future SDK, test suite, or third-party integration
// can import from @/types/biofin without pulling in framework-specific code.

// ─── SSE Event Shapes ─────────────────────────────────────────────────────────

export interface SSEStageEvent {
  stage: 'parsing' | 'summarising' | 'searching' | 'analyzing' | 'sanitising';
  message: string;
  progress: number; // 0–100 — drives the progress bar on the frontend
  detail?: string;  // optional sub-message (e.g. "3 Tavily queries running…")
}

export interface SSEErrorEvent {
  message: string;
  fallback: boolean; // true = safe defaults returned, false = total failure
}

// ─── AnalysisResult — the exact shape the frontend expects ───────────────────

// ─── Dynamic Intelligence — LLM-generated market & risk insights ──────────────

export interface CompetitorIntel {
  name: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  insight: string;
  recommendedAction: string;
}

export interface StressTestScenario {
  id: string;
  title: string;
  impact: string;
  lossEstimate: number;
  recoveryStrategy: string;
}

export interface DynamicIntelligence {
  competitors: CompetitorIntel[];
  stressTests: StressTestScenario[];
}

export interface AnalysisResult {
  bioFertReduction: number;
  bioIrrigation: number;
  inputs: { fert: number; labor: number };
  loanRate: number;
  dynamicIntelligence?: DynamicIntelligence;
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
    suggestedLoanRate: number; pricePerKg: number; baseRevenue: number;
  };
  salesInsights: {
    avgPricePerKg: number; avgVolumeKg: number;
    priceVolatilityPct: number; minPrice: number; maxPrice: number;
    dominantChannel: string; hasData: boolean;
    unsalableRisk: boolean;
    alternativeStrategy: string | null;
  };
  compliance: { label: string; status: 'ok' | 'warn' | 'error'; detail: string }[];
  recommendation: string;
  marketNews?: { query: string; title: string; snippet: string; url: string }[];
  summary: {
    totalDataPoints: number; plantGrowthRecords: number;
    envRecords: number; weatherRecords: number; salesRecords: number;
    overallHealthScore: number; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    filesUploaded: number;
  };
}
