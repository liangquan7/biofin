// ─── BioFin Oracle — Shared Type Contracts ───────────────────────────────────
//
// Single source of truth for:
//   • SSE event shapes
//   • AnalysisResult interface (and every sub-interface)
//   • Shared runtime constants  (BIOFIN_CONSTANTS)
//   • Default demo data arrays  (DEFAULT_COMPETITORS, DEFAULT_STRESS_TESTS)
//
// Import from both route.ts (backend) and page.tsx (frontend).
// Nothing in this file should import from Next.js, React, or any framework —
// it must remain portable for tests, SDKs, and third-party integrations.

// ─── Shared Runtime Constants ─────────────────────────────────────────────────
//
// Previously these were duplicated as separate `const` blocks in route.ts and
// page.tsx. Keeping them here means a single edit propagates everywhere.
//
export const BIOFIN_CONSTANTS = {
  SYSTEM_MONTHLY_COST_RM:           500,   // BioFin Oracle SaaS subscription price
  LABOR_AUTOMATION_RATE:            0.15,  // Fraction of labor cost the system automates
  RUNWAY_GREEN_THRESHOLD:           120,   // Days — above = healthy, below = watch/critical
  RUNWAY_YELLOW_THRESHOLD:          70,    // Days — below = critical
  RUNWAY_DEFAULT_DAYS:              142,
  RUNWAY_LOAN_SENSITIVITY:          5.5,   // Days lost per 1% loan rate increase above 5%
  RUNWAY_LABOR_SENSITIVITY:         1.8,   // Days lost per RM unit of labour slider
  RUNWAY_PAYMENT_DELAY_SENSITIVITY: 0.55,  // Days lost per day of payment delay
  RUNWAY_FLOOR_DAYS:                18,    // Runway can never simulate below this
  CONFIDENCE_BASE:                  60,
  CONFIDENCE_FILE_WEIGHT:           20,
  CONFIDENCE_DENSITY_WEIGHT:        10,
  CONFIDENCE_AI_SUCCESS_WEIGHT:     10,
  HEDGE_BASE_PCT:                   25,
  HEDGE_PER_STRATEGY_PCT:           5,
  HEDGE_MAX_PCT:                    70,
  SST_THRESHOLD_RM:                 500_000, // Annual revenue requiring SST registration
  SST_WARNING_BUFFER_RM:            50_000,  // Show warning this many RM below threshold
} as const;

// ─── Default Demo / Fallback Data ────────────────────────────────────────────
//
// These were previously copy-pasted between buildDefaultResult() in route.ts
// and the fallback arrays in page.tsx, causing silent drift. Both sides now
// import from here. The content is intentionally crop-agnostic; route.ts
// overrides them with LLM-generated data when files are uploaded.
//
export const DEFAULT_COMPETITORS: CompetitorIntel[] = [
  {
    name:              'Thai B League',
    threatLevel:       'high',
    insight:           'Expected price cut of RM 5–8/kg, covering Singapore & Hong Kong markets.',
    recommendedAction: 'Lock 40% Singapore pre-sale orders to secure premium pricing before Thai supply hits.',
  },
  {
    name:              'Vietnam New Entrant',
    threatLevel:       'low',
    insight:           'Quality certification below MyGAP standard — unlikely to capture premium orders near-term.',
    recommendedAction: 'Monitor certification progress; maintain quality advantage as differentiator.',
  },
  {
    name:              'Local Cooperative Alliance',
    threatLevel:       'medium',
    insight:           'Johor cooperative proposes joint procurement — can reduce logistics costs by ~18%.',
    recommendedAction: 'Recommend lock-in: negotiate joint procurement to build dual price moat.',
  },
];

export const DEFAULT_STRESS_TESTS: StressTestScenario[] = [
  {
    id:               'port_lockdown',
    title:            'Port Klang 7-Day Logistics Disruption',
    impact:           'Logistics disruption · Direct loss RM 15,000',
    lossEstimate:     -15_000,
    recoveryStrategy: 'Activate Singapore pre-sale price lock immediately, notify Johor cooperative for joint procurement hedge.',
  },
  {
    id:               'extreme_rain',
    title:            'Extreme Rainfall · Farmland Flooded 3 Days',
    impact:           '40% yield loss · Estimated loss RM 22,000',
    lossEstimate:     -22_000,
    recoveryStrategy: 'Trigger crop insurance claim, accelerate drainage maintenance, shift harvest schedule forward 48h.',
  },
  {
    id:               'thai_dumping',
    title:            'Thai Dumping · Market Premium Eliminated',
    impact:           'Price drop RM 8/kg · Loss RM 9,500',
    lossEstimate:     -9_500,
    recoveryStrategy: 'Pivot 30% Grade B/C to F&B processing, lock Hong Kong premium channel contracts.',
  },
  {
    id:               'pest_outbreak',
    title:            'Pest Outbreak · Emergency Spray',
    impact:           'Pesticide costs surge · Loss RM 6,000',
    lossEstimate:     -6_000,
    recoveryStrategy: 'Deploy integrated pest management, pre-negotiate bulk pesticide pricing with suppliers.',
  },
];

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

