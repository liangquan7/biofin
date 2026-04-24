import { NextRequest, NextResponse } from 'next/server';

// ─── Vercel serverless function duration limit ────────────────────────────────
// Pro plan: up to 300 s. Streaming keeps the TCP connection alive for the
// full duration — heartbeat comments prevent idle-connection teardowns.
export const maxDuration = 300;

// --- API Config ---------------------------------------------------------------
// Keys are loaded from environment variables — never hardcode secrets in source.
// Create a .env.local file (gitignored) with the variables below.
// See .env.local.example in the project root for the required variable names.

const ZAI_API_KEY  = process.env.ZAI_API_KEY  ?? '';
const ZAI_MODEL    = process.env.ZAI_MODEL    ?? 'ilmu-glm-5.1';
const ZAI_BASE_URL = process.env.ZAI_BASE_URL ?? 'https://api.ilmu.ai/v1/chat/completions';

const TAVILY_URL = 'https://api.tavily.com/search';
const TAVILY_KEY = process.env.TAVILY_API_KEY ?? '';

// ─── Shared Type Contracts ────────────────────────────────────────────────────
// Imported from the single source of truth so backend and frontend can never
// silently drift apart. Re-exported so consumers can import from route.ts.
export type { SSEStageEvent, SSEErrorEvent, AnalysisResult, DynamicIntelligence, CompetitorIntel, StressTestScenario } from '@/types/biofin';
import type { SSEStageEvent, SSEErrorEvent, AnalysisResult, DynamicIntelligence, CompetitorIntel, StressTestScenario } from '@/types/biofin';

// ─── Rate-Limiting (Security Bug #7) ─────────────────────────────────────────
// Placeholder — wire up @upstash/ratelimit for production.
// Install:  npm i @upstash/ratelimit @upstash/redis
// Then replace the body below with:
//   import { Ratelimit } from '@upstash/ratelimit';
//   import { Redis } from '@upstash/redis';
//   const ratelimit = new Ratelimit({
//     redis: Redis.fromEnv(),
//     limiter: Ratelimit.slidingWindow(10, '60 s'),
//   });
//   const { success } = await ratelimit.limit(identifier);
//   return { allowed: success };
async function checkRateLimit(_identifier: string): Promise<{ allowed: boolean }> {
  return { allowed: true };
}

// ─── File Size Cap (Security Bug #6) ─────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// --- Record Types -------------------------------------------------------------

/** Category 1 — Environmental & Geospatial Data (Base Environment) */
interface EnvGeoRecord {
  date?: string;
  // GPS / polygon boundaries
  latitude?: string;             gps_lat?: string;
  longitude?: string;            gps_lng?: string;
  polygon_boundary?: string;
  // Soil test report
  soil_ph?: string;              ph?: string;
  soil_npk_nitrogen?: string;    nitrogen_ppm?: string;   nitrogen?: string;
  soil_npk_phosphorus?: string;  phosphorus_ppm?: string; phosphorus?: string;
  soil_npk_potassium?: string;   potassium_ppm?: string;  potassium?: string;
  organic_matter_pct?: string;   organic_matter?: string;
  soil_type?: string;            // e.g. "peat", "red soil", "alluvial"
  // Water source status (aquaculture)
  water_type?: string;           // e.g. "river", "borehole", "rain-fed"
  water_temp_c?: string;         water_temperature?: string;
  dissolved_oxygen?: string;
  ammonia_nitrogen?: string;
  // Generic catch-all
  [key: string]: string | undefined;
}

/** Category 2 — Biological & Crop Data (Growth Cycle & Features) */
interface BioCropRecord {
  date?: string;
  // Variety / strain identity
  crop_variety?: string;         variety?: string;   strain?: string;
  // Farming milestones
  sowing_date?: string;          planting_date?: string;
  expected_harvest_date?: string; harvest_date?: string;
  // Field image metadata (populated by mock OCR/CV layer below)
  image_filename?: string;
  image_label?: string;          // e.g. "leaf_yellowing", "fruit_grade_a"
  image_confidence?: string;     // CV confidence score 0-100
  [key: string]: string | undefined;
}

/** Category 3 — Farming Operations Data (Management Records) */
interface OperationsRecord {
  date?: string;
  // Input usage logs
  input_type?: string;           type?: string;
  input_amount?: string;         amount?: string;
  input_unit?: string;           unit?: string;           // kg, L, etc.
  // Irrigation records
  irrigation_time?: string;
  irrigation_volume_l?: string;  irrigation_volume?: string;
  // Special events
  event_type?: string;           event?: string;
  event_description?: string;    description?: string;
  [key: string]: string | undefined;
}

/** Category 4 — Financial & Commercial Data (Yield & Business) */
interface FinancialRecord {
  date?: string;
  // Historical yield data
  harvest_weight_kg?: string;    yield_kg?: string;
  grade_a_pct?: string;          grade_a?: string;
  grade_b_pct?: string;          grade_b?: string;
  // Cost & expense breakdown
  seed_cost?: string;
  fertilizer_cost?: string;      fert_cost?: string;
  labor_cost?: string;
  equipment_cost?: string;       maintenance_cost?: string;
  // Market sales prices
  market_price_per_kg?: string;  price_per_kg?: string;   price?: string;
  channel?: string;              market?: string;
  volume_kg?: string;            volume?: string;
  revenue?: string;
  [key: string]: string | undefined;
}

// --- CSV / JSON Parsers -------------------------------------------------------

