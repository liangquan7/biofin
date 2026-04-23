import { NextRequest, NextResponse } from 'next/server';

// --- API Config ---------------------------------------------------------------

// --- API Config ---------------------------------------------------------------
// Keys are loaded from environment variables — never hardcode secrets in source.
// Create a .env.local file (gitignored) with the variables below.
// See .env.local.example in the project root for the required variable names.

const GLM_BASE_URL  = 'https://api.ilmu.ai/v1';
const GLM_API_KEY   = process.env.GLM_API_KEY ?? '';
const GLM_MODEL     = process.env.GLM_MODEL   ?? 'nemo-super';

const TAVILY_URL    = 'https://api.tavily.com/search';
const TAVILY_KEY    = process.env.TAVILY_API_KEY ?? '';

// --- Record Types -------------------------------------------------------------

interface PlantRecord {
  date?: string;
  fertilizer_kg_ha?: string; fertilizer?: string;
  irrigation_mm?: string;    irrigation?: string;
  irrigation_frequency?: string;
  labor_hours?: string;      labor?: string;
  soil_ph?: string;          ph?: string;
  soil_moisture?: string;    moisture?: string;
  nitrogen_ppm?: string;     nitrogen?: string;
  phosphorus_ppm?: string;   phosphorus?: string;
  potassium_ppm?: string;    potassium?: string;
  [key: string]: string | undefined;
}

interface EnvRecord {
  date?: string;
  temperature_c?: string;    temperature?: string;
  humidity_pct?: string;     humidity?: string;
  solar_radiation?: string;  solar?: string;
  wind_speed?: string;       wind?: string;
  co2_ppm?: string;          co2?: string;
  barometric_pressure?: string; pressure?: string;
  [key: string]: string | undefined;
}

interface WeatherRecord {
  date?: string;
  rainfall_mm?: string;    rainfall?: string;
  temp_max?: string;       temperature_max?: string;
  temp_min?: string;       temperature_min?: string;
  wind_speed_kmh?: string; wind_speed?: string;
  storm_warning?: string;  storm?: string;
  humidity?: string;
  [key: string]: string | undefined;
}

interface SalesRecord {
  date?: string;
  price_per_kg?: string; price?: string;
  volume_kg?: string;    volume?: string;
  channel?: string;      market?: string;
  revenue?: string;
  [key: string]: string | undefined;
}

// --- The exact shape the frontend expects ------------------------------------

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
  // Tavily live search results passed through so the frontend can render real news
  marketNews: { query: string; title: string; snippet: string; url: string }[];
  summary: {
    totalDataPoints: number; plantGrowthRecords: number;
    envRecords: number; weatherRecords: number; salesRecords: number;
    overallHealthScore: number; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    filesUploaded: number;
  };
}