// ─── Weather Forecast Entry ───────────────────────────────────────────────────
//
// BREAKING CHANGE vs previous version:
//   `temp: string`  (e.g. "32°C")  →  `tempC: number`  (e.g. 32)
//
// Rationale: storing a pre-formatted string in the data layer couples
// unit formatting to the data model, making numeric comparisons impossible
// (e.g. "alert if temp > 35") without string parsing.  The "°C" suffix
// belongs exclusively at the React render layer: {`${f.tempC}°C`}.
//
export interface WeatherForecastDay {
  day:   string;   // "Today" | "Mon" | "Tue" …
  emoji: string;   // "☀️" | "🌧️" | "⛈️" …
  tempC: number;   // degrees Celsius as a plain number
  alert: boolean;  // true = threshold-breaching weather event
}

// ─── AnalysisResult — the exact shape the frontend expects ───────────────────

export interface AnalysisResult {
  // ── Identity ────────────────────────────────────────────────────────────────
  // Added in Quick Win #2. Both fields are populated server-side in route.ts
  // and are read-only on the frontend. They enable audit trails, persistence,
  // and future analysis-comparison features.
  analysisId:  string;   // cuid() generated at the start of the POST handler
  generatedAt: string;   // ISO 8601 timestamp — new Date().toISOString()

  // ── Crop / Region context ────────────────────────────────────────────────────
  // Set from bioCrop data (or defaults). Passed through the LLM system prompt
  // to make all analysis crop-aware instead of hardcoded to Musang King.
  cropType: string;   // e.g. "Musang King (D197)" | "MR219 Rice" | "Tenera Palm"
  region:   string;   // e.g. "Pahang, Malaysia" | "Kedah, Malaysia"

  // ── Core analysis fields ─────────────────────────────────────────────────────
  bioFertReduction: number;
  bioIrrigation:    number;
  inputs: { fert: number; labor: number };
  loanRate: number;

  // dynamicIntelligence is now REQUIRED (not optional).
  // sanitiseResult() always populates it (falling back to DEFAULT_* arrays),
  // so the frontend can rely on it without null-checks.
  dynamicIntelligence: DynamicIntelligence;

  plantHealth: {
    bioHealthIndex:   number;
    gradeARatio:      number;
    gradeBRatio:      number;
    expectedLifespan: number;
    soilPH:           number;
    soilMoisture:     number;
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
    avgRainfall:  number;
    avgTempMax:   number;
    maxWindSpeed: number;
    forecast: WeatherForecastDay[]; // uses tempC: number — see type above
  };

  financial: {
    expectedProfit:    number;
    cashRunway:        number;
    fertCost:          number;
    laborCost:         number;
    weatherLoss:       number;
    suggestedLoanRate: number;
    pricePerKg:        number;
    baseRevenue:       number;
    // Seasonal annual estimate — more accurate than baseRevenue × 12 for
    // crops with 1–2 harvests per year. Populated by the LLM.
    annualRevenueEstimate: number;
  };

  salesInsights: {
    avgPricePerKg:      number;
    avgVolumeKg:        number;
    priceVolatilityPct: number;
    minPrice:           number;
    maxPrice:           number;
    dominantChannel:    string;
    hasData:            boolean;
    unsalableRisk:      boolean;
    alternativeStrategy: string | null;
  };

  compliance: { label: string; status: 'ok' | 'warn' | 'error'; detail: string }[];

  criticalActionTitle: string;

  recommendation: string;

  marketNews?: { query: string; title: string; snippet: string; url: string }[];

  // isMockData — true when no files were uploaded and all values are defaults.
  // The frontend uses this to show a "Demonstration data" banner so users are
  // never misled by fictional competitor/stress-test content.
  isMockData: boolean;

  summary: {
    totalDataPoints:    number;
    plantGrowthRecords: number;
    envRecords:         number;
    weatherRecords:     number;
    salesRecords:       number;
    overallHealthScore: number;
    riskLevel:          'LOW' | 'MEDIUM' | 'HIGH';
    filesUploaded:      number;
  };
}