// Bug #4 fix: state-machine parser that correctly handles quoted fields
// containing embedded commas (e.g. "Heavy rain, 3 days") and escaped
// double-quotes (RFC 4180 §2.7 — "" inside a quoted field = literal ").
function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'; // escaped quote
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map(h => h.replace(/^["']|["']$/g, ''));
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const vals = splitCSVLine(line);
      return Object.fromEntries(
        headers.map((h, i) => [h, (vals[i] ?? '').replace(/^["']|["']$/g, '')])
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

/**
 * Extended file reader that handles images for Categories 1 & 2.
 * When an image is uploaded, a mock OCR/CV payload is returned.
 *
 * TODO: Replace the mock block below with a real OCR/CV pipeline, e.g.:
 *   - OCR (soil reports): Tesseract.js, AWS Textract, or Google Vision Document AI
 *   - Computer Vision (leaf/fruit photos): a custom PyTorch model endpoint,
 *     Azure Custom Vision, or Google AutoML Vision
 */
async function readFileOrImage(file: File): Promise<Record<string, string>[]> {
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
  const isImage = imageExts.some(ext => file.name.toLowerCase().endsWith(ext));

  if (isImage) {
    // ── MOCK OCR / CV EXTRACTION ──────────────────────────────────────────────
    // Real implementation: send `file` to OCR/CV service, parse structured fields.
    // For now, log the event and return a minimal placeholder record so the LLM
    // is aware an image was submitted but no text data could be extracted yet.
    console.log(`[BioFin] Image file detected: "${file.name}" — OCR/CV pipeline not yet active. Returning mock payload.`);
    return [{
      _source:     'image_ocr_cv_mock',
      _filename:   file.name,
      image_label: 'awaiting_cv_integration',
      image_confidence: '0',
      _note: `Image uploaded (${(file.size / 1024).toFixed(1)} KB). OCR/CV integration pending — see readFileOrImage() in route.ts.`,
    }];
    // ── END MOCK ──────────────────────────────────────────────────────────────
  }

  return readFile(file);
}

// --- Numeric helpers (used for pre-processing & fallback) --------------------

const num   = (v: string | undefined, fb = 0) => { const n = parseFloat(v ?? ''); return isFinite(n) ? n : fb; };
const avg   = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Computes a human-readable trend description for the LLM.
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

function summariseEnvGeo(rows: EnvGeoRecord[]) {
  if (!rows.length) return null;
  const gpsRow = rows.find(r => (r.latitude || r.gps_lat) && (r.longitude || r.gps_lng));
  const lat = gpsRow ? num(gpsRow.latitude ?? gpsRow.gps_lat, 3.15) : null; // 默认吉隆坡纬度
  const lng = gpsRow ? num(gpsRow.longitude ?? gpsRow.gps_lng, 101.7) : null; // 默认吉隆坡经度
  const phSeries = rows.map(r => num(r.soil_ph ?? r.ph, 6.5));
  const nSeries  = rows.map(r => num(r.soil_npk_nitrogen ?? r.nitrogen_ppm ?? r.nitrogen, 42));
  const pSeries  = rows.map(r => num(r.soil_npk_phosphorus ?? r.phosphorus_ppm ?? r.phosphorus, 18));
  const kSeries  = rows.map(r => num(r.soil_npk_potassium ?? r.potassium_ppm ?? r.potassium, 120));
  const doSeries = rows.map(r => num(r.dissolved_oxygen, 0)).filter(v => v > 0);
  const omSeries = rows.map(r => num(r.organic_matter_pct ?? r.organic_matter, 0)).filter(v => v > 0);

  return {
    latitude: lat,
    longitude: lng,
    gpsProvided: !!gpsRow,
    avgSoilPH:         +avg(phSeries).toFixed(2),
    latestSoilPH:      phSeries[phSeries.length - 1] ?? 6.5,
    phTrend:           trendLabel(phSeries, ''),
    avgNitrogenPPM:    +avg(nSeries).toFixed(1),
    avgPhosphorusPPM:  +avg(pSeries).toFixed(1),
    avgPotassiumPPM:   +avg(kSeries).toFixed(1),
    avgOrganicMatterPct: omSeries.length ? +avg(omSeries).toFixed(1) : null,
    soilType:          rows.find(r => r.soil_type)?.soil_type ?? 'Not specified',
    waterType:         rows.find(r => r.water_type)?.water_type ?? 'Not specified',
    avgDissolvedOxygen: doSeries.length ? +avg(doSeries).toFixed(1) : null,
    avgAmmoniaNitrogen: +avg(rows.map(r => num(r.ammonia_nitrogen, 0))).toFixed(2),
    recordCount:       rows.length,
    sampleDates:       rows.slice(0, 3).map(r => r.date).filter(Boolean),
    // Trend signals — last 3 vs overall mean
    nitrogenTrend:     trendLabel(nSeries, 'ppm'),
    recentPhReadings:  phSeries.slice(-3),
  };
}

function summariseBioCrop(rows: BioCropRecord[]) {
  if (!rows.length) return null;
  // Resolve variety — check multiple alias keys
  const varietyRow = rows.find(r => r.crop_variety ?? r.variety ?? r.strain);
  const cropVariety = varietyRow?.crop_variety ?? varietyRow?.variety ?? varietyRow?.strain ?? 'Musang King (D197)';

  // Milestone dates — take first non-null found
  const sowingDate         = rows.find(r => r.sowing_date ?? r.planting_date)?.sowing_date
                             ?? rows.find(r => r.planting_date)?.planting_date
                             ?? null;
  const expectedHarvestDate = rows.find(r => r.expected_harvest_date ?? r.harvest_date)?.expected_harvest_date
                             ?? rows.find(r => r.harvest_date)?.harvest_date
                             ?? null;

  // CV image metadata — aggregate any image records
  const imageRecords = rows.filter(r => r.image_filename);
  const imageLabels  = [...new Set(imageRecords.map(r => r.image_label).filter(Boolean))];
  const avgCVConfidence = imageRecords.length
    ? +avg(imageRecords.map(r => num(r.image_confidence, 0))).toFixed(0)
    : null;

  return {
    cropVariety,
    sowingDate,
    expectedHarvestDate,
    imageRecordsCount:  imageRecords.length,
    detectedCVLabels:   imageLabels,
    avgCVConfidence,
    recordCount: rows.length,
  };
}

function summariseOperations(rows: OperationsRecord[]) {
  if (!rows.length) return null;

  const inputRows = rows.filter(r => r.input_type ?? r.type);
  const lowerType = (r: OperationsRecord) => (r.input_type ?? r.type ?? '').toLowerCase();

  const fertRows      = inputRows.filter(r => lowerType(r).match(/fert|npk|urea|compost/));
  const pesticideRows = inputRows.filter(r => lowerType(r).match(/pesticide|herbicide|fungicide|spray|insect/));
  const feedRows      = inputRows.filter(r => lowerType(r).match(/feed|pellet|aqua/));

  const irrigRows     = rows.filter(r => r.irrigation_volume_l ?? r.irrigation_volume);
  const irrigVolumes  = irrigRows.map(r => num(r.irrigation_volume_l ?? r.irrigation_volume, 0));

  const eventRows = rows.filter(r => r.event_type ?? r.event);
  const recentPesticide = pesticideRows.slice(-3).map(r => ({
    date:   r.date   ?? 'N/A',
    type:   r.input_type ?? r.type ?? 'Pesticide',
    amount: r.input_amount ?? r.amount ?? '?',
    unit:   r.input_unit  ?? r.unit  ?? '',
  }));

  // Detect special events (extreme weather, equipment failure, pruning)
  const specialEventTypes = eventRows.map(r => r.event_type ?? r.event ?? '').filter(Boolean);

  return {
    totalInputEvents:        inputRows.length,
    totalFertilizerEvents:   fertRows.length,
    totalPesticideEvents:    pesticideRows.length,
    totalFeedEvents:         feedRows.length,
    totalIrrigationEvents:   irrigRows.length,
    avgIrrigationVolumeL:    irrigVolumes.length ? +avg(irrigVolumes).toFixed(0) : 0,
    specialEventCount:       eventRows.length,
    specialEventTypes:       [...new Set(specialEventTypes)].slice(0, 5),
    recentPesticide,
    recordCount: rows.length,
    sampleDates: rows.slice(0, 3).map(r => r.date).filter(Boolean),
  };
}

function summariseFinancial(rows: FinancialRecord[]) {
  if (!rows.length) return null;

  const prices   = rows.map(r => num(r.market_price_per_kg ?? r.price_per_kg ?? r.price, 55)).filter(p => p > 0);
  const volumes  = rows.map(r => num(r.volume_kg ?? r.volume, 0));
  const yields   = rows.map(r => num(r.harvest_weight_kg ?? r.yield_kg, 0));
  const gradeAs  = rows.map(r => num(r.grade_a_pct ?? r.grade_a, 0)).filter(v => v > 0);
  const fertCosts   = rows.map(r => num(r.fertilizer_cost ?? r.fert_cost, 0)).filter(v => v > 0);
  const laborCosts  = rows.map(r => num(r.labor_cost, 0)).filter(v => v > 0);
  const equipCosts  = rows.map(r => num(r.equipment_cost ?? r.maintenance_cost, 0)).filter(v => v > 0);
  const channels    = rows.map(r => r.channel ?? r.market ?? 'Local').filter(Boolean);

  const channelCounts: Record<string, number> = {};
  channels.forEach(c => { channelCounts[c] = (channelCounts[c] ?? 0) + 1; });

  return {
    avgPricePerKg:     +avg(prices).toFixed(2),
    minPrice:          prices.length ? Math.min(...prices) : 55,
    maxPrice:          prices.length ? Math.max(...prices) : 55,
    priceVolatilityPct: prices.length > 1
      ? Math.round(((Math.max(...prices) - Math.min(...prices)) / avg(prices)) * 100)
      : 0,
    avgVolumeKg:       +avg(volumes).toFixed(0),
    totalYieldKg:      +yields.reduce((a, b) => a + b, 0).toFixed(0),
    avgGradeAPct:      gradeAs.length ? +avg(gradeAs).toFixed(1) : null,
    avgFertCostRM:     fertCosts.length  ? +avg(fertCosts).toFixed(0)  : null,
    avgLaborCostRM:    laborCosts.length ? +avg(laborCosts).toFixed(0) : null,
    avgEquipCostRM:    equipCosts.length ? +avg(equipCosts).toFixed(0) : null,
    channelBreakdown:  channelCounts,
    dominantChannel:   Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Local Market',
    recordCount: rows.length,
    priceTrend:        trendLabel(prices, 'RM/kg'),
  };
}

// --- Financial Risk Analysis --------------------------------------------------
// Deterministically computes unsalable risk flags from raw financial rows.
// Runs server-side so the frontend always gets structured data regardless
// of whether the LLM call succeeds.

function analyzeFinancialData(rows: FinancialRecord[]): {
  unsalableRisk: boolean;
  alternativeStrategy: string | null;
} {
  if (!rows.length) return { unsalableRisk: false, alternativeStrategy: null };

  const prices  = rows.map(r => num(r.market_price_per_kg ?? r.price_per_kg ?? r.price, 55)).filter(p => p > 0);
  const volumes = rows.map(r => num(r.volume_kg ?? r.volume, 0));

  const avgPrice  = prices.length  ? avg(prices)  : 55;
  const avgVolume = volumes.length ? avg(volumes) : 0;
  const minPrice  = prices.length  ? Math.min(...prices) : 55;
  const maxPrice  = prices.length  ? Math.max(...prices) : 55;
  const priceVolatilityPct = prices.length > 1
    ? Math.round(((maxPrice - minPrice) / avgPrice) * 100)
    : 0;

  const isOversupplied  = avgVolume > 1000;
  const isPriceDropping = avgPrice  < 40;
  const isHighVolatile  = priceVolatilityPct > 30;

  const unsalableRisk = isOversupplied || isPriceDropping || isHighVolatile;

  const alternativeStrategy = unsalableRisk
    ? `Pivot 30% of Grade B/C inventory to F&B processing (Durian Paste/Desserts). Activating local cold-chain logistics API to match available freezer trucks. Estimated margin retention: 68%.`
    : null;

  return { unsalableRisk, alternativeStrategy };
}

// --- 真实天气获取 (Open-Meteo) ---
async function fetchRealWeatherForecast(lat: number, lng: number) {
  try {
    // 调用 Open-Meteo 免费接口获取未来7天数据
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,precipitation_sum,wind_speed_10m_max&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather API fetch failed');
    
    const data = await res.json();
    const daily = data.daily;

    const forecast = daily.time.map((dateStr: string, index: number) => {
      const date = new Date(dateStr);
      const dayName = index === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' });
      const tempMax = Math.round(daily.temperature_2m_max[index]);
      const precip = daily.precipitation_sum[index];
      const wind = daily.wind_speed_10m_max[index];

      // 根据真实数据智能匹配 Emoji 和警报
      let emoji = '☀️';
      let alert = false;

      if (precip > 20) {
        emoji = '⛈️'; // 暴雨
        alert = true;
      } else if (precip > 5) {
        emoji = '🌧️'; // 中雨
      } else if (precip > 0.1) {
        emoji = '🌦️'; // 阵雨
      } else if (wind > 25) {
        emoji = '🌀'; // 大风
        alert = true;
      } else if (tempMax > 34) {
        emoji = '🔥'; // 极端高温
        alert = true;
      } else if (tempMax > 31) {
        emoji = '🌤️'; // 多云间晴
      }

      return {
        day: dayName,
        emoji,
        temp: `${tempMax}°C`,
        alert
      };
    });

    return {
      forecast,
      avgRainfall: +(daily.precipitation_sum.reduce((a: number, b: number) => a + b, 0) / 7).toFixed(1),
      avgTempMax: +(daily.temperature_2m_max.reduce((a: number, b: number) => a + b, 0) / 7).toFixed(1),
      maxWindSpeed: Math.max(...daily.wind_speed_10m_max)
    };

  } catch (error) {
    console.error('[BioFin] Failed to fetch real weather, using fallbacks:', error);
    return null; // 如果失败，返回 null 让后面走 fallback
  }
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
        api_key:        TAVILY_KEY,
        query,
        search_depth:   'basic',
        max_results:    maxResults,
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

// Decide which Tavily queries to run based on crop type, financial & operations signals.
// Bug #5 fix: all queries are collected first, then executed in parallel with
// Promise.all — previously each `await tavilySearch()` was serial.
async function fetchMarketIntelligence(
  financial:  ReturnType<typeof summariseFinancial>,
  operations: ReturnType<typeof summariseOperations>,
  bioCrop:    ReturnType<typeof summariseBioCrop>
): Promise<{ query: string; results: TavilyResult[] }[]> {
  if (!financial) return [];

  const cropName = bioCrop?.cropVariety ?? 'Malaysian agricultural crop';
  const queriesToRun: string[] = [];

  // Signal 1: Price dropping or high volatility → export channel search
  if (financial.priceVolatilityPct > 20 || financial.avgPricePerKg < 45) {
    queriesToRun.push(`latest ${cropName} export prices Singapore Hong Kong market trend`);
  }

  // Signal 2: Any price data → check regional supply competition (always run)
  queriesToRun.push(`Thailand Vietnam ${cropName} supply export volume market competition Malaysia`);

  // Signal 3: Oversupply → by-product / alternative channel
  const oversupply = financial.avgVolumeKg > 500 && financial.avgPricePerKg < 50;
  if (oversupply || financial.priceVolatilityPct > 30) {
    queriesToRun.push(`${cropName} by-product processing dessert companies Malaysia unsold crop alternative sales channels`);
  }

  // Signal 4: Special events logged in operations
  if (operations && operations.specialEventCount > 0) {
    queriesToRun.push(`Malaysia ${cropName} crop insurance extreme weather protection farm`);
  }

  // Execute all queries in parallel — not sequentially
  const results = await Promise.all(
    queriesToRun.map(async q => ({ query: q, results: await tavilySearch(q) }))
  );
  return results;
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

// --- Default safe values (used as fallback if ZAI fails) ---------------------

function buildDefaultResult(
  envGeoRows:    Record<string, string>[],
  bioCropRows:   Record<string, string>[],
  operationsRows: Record<string, string>[],
  financialRows: Record<string, string>[],
  filesUploaded: number
): AnalysisResult {
  const { unsalableRisk, alternativeStrategy } = analyzeFinancialData(financialRows as FinancialRecord[]);

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
      hasData: financialRows.length > 0,
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
    dynamicIntelligence: {
      competitors: [
        { name: 'Thai B League', threatLevel: 'high', insight: 'Expected price cut of RM 5–8/kg, covering Singapore & Hong Kong markets.', recommendedAction: 'Lock 40% Singapore pre-sale orders to secure premium pricing before Thai supply hits.' },
        { name: 'Vietnam New Entrant', threatLevel: 'low', insight: 'Quality certification below MyGAP standard — unlikely to capture premium orders near-term.', recommendedAction: 'Monitor certification progress; maintain quality advantage as differentiator.' },
        { name: 'Local Cooperative Alliance', threatLevel: 'medium', insight: 'Johor cooperative proposes joint procurement — can reduce logistics costs by ~18%.', recommendedAction: 'Recommend lock-in: negotiate joint procurement to build dual price moat.' },
      ],
      stressTests: [
        { id: 'port_lockdown', title: 'Port Klang 7-Day Logistics Disruption', impact: 'Logistics disruption · Direct loss RM 15,000', lossEstimate: -15000, recoveryStrategy: 'Activate Singapore pre-sale price lock immediately, notify Johor cooperative for joint procurement hedge.' },
        { id: 'extreme_rain', title: 'Extreme Rainfall · Farmland Flooded 3 Days', impact: '40% yield loss · Estimated loss RM 22,000', lossEstimate: -22000, recoveryStrategy: 'Trigger crop insurance claim, accelerate drainage maintenance, shift harvest schedule forward 48h.' },
        { id: 'thai_dumping', title: 'Thai Dumping · Market Premium Eliminated', impact: 'Price drop RM 8/kg · Loss RM 9,500', lossEstimate: -9500, recoveryStrategy: 'Pivot 30% Grade B/C to F&B processing, lock Hong Kong premium channel contracts.' },
        { id: 'pest_outbreak', title: 'Pest Outbreak · Emergency Spray', impact: 'Pesticide costs surge · Loss RM 6,000', lossEstimate: -6000, recoveryStrategy: 'Deploy integrated pest management, pre-negotiate bulk pesticide pricing with suppliers.' },
      ],
    },
    marketNews: [],
    summary: {
      // Map new categories to legacy summary field names for frontend compatibility:
      // envGeo → envRecords, bioCrop → plantGrowthRecords,
      // operations → weatherRecords, financial → salesRecords
      totalDataPoints:    envGeoRows.length + bioCropRows.length + operationsRows.length + financialRows.length,
      plantGrowthRecords: bioCropRows.length,
      envRecords:         envGeoRows.length,
      weatherRecords:     operationsRows.length,
      salesRecords:       financialRows.length,
      overallHealthScore: 72,
      riskLevel:          'MEDIUM',
      filesUploaded,
    },
  };
}

// --- Strip markdown fences from LLM output -----------------------------------

/**
 * Robustly extracts and repairs a JSON object from raw LLM output.
 * Handles the full range of common model mistakes:
 *   - Markdown fences (```json ... ```)
 *   - Prose before/after the JSON object
 *   - Trailing commas before } or ]
 *   - Single-quoted strings and property names
 *   - Python literals: None → null, True → true, False → false
 *   - Smart / curly quotes: " " ' '
 *   - JS-style // line comments inside JSON
 *   - Unescaped literal newlines inside string values
 *   - Truncated output — auto-closes unclosed brackets/braces
 */
function repairLLMJson(raw: string): string {
  let t = raw;

  // Step 1: strip all markdown code fences
  t = t.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');

  // Step 2: isolate outermost { … }
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s !== -1 && e > s) t = t.slice(s, e + 1);
  else if (s !== -1)      t = t.slice(s);   // truncated — no closing brace yet

  // Step 3: replace smart / curly quotes with straight quotes
  t = t
    .replace(/[\u201C\u201D]/g, '"')   // " "
    .replace(/[\u2018\u2019]/g, "'");  // ' '

  // Step 4: Python literals
  t = t
    .replace(/:\s*None\b/g,  ': null')
    .replace(/:\s*True\b/g,  ': true')
    .replace(/:\s*False\b/g, ': false');

  // Step 5: remove JS // comments
  t = t.replace(/\/\/[^\n\r]*/g, '');

  // Step 6: trailing commas before } or ]  (run 4× for deep nesting)
  for (let i = 0; i < 4; i++) t = t.replace(/,\s*([}\]])/g, '$1');

  // Step 7: unescaped literal newlines / tabs inside string values
  // Replace raw CR/LF/tab that appear between two quote-delimited segments
  t = t.replace(/"([^"\\]*)"/g, (_match, inner: string) => {
    const fixed = inner
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"${fixed}"`;
  });

  // Step 8: close any unclosed brackets / braces (truncated output)
  const stack: string[] = [];
  let inStr = false;
  let esc   = false;
  for (const ch of t) {
    if (esc)              { esc = false; continue; }
    if (ch === '\\')    { esc = true;  continue; }
    if (ch === '"')       { inStr = !inStr; continue; }
    if (inStr)            continue;
    if (ch === '{')       stack.push('}');
    else if (ch === '[')  stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  // Append missing closing tokens in reverse order
  t = t + stack.reverse().join('');

  return t.trim();
}

// Keep old name as alias so call-sites don't change
const stripMarkdownJSON = repairLLMJson;

// --- Validate dynamicIntelligence sub-object ----------------------------------

function sanitiseDynamicIntelligence(
  raw: unknown,
  defaults: DynamicIntelligence
): DynamicIntelligence {
  if (!raw || typeof raw !== 'object') return defaults;

  const r = raw as Record<string, unknown>;
  const validThreatLevels = ['low', 'medium', 'high', 'critical'];

  // Sanitise competitors
  const rawCompetitors = Array.isArray(r.competitors) ? r.competitors : [];
  const competitors: CompetitorIntel[] = rawCompetitors.length
    ? rawCompetitors.map((c: any, i: number) => {
        const def = defaults.competitors[i] ?? defaults.competitors[0];
        return {
          name:               typeof c?.name === 'string' && c.name.trim() ? c.name.trim() : def.name,
          threatLevel:        validThreatLevels.includes(c?.threatLevel) ? c.threatLevel : def.threatLevel,
          insight:            typeof c?.insight === 'string' && c.insight.trim() ? c.insight.trim() : def.insight,
          recommendedAction:  typeof c?.recommendedAction === 'string' && c.recommendedAction.trim() ? c.recommendedAction.trim() : def.recommendedAction,
        } satisfies CompetitorIntel;
      })
    : defaults.competitors;

  // Sanitise stressTests
  const rawStressTests = Array.isArray(r.stressTests) ? r.stressTests : [];
  const stressTests: StressTestScenario[] = rawStressTests.length
    ? rawStressTests.map((s: any, i: number) => {
        const def = defaults.stressTests[i] ?? defaults.stressTests[0];
        return {
          id:               typeof s?.id === 'string' && s.id.trim() ? s.id.trim() : def.id,
          title:            typeof s?.title === 'string' && s.title.trim() ? s.title.trim() : def.title,
          impact:           typeof s?.impact === 'string' && s.impact.trim() ? s.impact.trim() : def.impact,
          lossEstimate:     typeof s?.lossEstimate === 'number' && isFinite(s.lossEstimate) ? Math.min(s.lossEstimate, 0) : def.lossEstimate,
          recoveryStrategy: typeof s?.recoveryStrategy === 'string' && s.recoveryStrategy.trim() ? s.recoveryStrategy.trim() : def.recoveryStrategy,
        } satisfies StressTestScenario;
      })
    : defaults.stressTests;

  return { competitors, stressTests };
}

// --- Validate and repair the LLM JSON before returning it --------------------

function sanitiseResult(raw: any, defaults: AnalysisResult): AnalysisResult {
  const d = defaults;
  const r = raw ?? {};

  const num_  = (v: unknown, fb: number) => (typeof v === 'number' && isFinite(v) ? v : fb);
  const str_  = (v: unknown, fb: string) => (typeof v === 'string' && v.trim() ? v.trim() : fb);
  const arr_  = (v: unknown, fb: unknown[]) => (Array.isArray(v) ? v : fb);

  const ph  = r.plantHealth  ?? {};
  const npk = ph.npk         ?? {};
  const nit = npk.nitrogen   ?? {};
  const pho = npk.phosphorus ?? {};
  const pot = npk.potassium  ?? {};
  const env = r.environment  ?? {};
  const fin = r.financial    ?? {};
  const wd  = r.weatherDetails ?? {};
  const si  = r.salesInsights ?? {};
  const sm  = r.summary      ?? {};
  const inp = r.inputs       ?? {};

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

  const validRisks = ['rain', 'drought', 'wind', null];
  const weatherRisk = validRisks.includes(r.weatherRisk) ? r.weatherRisk : null;
  const riskLevel = ['LOW', 'MEDIUM', 'HIGH'].includes(sm.riskLevel) ? sm.riskLevel : 'MEDIUM';

  return {
    bioFertReduction: clamp(num_(r.bioFertReduction, d.bioFertReduction), 0, 50),
    bioIrrigation:    clamp(num_(r.bioIrrigation, d.bioIrrigation), 1, 8),
    inputs: {
      fert:  clamp(num_(inp.fert,  d.inputs.fert),  200, 800),
      labor: clamp(num_(inp.labor, d.inputs.labor),   0, 300),
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
      hasData:             typeof si.hasData === 'boolean'        ? si.hasData           : d.salesInsights.hasData,
      unsalableRisk:       typeof si.unsalableRisk === 'boolean'  ? si.unsalableRisk     : d.salesInsights.unsalableRisk,
      alternativeStrategy: typeof si.alternativeStrategy === 'string' && si.alternativeStrategy.trim()
                             ? si.alternativeStrategy
                             : d.salesInsights.alternativeStrategy,
    },
    compliance,
    dynamicIntelligence: sanitiseDynamicIntelligence(r.dynamicIntelligence, d.dynamicIntelligence ?? {
      competitors: [
        { name: 'Thai B League', threatLevel: 'high', insight: 'Expected price cut of RM 5–8/kg, covering Singapore & Hong Kong markets.', recommendedAction: 'Lock 40% Singapore pre-sale orders.' },
        { name: 'Vietnam New Entrant', threatLevel: 'low', insight: 'Quality certification below MyGAP standard.', recommendedAction: 'Monitor certification progress.' },
        { name: 'Local Cooperative Alliance', threatLevel: 'medium', insight: 'Johor cooperative proposes joint procurement.', recommendedAction: 'Negotiate joint procurement.' },
      ],
      stressTests: [
        { id: 'port_lockdown', title: 'Port Klang 7-Day Logistics Disruption', impact: 'Logistics disruption · Direct loss RM 15,000', lossEstimate: -15000, recoveryStrategy: 'Activate Singapore pre-sale price lock.' },
        { id: 'extreme_rain', title: 'Extreme Rainfall · Farmland Flooded 3 Days', impact: '40% yield loss · Estimated loss RM 22,000', lossEstimate: -22000, recoveryStrategy: 'Trigger crop insurance, accelerate drainage.' },
        { id: 'thai_dumping', title: 'Thai Dumping · Market Premium Eliminated', impact: 'Price drop RM 8/kg · Loss RM 9,500', lossEstimate: -9500, recoveryStrategy: 'Pivot 30% Grade B/C to F&B processing.' },
        { id: 'pest_outbreak', title: 'Pest Outbreak · Emergency Spray', impact: 'Pesticide costs surge · Loss RM 6,000', lossEstimate: -6000, recoveryStrategy: 'Deploy integrated pest management.' },
      ],
    }),
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

// --- Build the ZAI prompt -----------------------------------------------------

function buildSystemPrompt(): string {
  return `You are BioFin Oracle AI - an expert agricultural intelligence engine specializing in Malaysian durian farming, financial analysis, and smart agriculture decision-making.

You will receive structured farm data summaries and optional live market intelligence from web searches. Your job is to analyze this data deeply and return a SINGLE, complete JSON object.

## Your Analysis Responsibilities:
1. **Plant Health**: Calculate bioHealthIndex (0-100) based on soil pH from EnvGeo data (ideal 5.8-7.0), NPK levels, operations frequency (fertilizer, irrigation events), and crop biological signals from BioCrop data. Convert NPK ppm to percentage bars (nitrogen: pct = ppm/60*100 capped at 100, phosphorus: pct = ppm/35*100 capped at 100, potassium: pct = ppm/140*100 capped at 100). Use soilPH and soilMoisture from EnvGeo data.
2. **Financial Projections**: Calculate costs, revenue, profit from Financial data. Use actual market_price_per_kg, yield data, and cost breakdown if provided.
3. **Weather Risk**: Classify as "rain" (special events indicating flooding/storm), "drought" (temp signals and no irrigation), "wind" (storm events), or null. Build a 7-day forecast.
4. **Compliance**: Assess Malaysian LHDN e-invoicing and MyGAP certification status.
5. **Recommendation**: Write a specific, actionable 2-3 sentence recommendation in English. If live market search results are provided, use them to inform unsalable crop solutions, alternative channels, or market timing.
6. **Risk Level**: Classify overall farm risk as "LOW", "MEDIUM", or "HIGH".
7. **Dynamic Intelligence — Competitors**: Deeply synthesize the Tavily web search results to generate 2-4 competitor entries. Each must include: name (e.g. "Thai B League", "Vietnam New Entrant"), threatLevel ("low"|"medium"|"high"|"critical"), insight (what they are doing and why it matters), and recommendedAction (specific hedging strategy). If no Tavily results are available, generate plausible competitors based on regional durian market dynamics (Thailand, Vietnam, Indonesia).
8. **Dynamic Intelligence — Stress Tests**: Generate 3-5 dynamic stress-test scenarios based on the weather forecast data, market conditions from Tavily results, and operations signals. Each must include: id (short snake_case key), title (human-readable scenario name), impact (concise consequence description), lossEstimate (RM value, negative number), and recoveryStrategy (specific actionable recovery plan). Scenarios should reflect ACTUAL conditions (e.g. if heavy rain is forecast, include a flood scenario; if Thai supply competition is detected, include a price-war scenario).

## bioFertReduction Calculation (infer from operations data):
- Optimal fertilizer events: ~12/year. Count fertilizer events from operations log.
- If fertilizer input is infrequent (< 8 events): bioFertReduction = (12 - events) * 3, capped at 50
- If fertilizer amount data available, use: optimal 400 kg/ha; deviation drives reduction
- Clamp between 0 and 50

## bioIrrigation Calculation (infer from operations data):
- Optimal: 4 irrigation events/month. Count irrigation events from operations log.
- Clamp 1-8

## Grade A/B Ratios:
- gradeARatio = 78 - (bioFertReduction * 0.85) - (abs(bioIrrigation - 4) * 2.8), clamp 28-90
- gradeBRatio = 22 + (bioFertReduction * 0.6) + (abs(bioIrrigation - 4) * 2.0), clamp 5-65
- If grade_a_pct data is present in Financial data, weight it 50% against the formula result.

## Cash Runway:
- Base: 142 days
- If total monthly cost (fertCost + laborCost) > 15000: cashRunway = 92

## CRITICAL OUTPUT RULE:
You MUST output ONLY a raw JSON object. Absolutely no markdown. No \`\`\`json fences. No explanation. No preamble. No trailing text.
- The VERY FIRST character of your entire response MUST be {
- The VERY LAST character of your entire response MUST be }
- Every string value must use double quotes. Never use single quotes.
- No trailing commas after the last item in any array or object.
- No JavaScript comments (// or /* */) inside the JSON.
- All special characters inside string values must be properly escaped (\n \t \").
FAILURE TO FOLLOW THIS RULE WILL BREAK THE SYSTEM. Output { immediately.

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
  "financial": {
    "expectedProfit": number, "cashRunway": number,
    "fertCost": number, "laborCost": number, "weatherLoss": number,
    "suggestedLoanRate": number, "pricePerKg": number, "baseRevenue": number
  },
  "salesInsights": {
    "avgPricePerKg": number, "avgVolumeKg": number,
    "priceVolatilityPct": number, "minPrice": number, "maxPrice": number,
    "dominantChannel": string, "hasData": boolean,
    "unsalableRisk": boolean,
    "alternativeStrategy": string | null
  },
  "compliance": [
    { "label": "Invoice XML Format",             "status": "ok"|"warn"|"error", "detail": string },
    { "label": "MyInvois Digital Signature",     "status": "ok"|"warn"|"error", "detail": string },
    { "label": "Supplier TIN Verification",      "status": "ok"|"warn"|"error", "detail": string },
    { "label": "SST Tax Rate Accuracy",          "status": "ok"|"warn"|"error", "detail": string },
    { "label": "Compliance Submission Deadline", "status": "ok"|"warn"|"error", "detail": string },
    { "label": "e-Invoicing Version",            "status": "ok"|"warn"|"error", "detail": string }
  ],
  "dynamicIntelligence": {
    "competitors": [
      { "name": string, "threatLevel": "low"|"medium"|"high"|"critical", "insight": string, "recommendedAction": string }
    ],
    "stressTests": [
      { "id": string, "title": string, "impact": string, "lossEstimate": number, "recoveryStrategy": string }
    ]
  },
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
  envGeo:     ReturnType<typeof summariseEnvGeo>,
  bioCrop:    ReturnType<typeof summariseBioCrop>,
  operations: ReturnType<typeof summariseOperations>,
  financial:  ReturnType<typeof summariseFinancial>,
  intel:      string,
  counts:     { envGeo: number; bioCrop: number; operations: number; financial: number; files: number },
  realWeatherText: string
): string {
  const sections: string[] = [];
  sections.push('## Uploaded Farm Data Summary\n');

  // ── Category 1: Environmental & Geospatial ────────────────────────────────
  if (envGeo) {
    sections.push(`### 1. Environmental & Geospatial Data (${envGeo.recordCount} records)
- GPS/Location provided: ${envGeo.gpsProvided ? 'Yes' : 'No'}
- Soil pH: avg ${envGeo.avgSoilPH} | Latest reading: ${envGeo.latestSoilPH} | Trend: ${envGeo.phTrend}
- Recent pH readings (last 3): ${envGeo.recentPhReadings.join(', ')}
- Soil NPK — Nitrogen: ${envGeo.avgNitrogenPPM} ppm (${envGeo.nitrogenTrend}) | Phosphorus: ${envGeo.avgPhosphorusPPM} ppm | Potassium: ${envGeo.avgPotassiumPPM} ppm
- Organic Matter: ${envGeo.avgOrganicMatterPct !== null ? `${envGeo.avgOrganicMatterPct}%` : 'Not provided'}
- Soil Type: ${envGeo.soilType}
- Water Source: type=${envGeo.waterType} | Dissolved Oxygen: ${envGeo.avgDissolvedOxygen !== null ? `${envGeo.avgDissolvedOxygen} mg/L` : 'N/A'} | Ammonia Nitrogen: ${envGeo.avgAmmoniaNitrogen} mg/L
- Sample Dates: ${envGeo.sampleDates.join(', ') || 'N/A'}`);
  } else {
    sections.push('### 1. Environmental & Geospatial Data: NOT UPLOADED — use intelligent defaults for Malaysian durian farm (soil pH 6.5, NPK N:42 P:18 K:120 ppm, peat soil)');
  }

  // ── Category 2: Biological & Crop ────────────────────────────────────────
  if (bioCrop) {
    const cvSummary = bioCrop.imageRecordsCount > 0
      ? `Image records: ${bioCrop.imageRecordsCount} | CV Labels detected: ${bioCrop.detectedCVLabels.join(', ') || 'none'} | Avg CV confidence: ${bioCrop.avgCVConfidence ?? 'N/A'}%`
      : 'No image/CV data uploaded';
    sections.push(`\n### 2. Biological & Crop Data (${bioCrop.recordCount} records)
- Crop Variety/Strain: ${bioCrop.cropVariety}
- Sowing/Planting Date: ${bioCrop.sowingDate ?? 'Not recorded'}
- Expected Harvest Date: ${bioCrop.expectedHarvestDate ?? 'Not recorded'}
- Computer Vision Field Images: ${cvSummary}`);
  } else {
    sections.push('\n### 2. Biological & Crop Data: NOT UPLOADED — use Musang King (D197) defaults, standard growth cycle');
  }

  // ── Category 3: Farming Operations ───────────────────────────────────────
  if (operations) {
    sections.push(`\n### 3. Farming Operations Data (${operations.recordCount} records)
- Total Input Events: ${operations.totalInputEvents} | Fertilizer: ${operations.totalFertilizerEvents} | Pesticide/Herbicide: ${operations.totalPesticideEvents} | Aquaculture Feed: ${operations.totalFeedEvents}
- Irrigation Events: ${operations.totalIrrigationEvents} | Avg Volume: ${operations.avgIrrigationVolumeL} L/event
- Special Events (weather/equipment/pruning): ${operations.specialEventCount} total — types: ${operations.specialEventTypes.join(', ') || 'none recorded'}
- Recent Pesticide Applications (last 3): ${JSON.stringify(operations.recentPesticide)}
- Sample Dates: ${operations.sampleDates.join(', ') || 'N/A'}`);
  } else {
    sections.push('\n### 3. Farming Operations Data: NOT UPLOADED — infer fertilizer/irrigation activity from defaults');
  }

  // ── Category 4: Financial & Commercial ───────────────────────────────────
  if (financial) {
    sections.push(`\n### 4. Financial & Commercial Data (${financial.recordCount} records)
- Market Price: avg RM ${financial.avgPricePerKg}/kg | Min: RM ${financial.minPrice} | Max: RM ${financial.maxPrice} | Trend: ${financial.priceTrend}
- Price Volatility: ${financial.priceVolatilityPct}% | Avg Sales Volume: ${financial.avgVolumeKg} kg
- Total Yield Recorded: ${financial.totalYieldKg} kg | Grade A Ratio: ${financial.avgGradeAPct !== null ? `${financial.avgGradeAPct}%` : 'Not provided'}
- Cost Breakdown — Fertilizer: ${financial.avgFertCostRM !== null ? `RM ${financial.avgFertCostRM}` : 'N/A'} | Labor: ${financial.avgLaborCostRM !== null ? `RM ${financial.avgLaborCostRM}` : 'N/A'} | Equipment/Maintenance: ${financial.avgEquipCostRM !== null ? `RM ${financial.avgEquipCostRM}` : 'N/A'}
- Dominant Sales Channel: ${financial.dominantChannel} | Channel Breakdown: ${JSON.stringify(financial.channelBreakdown)}
- ROI Baseline: avgLaborCost from user data = ${financial.avgLaborCostRM !== null ? `RM ${financial.avgLaborCostRM}/period` : 'RM 1,800/period (default)'} — use this as the baseline for ROI calculator projections`);
  } else {
    sections.push('\n### 4. Financial & Commercial Data: NOT UPLOADED — use RM 55/kg default price, 0 volume, standard cost estimates, avgLaborCost RM 1,800/period');
  }

  sections.push(`\n## Live Market Intelligence (Tavily Web Search Results)
${intel}`);
  sections.push(`\n## 实况与未来 7 天天气预报 (真实 API 数据)
  ${realWeatherText}
  请根据以上天气数据，结合用户的地理位置和作物周期，推导是否存在 "rain"（洪涝/暴雨风险）、"drought"（干旱风险）或 "wind"（风灾风险）。如果没有显著风险，weatherRisk 设为 null。`);

  sections.push(`\n## Context
- Farm: Malaysian Musang King (Durian) operation, likely Pahang/Johor region
- Currency: Malaysian Ringgit (RM)
- Compliance context: LHDN MyInvois e-invoicing Phase 3, MyGAP certification, SST 6%
- Files uploaded: ${counts.files}/4 (envGeo: ${counts.envGeo} recs | bioCrop: ${counts.bioCrop} recs | operations: ${counts.operations} recs | financial: ${counts.financial} recs)
- Total data records: ${counts.envGeo + counts.bioCrop + counts.operations + counts.financial}
- Note: summary.plantGrowthRecords = bioCrop count, summary.envRecords = envGeo count, summary.weatherRecords = operations count, summary.salesRecords = financial count

Now perform your complete analysis and output the JSON object ONLY. No text before or after.`);

  return sections.join('\n');
}

// --- Call ZAI (ilmu.ai) API ---------------------------------------------------

async function callZAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const MAX_RETRIES = 2;
  const REQUEST_TIMEOUT_MS = 280_000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    // Bug #3 fix: timeout is declared here so the `finally` block can always
    // reach it — regardless of whether the try body returned early or threw.
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(ZAI_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${ZAI_API_KEY}`,
        },
        body: JSON.stringify({
          model:       ZAI_MODEL,
          temperature: 0.1,
          max_tokens:  4096,
          stream:      true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`ZAI API error ${res.status}: ${errText.slice(0, 300)}`);
      }

      // Branch A: server downgraded to plain JSON (ignored stream:true)
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        console.log('[BioFin] API downgraded to synchronous JSON response.');
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content || !content.trim()) throw new Error('API returned empty JSON content');
        return content;
      }

      // Branch B: normal SSE stream
      if (!res.body) throw new Error('No response body');
      const reader  = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullContent = '';
      let buffer      = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Last element may be incomplete — hold it for the next chunk
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              fullContent += parsed.choices?.[0]?.delta?.content || '';
            } catch {
              console.error('[BioFin] Failed to parse stream line:', trimmed);
            }
          }
        }
      }

      if (!fullContent.trim()) {
        throw new Error(`ZAI returned empty streamed content (attempt: ${attempt})`);
      }
      return fullContent;

    } catch (err) {
      // Bug #2 fix: AbortError = the 280 s timer fired. No point retrying a
      // timed-out request — throw immediately instead of burning another slot.
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      console.warn(`[BioFin] ZAI attempt ${attempt}/${MAX_RETRIES} failed:`, String(err));
      if (isAbort || attempt === MAX_RETRIES) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    } finally {
      // Bug #3 fix: clearTimeout ONLY here — never duplicated in the catch block.
      clearTimeout(timeout);
    }
  }

  throw new Error('ZAI API exhausted all retries');
}