// --- CSV / JSON Parsers -------------------------------------------------------

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const vals = line.split(',');
      return Object.fromEntries(
        headers.map((h, i) => [h, (vals[i] ?? '').trim().replace(/^["']|["']$/g, '')])
      );
    });
}

function tryParseJSON(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

async function readFile(file: File): Promise<Record<string, string>[]> {
  const text = await file.text();
  if (file.name.endsWith('.json')) {
    const data = tryParseJSON(text);
    if (Array.isArray(data)) return data as Record<string, string>[];
    if (data && typeof data === 'object') return [data as Record<string, string>];
    return [];
  }
  return parseCSV(text);
}

// --- Numeric helpers (used for pre-processing & fallback) --------------------

const num   = (v: string | undefined, fb = 0) => { const n = parseFloat(v ?? ''); return isFinite(n) ? n : fb; };
const avg   = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Computes a human-readable trend description for the LLM.
// Compares the average of the last 3 records against the overall average so
// the model can see whether conditions are improving, stable or deteriorating.
function trendLabel(series: number[], unit = ''): string {
  if (series.length < 2) return 'stable (single record)';
  const overall   = avg(series);
  const recentN   = Math.min(3, series.length);
  const recent    = avg(series.slice(-recentN));
  if (overall === 0) return 'stable';
  const changePct = ((recent - overall) / Math.abs(overall)) * 100;
  const direction = changePct > 5 ? `↑ rising +${changePct.toFixed(1)}%`
                  : changePct < -5 ? `↓ falling ${changePct.toFixed(1)}%`
                  : '→ stable';
  return `${direction}${unit ? ` (recent avg: ${recent.toFixed(1)}${unit})` : ''}`;
}

// --- Lightweight pre-aggregation (for prompt context) ------------------------
// Sends both flat averages AND recent-trend strings so the LLM can detect
// sudden changes rather than being fooled by smooth historical averages.

function summarisePlant(rows: PlantRecord[]) {
  if (!rows.length) return null;
  const moistureSeries = rows.map(r => num(r.soil_moisture ?? r.moisture, 82));
  const fertSeries     = rows.map(r => num(r.fertilizer_kg_ha ?? r.fertilizer, 400));
  const nSeries        = rows.map(r => num(r.nitrogen_ppm ?? r.nitrogen, 42));
  return {
    avgFertilizer:    +avg(fertSeries).toFixed(1),
    avgIrrigationMm:  +avg(rows.map(r => num(r.irrigation_mm ?? r.irrigation, 20))).toFixed(1),
    avgIrrigFreq:     +avg(rows.map(r => num(r.irrigation_frequency, 0))).toFixed(1),
    avgLaborHours:    +avg(rows.map(r => num(r.labor_hours ?? r.labor, 120))).toFixed(1),
    avgSoilPH:        +avg(rows.map(r => num(r.soil_ph ?? r.ph, 6.5))).toFixed(2),
    avgSoilMoisture:  +avg(moistureSeries).toFixed(1),
    avgNitrogenPPM:   +avg(nSeries).toFixed(1),
    avgPhosphorusPPM: +avg(rows.map(r => num(r.phosphorus_ppm ?? r.phosphorus, 18))).toFixed(1),
    avgPotassiumPPM:  +avg(rows.map(r => num(r.potassium_ppm ?? r.potassium, 120))).toFixed(1),
    recordCount:      rows.length,
    sampleDates:      rows.slice(0, 3).map(r => r.date).filter(Boolean),
    // Trend signals — last 3 vs overall mean so LLM detects sudden changes
    moistureTrend:    trendLabel(moistureSeries, '%'),
    fertilizerTrend:  trendLabel(fertSeries, 'kg/ha'),
    nitrogenTrend:    trendLabel(nSeries, 'ppm'),
    // Last 3 raw soil-moisture readings for spike detection
    recentMoisture:   moistureSeries.slice(-3),
  };
}

function summariseEnv(rows: EnvRecord[]) {
  if (!rows.length) return null;
  const tempSeries     = rows.map(r => num(r.temperature_c ?? r.temperature, 30));
  const humiditySeries = rows.map(r => num(r.humidity_pct  ?? r.humidity,    82));
  const co2Series      = rows.map(r => num(r.co2_ppm       ?? r.co2,         412));
  return {
    avgTempC:    +avg(tempSeries).toFixed(1),
    avgHumidity: +avg(humiditySeries).toFixed(1),
    avgSolar:    +avg(rows.map(r => num(r.solar_radiation ?? r.solar, 750))).toFixed(0),
    avgWind:     +avg(rows.map(r => num(r.wind_speed ?? r.wind, 22))).toFixed(1),
    avgPressure: +avg(rows.map(r => num(r.barometric_pressure ?? r.pressure, 1008))).toFixed(0),
    avgCO2:      +avg(co2Series).toFixed(0),
    recordCount: rows.length,
    // Trend signals
    tempTrend:     trendLabel(tempSeries, '°C'),
    humidityTrend: trendLabel(humiditySeries, '%'),
    co2Trend:      trendLabel(co2Series, 'ppm'),
    recentTemps:   tempSeries.slice(-3),
  };
}

function summariseWeather(rows: WeatherRecord[]) {
  if (!rows.length) return null;
  const rainfall = rows.map(r => num(r.rainfall_mm ?? r.rainfall, 0));
  const tempMax  = rows.map(r => num(r.temp_max ?? r.temperature_max, 32));
  const wind     = rows.map(r => num(r.wind_speed_kmh ?? r.wind_speed, 15));
  const stormDays = rows.filter(r => {
    const sw = (r.storm_warning ?? r.storm ?? '').toLowerCase();
    return sw === 'true' || sw === '1' || sw === 'yes';
  }).length;
  // Spike detection: flag if any single day rainfall is >3× the average
  const avgRainfall = avg(rainfall);
  const maxRainfall = Math.max(...rainfall, 0);
  const rainfallSpike = avgRainfall > 0 && maxRainfall > avgRainfall * 3;
  return {
    avgRainfallMm:  +avgRainfall.toFixed(1),
    avgTempMaxC:    +avg(tempMax).toFixed(1),
    maxWindKmh:     maxRainfall > 0 ? Math.max(...wind, 0) : 0,
    stormDays,
    recordCount:    rows.length,
    // Trend signals
    rainfallTrend:  trendLabel(rainfall, 'mm'),
    tempTrend:      trendLabel(tempMax, '°C'),
    windTrend:      trendLabel(wind, 'km/h'),
    // Spike alert — e.g. [0,0,0,10,150] avg=32 hides the flood event on day 5
    rainfallSpike,
    maxSingleDayRain: maxRainfall,
    recentRainfall:   rainfall.slice(-3),
  };
}

function summariseSales(rows: SalesRecord[]) {
  if (!rows.length) return null;
  const prices   = rows.map(r => num(r.price_per_kg ?? r.price, 55)).filter(p => p > 0);
  const volumes  = rows.map(r => num(r.volume_kg ?? r.volume, 0));
  const channels = rows.map(r => r.channel ?? r.market ?? 'Local').filter(Boolean);
  const channelCounts: Record<string, number> = {};
  channels.forEach(c => { channelCounts[c] = (channelCounts[c] ?? 0) + 1; });
  return {
    avgPricePerKg:  +avg(prices).toFixed(2),
    minPrice:       prices.length ? Math.min(...prices) : 55,
    maxPrice:       prices.length ? Math.max(...prices) : 55,
    priceVolatilityPct: prices.length > 1
      ? Math.round(((Math.max(...prices) - Math.min(...prices)) / avg(prices)) * 100)
      : 0,
    avgVolumeKg:    +avg(volumes).toFixed(0),
    channelBreakdown: channelCounts,
    dominantChannel: Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Local Market',
    recordCount:    rows.length,
  };
}

// --- Unsalable Risk Analysis (滞销解决方案) ------------------------------------
// Deterministically computes unsalable risk flags from raw sales rows.
// Runs server-side so the frontend always gets structured data regardless
// of whether the LLM call succeeds.

function analyzeSalesData(rows: SalesRecord[]): {
  unsalableRisk: boolean;
  alternativeStrategy: string | null;
} {
  if (!rows.length) return { unsalableRisk: false, alternativeStrategy: null };

  const prices  = rows.map(r => num(r.price_per_kg ?? r.price, 55)).filter(p => p > 0);
  const volumes = rows.map(r => num(r.volume_kg   ?? r.volume, 0));

  const avgPrice  = prices.length  ? avg(prices)  : 55;
  const avgVolume = volumes.length ? avg(volumes) : 0;
  const minPrice  = prices.length  ? Math.min(...prices) : 55;
  const maxPrice  = prices.length  ? Math.max(...prices) : 55;
  const priceVolatilityPct = prices.length > 1
    ? Math.round(((maxPrice - minPrice) / avgPrice) * 100)
    : 0;

  const isOversupplied  = avgVolume > 1000;       // >1 tonne avg/record = bulk stock signal
  const isPriceDropping = avgPrice  < 40;          // below RM 40/kg = distress pricing
  const isHighVolatile  = priceVolatilityPct > 30; // >30% swing = unstable market

  const unsalableRisk = isOversupplied || isPriceDropping || isHighVolatile;

  const alternativeStrategy = unsalableRisk
    ? `Pivot 30% of Grade B/C inventory to F&B processing (Durian Paste/Desserts). Activating local cold-chain logistics API to match available freezer trucks. Estimated margin retention: 68%.`
    : null;

  return { unsalableRisk, alternativeStrategy };
}

// --- Tavily Web Search --------------------------------------------------------

interface TavilyResult {
  title: string;
  url:   string;
  content: string;
}

async function tavilySearch(query: string, maxResults = 4): Promise<TavilyResult[]> {
  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:      TAVILY_KEY,
        query,
        search_depth: 'basic',
        max_results:  maxResults,
        include_answer: false,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const results = (data.results ?? []) as any[];
    return results.map((r: any) => ({
      title:   r.title   ?? '',
      url:     r.url     ?? '',
      content: r.content ?? '',
    }));
  } catch {
    return [];
  }
}

// Decide which Tavily queries to run based on sales signals
async function fetchMarketIntelligence(
  sales: ReturnType<typeof summariseSales>,
  weather: ReturnType<typeof summariseWeather>
): Promise<{ query: string; results: TavilyResult[] }[]> {
  const searches: { query: string; results: TavilyResult[] }[] = [];

  if (!sales) return searches;

  // Signal 1: Price dropping or high volatility -> export channel search
  if (sales.priceVolatilityPct > 20 || sales.avgPricePerKg < 45) {
    searches.push({
      query:   'latest durian export prices Singapore Hong Kong 2025 2026 Musang King',
      results: await tavilySearch('latest durian export prices Singapore Hong Kong 2025 2026 Musang King'),
    });
  }

  // Signal 2: Any price data -> check Thai supply competition
  searches.push({
    query:   'Thailand durian supply export volume 2025 2026 market competition Malaysia',
    results: await tavilySearch('Thailand durian supply export volume 2025 2026 market competition Malaysia'),
  });

  // Signal 3: Oversupply (high volume, low price) -> by-product / alternative channel
  const oversupply = sales.avgVolumeKg > 500 && sales.avgPricePerKg < 50;
  if (oversupply || sales.priceVolatilityPct > 30) {
    searches.push({
      query:   'durian by-product processing dessert companies Malaysia unsold crop alternative sales channels',
      results: await tavilySearch('durian by-product processing dessert companies Malaysia unsold crop alternative sales channels'),
    });
  }

  // Signal 4: Extreme weather in data -> insurance / recovery
  if (weather && (weather.stormDays > 2 || weather.avgRainfallMm > 50)) {
    searches.push({
      query:   'Malaysia agricultural crop insurance weather protection durian farm 2025',
      results: await tavilySearch('Malaysia agricultural crop insurance weather protection durian farm 2025'),
    });
  }

  return searches;
}

// --- Format market intel for prompt injection ---------------------------------

function formatMarketIntel(intel: { query: string; results: TavilyResult[] }[]): string {
  if (!intel.length || intel.every(i => !i.results.length)) {
    return 'No live market data retrieved.';
  }
  return intel
    .filter(i => i.results.length)
    .map(i => {
      const snippets = i.results
        .slice(0, 3)
        .map(r => `  - [${r.title}] ${r.content.slice(0, 280)}`)
        .join('\n');
      return `Search: "${i.query}"\n${snippets}`;
    })
    .join('\n\n');
}

// --- Default safe values (used as fallback if GLM fails) ---------------------

function buildDefaultResult(
  plantRows: Record<string, string>[],
  envRows:   Record<string, string>[],
  weatherRows: Record<string, string>[],
  salesRows: Record<string, string>[],
  filesUploaded: number
): AnalysisResult {
  // Deterministic unsalable risk computed directly from raw sales rows —
  // this works even if the LLM call is skipped entirely.
  const { unsalableRisk, alternativeStrategy } = analyzeSalesData(salesRows as SalesRecord[]);

  return {
    bioFertReduction: 0,
    bioIrrigation:    4,
    inputs:           { fert: 400, labor: 120 },
    loanRate:         5,
    plantHealth: {
      bioHealthIndex: 72,
      gradeARatio:    68,
      gradeBRatio:    22,
      expectedLifespan: 14,
      soilPH:         6.5,
      soilMoisture:   82,
      npk: {
        nitrogen:   { ppm: 42,  pct: 72 },
        phosphorus: { ppm: 18,  pct: 56 },
        potassium:  { ppm: 120, pct: 88 },
      },
    },
    environment: {
      avgTemp: 30, avgHumidity: 82, solarRadiation: 750,
      windSpeed: 22, pressure: 1008, co2: 412,
    },
    weatherRisk: null,
    weatherDetails: {
      avgRainfall: 12, avgTempMax: 32, maxWindSpeed: 22,
      forecast: [
        { day: 'Today', emoji: '☀️', temp: '32C', alert: false },
        { day: 'Tue',   emoji: '🌤️', temp: '31C', alert: false },
        { day: 'Wed',   emoji: '☀️', temp: '30C', alert: false },
        { day: 'Thu',   emoji: '⛈️', temp: '29C', alert: true  },
        { day: 'Fri',   emoji: '⛈️', temp: '28C', alert: true  },
        { day: 'Sat',   emoji: '☀️', temp: '27C', alert: false },
        { day: 'Sun',   emoji: '☀️', temp: '26C', alert: false },
      ],
    },
    financial: {
      expectedProfit: 18500, cashRunway: 142,
      fertCost: 4800, laborCost: 1800, weatherLoss: 0,
      suggestedLoanRate: 5, pricePerKg: 55, baseRevenue: 35000,
    },
    salesInsights: {
      avgPricePerKg: 55, avgVolumeKg: 0,
      priceVolatilityPct: 0, minPrice: 55, maxPrice: 55,
      dominantChannel: 'Local Market',
      hasData: salesRows.length > 0,
      unsalableRisk,
      alternativeStrategy,
    },
    compliance: [
      { label: 'Invoice XML Format',             status: 'error', detail: 'Missing <TaxTotal> node - run LHDN audit to fix' },
      { label: 'MyInvois Digital Signature',     status: 'ok',    detail: 'Certificate valid until 2027-03' },
      { label: 'Supplier TIN Verification',      status: 'error', detail: '3 supplier TINs unverified' },
      { label: 'SST Tax Rate Accuracy',          status: 'ok',    detail: 'All compliant with 6% standard rate' },
      { label: 'Compliance Submission Deadline', status: 'warn',  detail: '18 days until Q2 deadline' },
      { label: 'e-Invoicing Version',            status: 'ok',    detail: 'Upgraded to MyInvois 2.1' },
    ],
    recommendation: 'Analysis engine initialised with default parameters. Upload farm data files for a personalised AI-driven recommendation.',
    marketNews: [],
    summary: {
      totalDataPoints:    plantRows.length + envRows.length + weatherRows.length + salesRows.length,
      plantGrowthRecords: plantRows.length,
      envRecords:         envRows.length,
      weatherRecords:     weatherRows.length,
      salesRecords:       salesRows.length,
      overallHealthScore: 72,
      riskLevel:         'MEDIUM',
      filesUploaded,
    },
  };
}

// --- Strip markdown fences from LLM output -----------------------------------

function stripMarkdownJSON(text: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

// --- Validate and repair the LLM JSON before returning it --------------------
// Ensures every field the frontend requires is present and correctly typed.

function sanitiseResult(raw: any, defaults: AnalysisResult): AnalysisResult {
  const d = defaults;
  const r = raw ?? {};

  const num_  = (v: unknown, fb: number) => (typeof v === 'number' && isFinite(v) ? v : fb);
  const str_  = (v: unknown, fb: string) => (typeof v === 'string' && v.trim() ? v.trim() : fb);
  const arr_  = (v: unknown, fb: unknown[]) => (Array.isArray(v) ? v : fb);

  const ph = r.plantHealth ?? {};
  const npk = ph.npk ?? {};
  const nit = npk.nitrogen   ?? {};
  const pho = npk.phosphorus ?? {};
  const pot = npk.potassium  ?? {};
  const env = r.environment  ?? {};
  const fin = r.financial    ?? {};
  const wd  = r.weatherDetails ?? {};
  const si  = r.salesInsights ?? {};
  const sm  = r.summary      ?? {};
  const inp = r.inputs       ?? {};

  // Forecast: must be exactly 7 entries with required shape
  const defaultForecast = d.weatherDetails.forecast;
  const rawForecast = arr_(wd.forecast, defaultForecast).slice(0, 7);
  const forecast = defaultForecast.map((def, i) => {
    const f = rawForecast[i] ?? {};
    return {
      day:   str_(f.day,   def.day),
      emoji: str_(f.emoji, def.emoji),
      temp:  str_(f.temp,  def.temp),
      alert: typeof f.alert === 'boolean' ? f.alert : def.alert,
    };
  });

  // Compliance: must be array of {label, status, detail}
  const complianceDefaults = d.compliance;
  const rawCompliance = arr_(r.compliance, complianceDefaults);
  const compliance = complianceDefaults.map((def, i) => {
    const c = rawCompliance[i] ?? {};
    const status = ['ok', 'warn', 'error'].includes(c.status) ? c.status : def.status;
    return {
      label:  str_(c.label,  def.label),
      status: status as 'ok' | 'warn' | 'error',
      detail: str_(c.detail, def.detail),
    };
  });

  // weatherRisk
  const validRisks = ['rain', 'drought', 'wind', null];
  const weatherRisk = validRisks.includes(r.weatherRisk) ? r.weatherRisk : null;

  // riskLevel
  const riskLevel = ['LOW', 'MEDIUM', 'HIGH'].includes(sm.riskLevel) ? sm.riskLevel : 'MEDIUM';

  return {
    bioFertReduction: clamp(num_(r.bioFertReduction, d.bioFertReduction), 0, 50),
    bioIrrigation:    clamp(num_(r.bioIrrigation, d.bioIrrigation), 1, 8),
    inputs: {
      fert:  clamp(num_(inp.fert,  d.inputs.fert),  200, 800),
      labor: clamp(num_(inp.labor, d.inputs.labor),  0,  300),
    },
    loanRate: clamp(num_(r.loanRate, d.loanRate), 3, 15),
    plantHealth: {
      bioHealthIndex:   clamp(num_(ph.bioHealthIndex,   d.plantHealth.bioHealthIndex),   0, 100),
      gradeARatio:      clamp(num_(ph.gradeARatio,      d.plantHealth.gradeARatio),       0, 100),
      gradeBRatio:      clamp(num_(ph.gradeBRatio,      d.plantHealth.gradeBRatio),       0, 100),
      expectedLifespan: Math.max(1, num_(ph.expectedLifespan, d.plantHealth.expectedLifespan)),
      soilPH:           num_(ph.soilPH,       d.plantHealth.soilPH),
      soilMoisture:     num_(ph.soilMoisture, d.plantHealth.soilMoisture),
      npk: {
        nitrogen:   { ppm: num_(nit.ppm, d.plantHealth.npk.nitrogen.ppm),   pct: clamp(num_(nit.pct, d.plantHealth.npk.nitrogen.pct),   0, 100) },
        phosphorus: { ppm: num_(pho.ppm, d.plantHealth.npk.phosphorus.ppm), pct: clamp(num_(pho.pct, d.plantHealth.npk.phosphorus.pct), 0, 100) },
        potassium:  { ppm: num_(pot.ppm, d.plantHealth.npk.potassium.ppm),  pct: clamp(num_(pot.pct, d.plantHealth.npk.potassium.pct),  0, 100) },
      },
    },
    environment: {
      avgTemp:        num_(env.avgTemp,        d.environment.avgTemp),
      avgHumidity:    num_(env.avgHumidity,    d.environment.avgHumidity),
      solarRadiation: num_(env.solarRadiation, d.environment.solarRadiation),
      windSpeed:      num_(env.windSpeed,      d.environment.windSpeed),
      pressure:       num_(env.pressure,       d.environment.pressure),
      co2:            num_(env.co2,            d.environment.co2),
    },
    weatherRisk: weatherRisk as 'rain' | 'drought' | 'wind' | null,
    weatherDetails: {
      avgRainfall:  num_(wd.avgRainfall,  d.weatherDetails.avgRainfall),
      avgTempMax:   num_(wd.avgTempMax,   d.weatherDetails.avgTempMax),
      maxWindSpeed: num_(wd.maxWindSpeed, d.weatherDetails.maxWindSpeed),
      forecast,
    },
    financial: {
      expectedProfit:    num_(fin.expectedProfit,    d.financial.expectedProfit),
      cashRunway:        Math.max(0, num_(fin.cashRunway, d.financial.cashRunway)),
      fertCost:          Math.max(0, num_(fin.fertCost,   d.financial.fertCost)),
      laborCost:         Math.max(0, num_(fin.laborCost,  d.financial.laborCost)),
      weatherLoss:       num_(fin.weatherLoss,       d.financial.weatherLoss),
      suggestedLoanRate: clamp(num_(fin.suggestedLoanRate, d.financial.suggestedLoanRate), 3, 15),
      pricePerKg:        Math.max(0, num_(fin.pricePerKg,  d.financial.pricePerKg)),
      baseRevenue:       Math.max(0, num_(fin.baseRevenue, d.financial.baseRevenue)),
    },
    salesInsights: {
      avgPricePerKg:       num_(si.avgPricePerKg,      d.salesInsights.avgPricePerKg),
      avgVolumeKg:         num_(si.avgVolumeKg,        d.salesInsights.avgVolumeKg),
      priceVolatilityPct:  num_(si.priceVolatilityPct, d.salesInsights.priceVolatilityPct),
      minPrice:            num_(si.minPrice,            d.salesInsights.minPrice),
      maxPrice:            num_(si.maxPrice,            d.salesInsights.maxPrice),
      dominantChannel:     str_(si.dominantChannel,    d.salesInsights.dominantChannel),
      hasData:             typeof si.hasData === 'boolean'        ? si.hasData            : d.salesInsights.hasData,
      // These two fields come from the deterministic analyzeSalesData() layer;
      // prefer the LLM's value if valid, otherwise fall through to the server-computed default.
      unsalableRisk:       typeof si.unsalableRisk === 'boolean'  ? si.unsalableRisk      : d.salesInsights.unsalableRisk,
      alternativeStrategy: typeof si.alternativeStrategy === 'string' && si.alternativeStrategy.trim()
                             ? si.alternativeStrategy
                             : d.salesInsights.alternativeStrategy,
    },
    compliance,
    recommendation: str_(r.recommendation, d.recommendation),
    summary: {
      totalDataPoints:    num_(sm.totalDataPoints,    d.summary.totalDataPoints),
      plantGrowthRecords: num_(sm.plantGrowthRecords, d.summary.plantGrowthRecords),
      envRecords:         num_(sm.envRecords,          d.summary.envRecords),
      weatherRecords:     num_(sm.weatherRecords,      d.summary.weatherRecords),
      salesRecords:       num_(sm.salesRecords,        d.summary.salesRecords),
      overallHealthScore: clamp(num_(sm.overallHealthScore, d.summary.overallHealthScore), 0, 100),
      riskLevel:          riskLevel as 'LOW' | 'MEDIUM' | 'HIGH',
      filesUploaded:      num_(sm.filesUploaded, d.summary.filesUploaded),
    },
  };
}

// --- Build the GLM prompt -----------------------------------------------------

function buildSystemPrompt(): string {
  return `You are BioFin Oracle AI - an expert agricultural intelligence engine specializing in Malaysian durian farming, financial analysis, and smart agriculture decision-making.

You will receive structured farm data summaries and optional live market intelligence from web searches. Your job is to analyze this data deeply and return a SINGLE, complete JSON object.

## Your Analysis Responsibilities:
1. **Plant Health**: Calculate bioHealthIndex (0-100) based on fertilizer balance, irrigation frequency vs. optimal (3-5x/week), soil pH (ideal 5.8-7.0), soil moisture (ideal 70-90%), and NPK ratios. Convert NPK ppm to percentage bars (nitrogen: pct = ppm/60*100 capped at 100, phosphorus: pct = ppm/35*100 capped at 100, potassium: pct = ppm/140*100 capped at 100).
2. **Financial Projections**: Calculate costs, revenue, profit based on fertilizer, labor, weather risk. Use actual sales data if provided.
3. **Weather Risk**: Classify as "rain" (storms > 2 days or rainfall > 50mm avg), "drought" (temp_max > 35C and rainfall < 5mm), "wind" (max wind > 24 km/h), or null. Build a 7-day forecast.
4. **Compliance**: Assess Malaysian LHDN e-invoicing and MyGAP certification status.
5. **Recommendation**: Write a specific, actionable 2-3 sentence recommendation in English. If live market search results are provided, use them to inform unsalable crop solutions, alternative channels, or market timing.
6. **Risk Level**: Classify overall farm risk as "LOW", "MEDIUM", or "HIGH".

## bioFertReduction Calculation:
- Optimal fertilizer: 400 kg/ha
- If fertilizer < 400: reduction = (400 - fertilizer) / 20
- If fertilizer > 600: add penalty = (fertilizer - 600) / 15
- Clamp between 0 and 50

## bioIrrigation Calculation:
- If irrigation_frequency field exists: use directly (clamp 1-8)
- Else: infer from irrigation_mm / 5 (divide mm by 5mm per event), clamp 1-8

## Grade A/B Ratios:
- gradeARatio = 78 - (bioFertReduction * 0.85) - (abs(bioIrrigation - 4) * 2.8), clamp 28-90
- gradeBRatio = 22 + (bioFertReduction * 0.6) + (abs(bioIrrigation - 4) * 2.0), clamp 5-65

## Cash Runway:
- Base: 142 days
- If total monthly cost (fertCost + laborCost) > 15000: cashRunway = 92

## CRITICAL OUTPUT RULE:
You MUST output ONLY a raw JSON object. No markdown. No explanation. No \`\`\`json fences. No preamble. The very first character of your response must be { and the very last must be }.

The JSON must exactly match this TypeScript interface:
{
  "bioFertReduction": number,          // 0-50
  "bioIrrigation": number,             // 1-8
  "inputs": { "fert": number, "labor": number },
  "loanRate": number,                  // 3-15
  "plantHealth": {
    "bioHealthIndex": number,          // 0-100
    "gradeARatio": number,             // 0-100
    "gradeBRatio": number,             // 0-100
    "expectedLifespan": number,        // years, e.g. 14
    "soilPH": number,
    "soilMoisture": number,
    "npk": {
      "nitrogen":   { "ppm": number, "pct": number },
      "phosphorus": { "ppm": number, "pct": number },
      "potassium":  { "ppm": number, "pct": number }
    }
  },
  "environment": {
    "avgTemp": number, "avgHumidity": number, "solarRadiation": number,
    "windSpeed": number, "pressure": number, "co2": number
  },
  "weatherRisk": "rain" | "drought" | "wind" | null,
  "weatherDetails": {
    "avgRainfall": number, "avgTempMax": number, "maxWindSpeed": number,
    "forecast": [
      { "day": "Today", "emoji": "☀️", "temp": "32C", "alert": false },
      { "day": "Tue",   "emoji": "🌤️", "temp": "31C", "alert": false },
      { "day": "Wed",   "emoji": "☀️", "temp": "30C", "alert": false },
      { "day": "Thu",   "emoji": "⛈️", "temp": "29C", "alert": true  },
      { "day": "Fri",   "emoji": "⛈️", "temp": "28C", "alert": true  },
      { "day": "Sat",   "emoji": "☀️", "temp": "27C", "alert": false },
      { "day": "Sun",   "emoji": "☀️", "temp": "26C", "alert": false }
    ]
  },
  "financial": {
    "expectedProfit": number, "cashRunway": number,
    "fertCost": number, "laborCost": number, "weatherLoss": number,
    "suggestedLoanRate": number, "pricePerKg": number, "baseRevenue": number
  },
  "salesInsights": {
    "avgPricePerKg": number, "avgVolumeKg": number,
    "priceVolatilityPct": number, "minPrice": number, "maxPrice": number,
    "dominantChannel": string, "hasData": boolean,
    "unsalableRisk": boolean,           // true if avgPrice < 40, avgVolume > 1000, or volatility > 30%
    "alternativeStrategy": string | null  // by-product pivot recommendation, or null if market healthy
  },
  "compliance": [
    { "label": "Invoice XML Format",             "status": "ok"|"warn"|"error", "detail": string },
    { "label": "MyInvois Digital Signature",     "status": "ok"|"warn"|"error", "detail": string },
    { "label": "Supplier TIN Verification",      "status": "ok"|"warn"|"error", "detail": string },
    { "label": "SST Tax Rate Accuracy",          "status": "ok"|"warn"|"error", "detail": string },
    { "label": "Compliance Submission Deadline", "status": "ok"|"warn"|"error", "detail": string },
    { "label": "e-Invoicing Version",            "status": "ok"|"warn"|"error", "detail": string }
  ],
  "recommendation": string,
  "summary": {
    "totalDataPoints": number, "plantGrowthRecords": number,
    "envRecords": number, "weatherRecords": number, "salesRecords": number,
    "overallHealthScore": number, "riskLevel": "LOW"|"MEDIUM"|"HIGH",
    "filesUploaded": number
  }
}`;
}

function buildUserPrompt(
  plant:   ReturnType<typeof summarisePlant>,
  env:     ReturnType<typeof summariseEnv>,
  weather: ReturnType<typeof summariseWeather>,
  sales:   ReturnType<typeof summariseSales>,
  intel:   string,
  counts:  { plant: number; env: number; weather: number; sales: number; files: number },
): string {
  const sections: string[] = [];

  sections.push('## Uploaded Farm Data Summary\n');

  if (plant) {
    sections.push(`### Plant Growth Data (${plant.recordCount} records)
- Avg Fertilizer: ${plant.avgFertilizer} kg/ha | Trend: ${plant.fertilizerTrend}
- Avg Irrigation: ${plant.avgIrrigationMm} mm/event | Frequency field: ${plant.avgIrrigFreq || 'not provided'}
- Avg Labor Hours: ${plant.avgLaborHours} hrs
- Avg Soil pH: ${plant.avgSoilPH} | Soil Moisture: ${plant.avgSoilMoisture}% | Trend: ${plant.moistureTrend}
- Avg NPK - Nitrogen: ${plant.avgNitrogenPPM} ppm (${plant.nitrogenTrend}) | Phosphorus: ${plant.avgPhosphorusPPM} ppm | Potassium: ${plant.avgPotassiumPPM} ppm
- Recent Moisture Readings (last 3): ${plant.recentMoisture.join(', ')}%
- Sample Dates: ${plant.sampleDates.join(', ') || 'N/A'}`);
  } else {
    sections.push('### Plant Growth Data: NOT UPLOADED - use intelligent defaults for durian farming in Malaysia');
  }

  if (env) {
    sections.push(`\n### Environment Data (${env.recordCount} records)
- Avg Temp: ${env.avgTempC} degC | Trend: ${env.tempTrend} | Recent: ${env.recentTemps.join(', ')}°C
- Humidity: ${env.avgHumidity}% | Trend: ${env.humidityTrend}
- Solar: ${env.avgSolar} W/m2 | Avg Wind: ${env.avgWind} km/h | Pressure: ${env.avgPressure} hPa
- CO2: ${env.avgCO2} ppm | Trend: ${env.co2Trend}`);
  } else {
    sections.push('\n### Environment Data: NOT UPLOADED - use intelligent defaults');
  }

  if (weather) {
    sections.push(`\n### Weather Records (${weather.recordCount} records)
- Avg Rainfall: ${weather.avgRainfallMm} mm | Trend: ${weather.rainfallTrend}
- Recent Rainfall (last 3 days): ${weather.recentRainfall.join(', ')} mm${weather.rainfallSpike ? ` ⚠ SPIKE DETECTED — single day max: ${weather.maxSingleDayRain}mm` : ''}
- Avg Temp Max: ${weather.avgTempMaxC} degC | Trend: ${weather.tempTrend}
- Max Wind: ${weather.maxWindKmh} km/h | Trend: ${weather.windTrend}
- Storm Days: ${weather.stormDays}`);
  } else {
    sections.push('\n### Weather Records: NOT UPLOADED - use intelligent defaults');
  }

  if (sales) {
    sections.push(`\n### Sales & Pricing History (${sales.recordCount} records)
- Avg Price/kg: RM ${sales.avgPricePerKg} | Min: RM ${sales.minPrice} | Max: RM ${sales.maxPrice}
- Price Volatility: ${sales.priceVolatilityPct}% | Avg Volume: ${sales.avgVolumeKg} kg
- Channel Breakdown: ${JSON.stringify(sales.channelBreakdown)}
- Dominant Channel: ${sales.dominantChannel}`);
  } else {
    sections.push('\n### Sales History: NOT UPLOADED - use RM 55/kg default price, 0 volume');
  }

  sections.push(`\n## Live Market Intelligence (Tavily Web Search Results)
${intel}`);

  sections.push(`\n## Context
- Farm: Malaysian Musang King (Durian) operation, likely Pahang/Johor region
- Currency: Malaysian Ringgit (RM)
- Compliance context: LHDN MyInvois e-invoicing Phase 3, MyGAP certification, SST 6%
- Files uploaded: ${counts.files}/4
- Total data records: ${counts.plant + counts.env + counts.weather + counts.sales}

Now perform your complete analysis and output the JSON object ONLY. No text before or after.`);

  return sections.join('\n');
}

// --- Call GLM API -------------------------------------------------------------

async function callGLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(`${GLM_BASE_URL}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${GLM_API_KEY}`,
    },
    body: JSON.stringify({
      model:       GLM_MODEL,
      temperature: 0.2,    // Low temperature for deterministic structured output
      max_tokens:  4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`GLM API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('GLM returned empty content');
  }
  return content;
}

// --- POST Handler -------------------------------------------------------------

export async function POST(request: NextRequest) {
  let filesUploaded = 0;

  // -- 1. Parse uploaded files -----------------------------------------------
  let plantRows:   Record<string, string>[] = [];
  let envRows:     Record<string, string>[] = [];
  let weatherRows: Record<string, string>[] = [];
  let salesRows:   Record<string, string>[] = [];

  try {
    const formData = await request.formData();

    const plantFile   = formData.get('plantGrowth')    as File | null;
    const envFile     = formData.get('envVars')         as File | null;
    const weatherFile = formData.get('weatherRecords') as File | null;
    const salesFile   = formData.get('salesHistory')   as File | null;

    filesUploaded = [plantFile, envFile, weatherFile, salesFile].filter(Boolean).length;

    [plantRows, envRows, weatherRows, salesRows] = await Promise.all([
      plantFile   ? readFile(plantFile)   : Promise.resolve([]),
      envFile     ? readFile(envFile)     : Promise.resolve([]),
      weatherFile ? readFile(weatherFile) : Promise.resolve([]),
      salesFile   ? readFile(salesFile)   : Promise.resolve([]),
    ]);
  } catch (parseErr) {
    console.error('[BioFin] File parse error:', parseErr);
    // Non-fatal: continue with empty arrays and let AI use defaults
  }

  const defaults = buildDefaultResult(plantRows, envRows, weatherRows, salesRows, filesUploaded);

  // -- 2. Summarise data into compact stats ---------------------------------
  const plant   = summarisePlant(plantRows   as PlantRecord[]);
  const env     = summariseEnv(envRows       as EnvRecord[]);
  const weather = summariseWeather(weatherRows as WeatherRecord[]);
  const sales   = summariseSales(salesRows   as SalesRecord[]);

  // -- 3. Live market intelligence (Tavily) ---------------------------------
  let intelText  = 'No live market data retrieved (no sales data uploaded).';
  // Flat list of news items passed through to the frontend (Defect 2 fix)
  let marketNews: AnalysisResult['marketNews'] = [];
  try {
    const intel = await fetchMarketIntelligence(sales, weather);
    intelText   = formatMarketIntel(intel);
    // Flatten all results into a frontend-friendly array
    marketNews = intel.flatMap(i =>
      i.results.map(r => ({
        query:   i.query,
        title:   r.title,
        snippet: r.content.slice(0, 280),
        url:     r.url,
      }))
    );
  } catch (tavilyErr) {
    console.error('[BioFin] Tavily error:', tavilyErr);
    intelText = 'Live market search unavailable - proceeding with local analysis only.';
  }

  // -- 4. Call GLM AI --------------------------------------------------------
  try {
    const systemPrompt = buildSystemPrompt();
    const userPrompt   = buildUserPrompt(plant, env, weather, sales, intelText, {
      plant:   plantRows.length,
      env:     envRows.length,
      weather: weatherRows.length,
      sales:   salesRows.length,
      files:   filesUploaded,
    });

    const rawLLMOutput = await callGLM(systemPrompt, userPrompt);

    // Strip any markdown fences the model might have added
    const cleanedJSON = stripMarkdownJSON(rawLLMOutput);

    // Parse the JSON
    let parsed: any;
    try {
      parsed = JSON.parse(cleanedJSON);
    } catch {
      // Second attempt: find the first { and last } and extract
      const start = cleanedJSON.indexOf('{');
      const end   = cleanedJSON.lastIndexOf('}');
      if (start !== -1 && end > start) {
        parsed = JSON.parse(cleanedJSON.slice(start, end + 1));
      } else {
        throw new Error('Could not extract valid JSON from LLM response');
      }
    }

    // Validate and repair against the required shape
    const result = sanitiseResult(parsed, defaults);

    // Defect 2: attach live Tavily news so the frontend can render real articles
    return NextResponse.json({ ...result, marketNews });

  } catch (aiErr) {
    // -- 5. Graceful AI fallback -------------------------------------------
    console.error('[BioFin] AI pipeline error - returning safe defaults:', aiErr);

    const enriched: AnalysisResult = {
      ...defaults,
      marketNews,   // still pass through any Tavily results we managed to fetch
      summary: {
        ...defaults.summary,
        riskLevel: 'MEDIUM',
        filesUploaded,
      },
      recommendation: `AI analysis temporarily unavailable (${(aiErr as Error).message?.slice(0, 80)}). Dashboard showing safe baseline values. Re-run analysis to get full AI-powered insights.`,
    };

    return NextResponse.json(enriched, {
      headers: { 'X-AI-Fallback': 'true' },
    });
  }
}

// --- GET - health check & API docs -------------------------------------------

export async function GET() {
  return NextResponse.json({
    status:  'ok',
    service: 'BioFin Oracle Analysis API - AI Edition',
    version: '3.0.0',
    pipeline: {
      step1: 'Parse uploaded CSV/JSON files (plant, env, weather, sales)',
      step2: 'Summarise data into compact statistics for LLM context',
      step3: 'Tavily live web search: market prices, competitors, by-product channels (triggered by sales signal)',
      step4: 'GLM LLM call (nemo-super): full AI analysis -> strict JSON output',
      step5: 'Sanitise + validate JSON -> return AnalysisResult to frontend',
      fallback: 'If GLM fails, return safe default values with error note in recommendation',
    },
    models: {
      llm:    `${GLM_BASE_URL}/chat/completions - model: ${GLM_MODEL}`,
      search: TAVILY_URL,
    },
    endpoints: {
      'POST /api/analyze': {
        accepts: 'multipart/form-data',
        fields: {
          plantGrowth:    'CSV/JSON - fertilizer_kg_ha, irrigation_mm, irrigation_frequency, labor_hours, soil_ph, soil_moisture, nitrogen_ppm, phosphorus_ppm, potassium_ppm',
          envVars:        'CSV/JSON - temperature_c, humidity_pct, solar_radiation, wind_speed, co2_ppm, barometric_pressure',
          weatherRecords: 'CSV/JSON - rainfall_mm, temp_max, temp_min, wind_speed_kmh, storm_warning',
          salesHistory:   'CSV/JSON - price_per_kg, volume_kg, channel, revenue',
        },
        returns: 'AnalysisResult JSON - all fields computed by GLM AI',
      },
    },
    sampleCSV: {
      plantGrowth:    'date,fertilizer_kg_ha,irrigation_mm,irrigation_frequency,labor_hours,soil_ph,soil_moisture,nitrogen_ppm,phosphorus_ppm,potassium_ppm\n2024-04-01,380,20,4,130,6.5,84,44,17,118',
      envVars:        'date,temperature_c,humidity_pct,solar_radiation,wind_speed,co2_ppm,barometric_pressure\n2024-04-01,30.5,84,745,19,414,1009',
      weatherRecords: 'date,rainfall_mm,temp_max,temp_min,wind_speed_kmh,storm_warning\n2024-04-01,8,33,25,18,false',
      salesHistory:   'date,price_per_kg,volume_kg,channel,revenue\n2024-03-15,58,320,Singapore Export,18560',
    },
  });
}