// ─── Internal SSE helpers ─────────────────────────────────────────────────────

const enc = new TextEncoder();

/**
 * Formats a single Server-Sent Event frame.
 *
 * SSE wire format:
 *   event: <name>\n
 *   data: <json>\n
 *   \n
 *
 * The double newline at the end is what triggers the browser EventSource
 * (and our manual reader) to dispatch the event.
 */
function sseFrame(event: string, data: unknown): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * SSE comment frame — ignored by EventSource clients but keeps the TCP
 * connection alive through Vercel's edge proxy and Cloudflare Workers.
 * Send one every ~12 s during long-running operations.
 */
function sseKeepalive(): Uint8Array {
  return enc.encode(`: keepalive ${Date.now()}\n\n`);
}

// --- POST Handler — Streaming SSE ---------------------------------------------

export async function POST(request: NextRequest) {

  // ── Security: Rate-limit (Bug #7) ─────────────────────────────────────────
  const clientIp = request.headers.get('x-forwarded-for') ?? 'anonymous';
  const { allowed } = await checkRateLimit(clientIp);
  if (!allowed) {
    return new Response('Too Many Requests', { status: 429 });
  }

  // All the heavy work happens inside the ReadableStream constructor.
  // `controller.enqueue()` pushes bytes to the client immediately —
  // no buffering, no waiting for the whole response to complete.
  const stream = new ReadableStream({
    async start(controller) {

      // ── Convenience wrappers ──────────────────────────────────────────────
      const emit = (event: string, data: unknown) => {
        try { controller.enqueue(sseFrame(event, data)); } catch { /* stream closed */ }
      };

      const stage = (s: SSEStageEvent) => emit('stage', s);

      // ── Stage 1: Parse uploaded files ─────────────────────────────────────
      stage({
        stage:    'parsing',
        message:  'Processing uploaded files…',
        progress: 8,
      });

      let filesUploaded = 0;
      let envGeoRows:     Record<string, string>[] = [];
      let bioCropRows:    Record<string, string>[] = [];
      let operationsRows: Record<string, string>[] = [];
      let financialRows:  Record<string, string>[] = [];

      try {
        const formData = await request.formData();

        // getAll() returns an array — supports multiple files per category
        const envGeoFileArr     = formData.getAll('envGeoData')      as File[];
        const bioCropFileArr    = formData.getAll('bioCropData')     as File[];
        const operationsFileArr = formData.getAll('operationsData')  as File[];
        const financialFileArr  = formData.getAll('financialData')   as File[];

        // Count categories that have at least one file
        filesUploaded = [envGeoFileArr, bioCropFileArr, operationsFileArr, financialFileArr]
          .filter(arr => arr.length > 0).length;

        // Process all files per category and concatenate records.
        // Bug #6 fix: reject any individual file that exceeds the 5 MB cap
        // before we attempt to read it, to prevent memory exhaustion.
        const readAllFiles = async (files: File[], imageOk: boolean): Promise<Record<string, string>[]> => {
          for (const f of files) {
            if (f.size > MAX_FILE_SIZE_BYTES) {
              throw new Error(
                `File "${f.name}" is ${(f.size / (1024 * 1024)).toFixed(1)} MB — ` +
                `exceeds the 5 MB per-file limit. Please split or compress the file.`
              );
            }
          }
          const results = await Promise.all(
            files.map(f => imageOk ? readFileOrImage(f) : readFile(f))
          );
          return results.flat();
        };

        [envGeoRows, bioCropRows, operationsRows, financialRows] = await Promise.all([
          envGeoFileArr.length     ? readAllFiles(envGeoFileArr,     true)  : Promise.resolve([]),
          bioCropFileArr.length    ? readAllFiles(bioCropFileArr,    true)  : Promise.resolve([]),
          operationsFileArr.length ? readAllFiles(operationsFileArr, false) : Promise.resolve([]),
          financialFileArr.length  ? readAllFiles(financialFileArr,  false) : Promise.resolve([]),
        ]);

        stage({
          stage:    'parsing',
          message:  `Parsed ${filesUploaded} file categor${filesUploaded === 1 ? 'y' : 'ies'} — ${envGeoRows.length + bioCropRows.length + operationsRows.length + financialRows.length} total records`,
          progress: 18,
          detail:   `envGeo:${envGeoRows.length} bioCrop:${bioCropRows.length} ops:${operationsRows.length} fin:${financialRows.length}`,
        });

      } catch (parseErr) {
        console.error('[BioFin] File parse error:', parseErr);
        // Non-fatal: continue with empty arrays and let AI use defaults
        stage({
          stage:    'parsing',
          message:  'File parsing encountered an issue — continuing with available data',
          progress: 18,
          detail:   String(parseErr),
        });
      }

      // ── Stage 2: Pre-aggregate + build defaults ───────────────────────────
      stage({
        stage:    'summarising',
        message:  'Summarising farm data for AI context…',
        progress: 25,
      });

      const defaults   = buildDefaultResult(envGeoRows, bioCropRows, operationsRows, financialRows, filesUploaded);
      const envGeo     = summariseEnvGeo(envGeoRows    as EnvGeoRecord[]);
      const bioCrop    = summariseBioCrop(bioCropRows  as BioCropRecord[]);
      const operations = summariseOperations(operationsRows as OperationsRecord[]);
      const financial  = summariseFinancial(financialRows   as FinancialRecord[]);

      stage({
        stage: 'searching',
        message: 'Fetching real-time weather & market intelligence concurrently…',
        progress: 30,
        detail: financial
          ? 'Open-Meteo forecast + Tavily queries: export prices, Thai supply, by-product channels'
          : 'Open-Meteo forecast (market search skipped — no financial data)',
      });

      let realWeatherDetails = null;
      let weatherPromptText = "未获取到有效天气数据。";

      const targetLat = envGeo?.latitude ?? 3.15;
      const targetLng = envGeo?.longitude ?? 101.7;

      let intelText  = 'No live market data retrieved (no financial data uploaded).';
      let marketNews: AnalysisResult['marketNews'] = [];

      // Performance: fetch weather and Tavily market intel concurrently
      const [weatherResult, intelResult] = await Promise.all([
        fetchRealWeatherForecast(targetLat, targetLng),
        financial
          ? fetchMarketIntelligence(financial, operations, bioCrop).catch(err => {
              console.error('[BioFin] Tavily error:', err);
              return null;
            })
          : Promise.resolve(null),
      ]);

      realWeatherDetails = weatherResult;
      if (realWeatherDetails) {
        weatherPromptText = `未来 7 天平均最高温 ${realWeatherDetails.avgTempMax}°C, 最大风速 ${realWeatherDetails.maxWindSpeed}km/h。
详细预测：${realWeatherDetails.forecast.map((f: { day: string; temp: string; emoji: string; alert: boolean }) => `${f.day}: ${f.temp} ${f.emoji} ${f.alert ? '(警报)' : ''}`).join(', ')}`;
      }

      if (intelResult) {
        intelText   = formatMarketIntel(intelResult);
        marketNews  = intelResult.flatMap(i =>
          i.results.map(r => ({
            query:   i.query,
            title:   r.title,
            snippet: r.content.slice(0, 280),
            url:     r.url,
          }))
        );
      } else if (financial) {
        intelText = 'Live market search unavailable - proceeding with local analysis only.';
      }

      stage({
        stage:    'searching',
        message:  `Data sources ready — weather: ${realWeatherDetails ? 'OK' : 'fallback'}, market: ${marketNews.length} article${marketNews.length !== 1 ? 's' : ''}`,
        progress: 48,
      });

      // ── Stage 4: ZAI LLM inference ────────────────────────────────────────
      // This is the long pole. We start a keepalive interval so that Vercel's
      // edge proxy and any CDN layer doesn't close the connection while the
      // model is generating (~30–90 s on ilmu-glm-5.1).
      stage({
        stage:    'analyzing',
        message:  'AI model analysing your farm data…',
        progress: 55,
        detail:   `Model: ${ZAI_MODEL} — this may take up to 90 s`,
      });

      // Keepalive: fire every 12 s. SSE comment lines (`: …`) are valid SSE
      // but invisible to EventSource — they solely exist to write bytes and
      // prevent proxy idle-connection teardowns.
      const keepaliveInterval = setInterval(() => {
        try { controller.enqueue(sseKeepalive()); } catch { clearInterval(keepaliveInterval); }
      }, 12_000);

      try {
        const systemPrompt = buildSystemPrompt();
        const userPrompt   = buildUserPrompt(envGeo, bioCrop, operations, financial, intelText, {
          envGeo:     envGeoRows.length,
          bioCrop:    bioCropRows.length,
          operations: operationsRows.length,
          financial:  financialRows.length,
          files:      filesUploaded,
        },weatherPromptText);

        const rawLLMOutput = await callZAI(systemPrompt, userPrompt);
        clearInterval(keepaliveInterval);

        // ── Stage 5: Validate & sanitise ──────────────────────────────────
        stage({
          stage:    'sanitising',
          message:  'Validating AI output…',
          progress: 88,
        });

        const cleanedJSON = stripMarkdownJSON(rawLLMOutput);
        let parsed: unknown;

        try {
          parsed = JSON.parse(cleanedJSON);
        } catch (firstErr) {
          console.error('[BioFin] JSON parse failed. Raw LLM output (first 600 chars):', rawLLMOutput.slice(0, 600));
          console.error('[BioFin] Cleaned JSON (first 600 chars):', cleanedJSON.slice(0, 600));
          throw new Error(`JSON parse error: ${(firstErr as Error).message}`);
        }

        // Concern A fix: sanitise the (potentially malformed) LLM JSON FIRST,
        // then overwrite weatherDetails with the trusted Open-Meteo payload.
        // Previously the injection happened before sanitiseResult, which meant
        // real weather data was run through the validator unnecessarily and
        // could be silently clamped or discarded by the numeric guards.
        const result = sanitiseResult(parsed, defaults);
        if (realWeatherDetails) {
          result.weatherDetails = realWeatherDetails;
        }

        // ── Complete — emit the full result and close the stream ───────────
        emit('complete', { ...result, marketNews });
        controller.close();

      } catch (aiErr) {
        clearInterval(keepaliveInterval);
        console.error('[BioFin] AI pipeline error — returning safe defaults:', aiErr);

        // Emit the safe-defaults result tagged as a fallback, then close.
        // The frontend will display the result normally but can show a notice.
        const fallbackResult: AnalysisResult = {
          ...defaults,
          marketNews,
          summary: { ...defaults.summary, riskLevel: 'MEDIUM', filesUploaded },
          recommendation: `AI analysis temporarily unavailable (${(aiErr as Error).message?.slice(0, 80)}). Dashboard showing safe baseline values — re-run to get full AI-powered insights.`,
        };

        emit('error', {
          message:  (aiErr as Error).message ?? 'Unknown AI error',
          fallback: true,
        } satisfies SSEErrorEvent);

        // Also send the fallback data so the frontend can still open the
        // dashboard in degraded mode rather than showing a blank screen.
        emit('complete', { ...fallbackResult, marketNews });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      // SSE content type — required for EventSource / manual readers
      'Content-Type':      'text/event-stream; charset=utf-8',
      // Disable all caching layers — each POST is unique
      'Cache-Control':     'no-cache, no-store, no-transform',
      // HTTP/1.1 persistent connection
      'Connection':        'keep-alive',
      // Tell nginx / Vercel's Railgun proxy NOT to buffer — flush immediately
      'X-Accel-Buffering': 'no',
    },
  });
}

// --- GET - health check & API docs -------------------------------------------

export async function GET() {
  return NextResponse.json({
    status:  'ok',
    service: 'BioFin Oracle Analysis API - ZAI Edition',
    version: '4.0.0',
    pipeline: {
      step1: 'Parse uploaded CSV/JSON/Image files (envGeo, bioCrop, operations, financial)',
      step2: 'Summarise data into compact statistics for LLM context (images → mock OCR/CV payload)',
      step3: 'Tavily live web search: market prices, competitors, by-product channels (triggered by financial/operations signals)',
      step4: 'ZAI (ilmu-glm) API call: full AI analysis -> strict JSON output',
      step5: 'Sanitise + validate JSON -> return AnalysisResult to frontend',
      fallback: 'If ZAI fails, return safe default values with error note in recommendation',
    },
    models: {
      llm:    `${ZAI_BASE_URL} (model: ${ZAI_MODEL})`,
      search: TAVILY_URL,
    },
    endpoints: {
      'POST /api/analyze': {
        accepts: 'multipart/form-data',
        fields: {
          envGeoData:     'CSV/JSON/Image — Environmental & Geospatial: latitude, longitude, soil_ph, soil_npk_nitrogen, soil_npk_phosphorus, soil_npk_potassium, organic_matter_pct, soil_type, water_type, water_temp_c, dissolved_oxygen, ammonia_nitrogen',
          bioCropData:    'CSV/JSON/Image — Biological & Crop: crop_variety, strain, sowing_date, expected_harvest_date, image_filename, image_label (CV)',
          operationsData: 'CSV/JSON — Farming Operations: date, input_type, input_amount, input_unit, irrigation_time, irrigation_volume_l, event_type, event_description',
          financialData:  'CSV/JSON — Financial & Commercial: date, harvest_weight_kg, grade_a_pct, grade_b_pct, seed_cost, fertilizer_cost, labor_cost, equipment_cost, market_price_per_kg, channel, volume_kg, revenue',
        },
        returns:   'text/event-stream — SSE events: stage (progress), error (fallback), complete (AnalysisResult)',
        imageNote: 'Images (.jpg/.jpeg/.png) in envGeoData and bioCropData are accepted. OCR/CV integration is mocked — see readFileOrImage() in route.ts for the integration point.',
      },
    },
    sampleCSV: {
      envGeoData:     'date,latitude,longitude,soil_ph,soil_npk_nitrogen,soil_npk_phosphorus,soil_npk_potassium,organic_matter_pct,soil_type,water_type,water_temp_c,dissolved_oxygen,ammonia_nitrogen\n2024-04-01,3.1570,103.4542,6.5,42,18,120,8.4,peat,river,28.5,6.2,0.05',
      bioCropData:    'date,crop_variety,strain,sowing_date,expected_harvest_date\n2024-04-01,Musang King,D197,2023-01-15,2024-07-30',
      operationsData: 'date,input_type,input_amount,input_unit,irrigation_time,irrigation_volume_l,event_type,event_description\n2024-04-01,Fertilizer,25,kg,07:00,500,,\n2024-04-03,Pesticide,2,L,,,,\n2024-04-10,,,,06:30,480,Extreme Weather,Heavy rain 3 days',
      financialData:  'date,harvest_weight_kg,grade_a_pct,grade_b_pct,fertilizer_cost,labor_cost,equipment_cost,market_price_per_kg,channel,volume_kg,revenue\n2024-03-15,1200,72,22,4800,1800,600,58,Singapore Export,320,18560',
    },
  });
}