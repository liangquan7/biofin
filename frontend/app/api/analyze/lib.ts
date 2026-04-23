// --- Numeric helpers (used for pre-processing & fallback) --------------------

export const num   = (v: string | undefined, fb = 0) => { const n = parseFloat(v ?? ''); return isFinite(n) ? n : fb; };
export const avg   = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Computes a human-readable trend description for the LLM.
export function trendLabel(series: number[], unit = ''): string {
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

// --- Record Types -------------------------------------------------------------

/** Category 1 — Environmental & Geospatial Data (Base Environment) */
export interface EnvGeoRecord {
  date?: string;
  latitude?: string;             gps_lat?: string;
  longitude?: string;            gps_lng?: string;
  polygon_boundary?: string;
  soil_ph?: string;              ph?: string;
  soil_npk_nitrogen?: string;    nitrogen_ppm?: string;   nitrogen?: string;
  soil_npk_phosphorus?: string;  phosphorus_ppm?: string; phosphorus?: string;
  soil_npk_potassium?: string;   potassium_ppm?: string;  potassium?: string;
  organic_matter_pct?: string;   organic_matter?: string;
  soil_type?: string;
  water_type?: string;
  water_temp_c?: string;         water_temperature?: string;
  dissolved_oxygen?: string;
  ammonia_nitrogen?: string;
  [key: string]: string | undefined;
}

/** Category 2 — Biological & Crop Data (Growth Cycle & Features) */
export interface BioCropRecord {
  date?: string;
  crop_variety?: string;         variety?: string;   strain?: string;
  sowing_date?: string;          planting_date?: string;
  expected_harvest_date?: string; harvest_date?: string;
  image_filename?: string;
  image_label?: string;
  image_confidence?: string;
  [key: string]: string | undefined;
}

/** Category 3 — Farming Operations Data (Management Records) */
export interface OperationsRecord {
  date?: string;
  input_type?: string;           type?: string;
  input_amount?: string;         amount?: string;
  input_unit?: string;           unit?: string;
  irrigation_time?: string;
  irrigation_volume_l?: string;  irrigation_volume?: string;
  event_type?: string;           event?: string;
  event_description?: string;    description?: string;
  [key: string]: string | undefined;
}

/** Category 4 — Financial & Commercial Data (Yield & Business) */
export interface FinancialRecord {
  date?: string;
  harvest_weight_kg?: string;    yield_kg?: string;
  grade_a_pct?: string;          grade_a?: string;
  grade_b_pct?: string;          grade_b?: string;
  seed_cost?: string;
  fertilizer_cost?: string;      fert_cost?: string;
  labor_cost?: string;
  equipment_cost?: string;       maintenance_cost?: string;
  market_price_per_kg?: string;  price_per_kg?: string;   price?: string;
  channel?: string;              market?: string;
  volume_kg?: string;            volume?: string;
  revenue?: string;
  [key: string]: string | undefined;
}

// --- The exact shape the frontend expects ------------------------------------

export interface AnalysisResult {
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
  marketNews?: { query: string; title: string; snippet: string; url: string }[];
  summary: {
    totalDataPoints: number; plantGrowthRecords: number;
    envRecords: number; weatherRecords: number; salesRecords: number;
    overallHealthScore: number; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    filesUploaded: number;
  };
}

// --- CSV / JSON Parsers -------------------------------------------------------

export function parseCSV(text: string): Record<string, string>[] {
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

export function tryParseJSON(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

// --- Lightweight pre-aggregation (for prompt context) ------------------------

export function summariseEnvGeo(rows: EnvGeoRecord[]) {
  if (!rows.length) return null;
  const phSeries = rows.map(r => num(r.soil_ph ?? r.ph, 6.5));
  const nSeries  = rows.map(r => num(r.soil_npk_nitrogen ?? r.nitrogen_ppm ?? r.nitrogen, 42));
  const pSeries  = rows.map(r => num(r.soil_npk_phosphorus ?? r.phosphorus_ppm ?? r.phosphorus, 18));
  const kSeries  = rows.map(r => num(r.soil_npk_potassium ?? r.potassium_ppm ?? r.potassium, 120));
  const doSeries = rows.map(r => num(r.dissolved_oxygen, 0)).filter(v => v > 0);
  const omSeries = rows.map(r => num(r.organic_matter_pct ?? r.organic_matter, 0)).filter(v => v > 0);

  return {
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
    gpsProvided:       rows.some(r => r.latitude ?? r.gps_lat),
    recordCount:       rows.length,
    sampleDates:       rows.slice(0, 3).map(r => r.date).filter(Boolean),
    nitrogenTrend:     trendLabel(nSeries, 'ppm'),
    recentPhReadings:  phSeries.slice(-3),
  };
}

export function summariseBioCrop(rows: BioCropRecord[]) {
  if (!rows.length) return null;
  const varietyRow = rows.find(r => r.crop_variety ?? r.variety ?? r.strain);
  const cropVariety = varietyRow?.crop_variety ?? varietyRow?.variety ?? varietyRow?.strain ?? 'Musang King (D197)';

  const sowingDate         = rows.find(r => r.sowing_date ?? r.planting_date)?.sowing_date
                             ?? rows.find(r => r.planting_date)?.planting_date
                             ?? null;
  const expectedHarvestDate = rows.find(r => r.expected_harvest_date ?? r.harvest_date)?.expected_harvest_date
                             ?? rows.find(r => r.harvest_date)?.harvest_date
                             ?? null;

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

export function summariseOperations(rows: OperationsRecord[]) {
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

export function summariseFinancial(rows: FinancialRecord[]) {
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

export function analyzeFinancialData(rows: FinancialRecord[]): {
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

// --- Strip markdown fences from LLM output -----------------------------------

export function repairLLMJson(raw: string): string {
  let t = raw;

  t = t.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');

  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s !== -1 && e > s) t = t.slice(s, e + 1);
  else if (s !== -1)      t = t.slice(s);

  t = t
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  t = t
    .replace(/:\s*None\b/g,  ': null')
    .replace(/:\s*True\b/g,  ': true')
    .replace(/:\s*False\b/g, ': false');

  t = t.replace(/\/\/[^\n\r]*/g, '');

  for (let i = 0; i < 4; i++) t = t.replace(/,\s*([}\]])/g, '$1');

  t = t.replace(/"([^"\\]*)"/g, (_match, inner: string) => {
    const fixed = inner
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"${fixed}"`;
  });

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
  t = t + stack.reverse().join('');

  return t.trim();
}

// --- Validate and repair the LLM JSON before returning it --------------------

export function sanitiseResult(raw: any, defaults: AnalysisResult): AnalysisResult {
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

// --- Default safe values (used as fallback if ZAI fails) ---------------------

export function buildDefaultResult(
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
    marketNews: [],
    summary: {
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

// --- Build the ZAI prompt -----------------------------------------------------

export function buildSystemPrompt(): string {
  return `You are BioFin Oracle AI - an expert agricultural intelligence engine specializing in Malaysian durian farming, financial analysis, and smart agriculture decision-making.

You will receive structured farm data summaries and optional live market intelligence from web searches. Your job is to analyze this data deeply and return a SINGLE, complete JSON object.

## Your Analysis Responsibilities:
1. **Plant Health**: Calculate bioHealthIndex (0-100) based on soil pH from EnvGeo data (ideal 5.8-7.0), NPK levels, operations frequency (fertilizer, irrigation events), and crop biological signals from BioCrop data. Convert NPK ppm to percentage bars (nitrogen: pct = ppm/60*100 capped at 100, phosphorus: pct = ppm/35*100 capped at 100, potassium: pct = ppm/140*100 capped at 100). Use soilPH and soilMoisture from EnvGeo data.
2. **Financial Projections**: Calculate costs, revenue, profit from Financial data. Use actual market_price_per_kg, yield data, and cost breakdown if provided.
3. **Weather Risk**: Classify as "rain" (special events indicating flooding/storm), "drought" (temp signals and no irrigation), "wind" (storm events), or null. Build a 7-day forecast.
4. **Compliance**: Assess Malaysian LHDN e-invoicing and MyGAP certification status.
5. **Recommendation**: Write a specific, actionable 2-3 sentence recommendation in English. If live market search results are provided, use them to inform unsalable crop solutions, alternative channels, or market timing.
6. **Risk Level**: Classify overall farm risk as "LOW", "MEDIUM", or "HIGH".

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
  "bioFertReduction": number,
  "bioIrrigation": number,
  "inputs": { "fert": number, "labor": number },
  "loanRate": number,
  "plantHealth": {
    "bioHealthIndex": number,
    "gradeARatio": number,
    "gradeBRatio": number,
    "expectedLifespan": number,
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
      { "day": "Sat",   "emoji": "☀️", "temp": "27C", alert: false },
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
  "recommendation": string,
  "summary": {
    "totalDataPoints": number, "plantGrowthRecords": number,
    "envRecords": number, "weatherRecords": number, "salesRecords": number,
    "overallHealthScore": number, "riskLevel": "LOW"|"MEDIUM"|"HIGH",
    "filesUploaded": number
  }
}`;
}

export function buildUserPrompt(
  envGeo:     ReturnType<typeof summariseEnvGeo>,
  bioCrop:    ReturnType<typeof summariseBioCrop>,
  operations: ReturnType<typeof summariseOperations>,
  financial:  ReturnType<typeof summariseFinancial>,
  intel:      string,
  counts:     { envGeo: number; bioCrop: number; operations: number; financial: number; files: number },
): string {
  const sections: string[] = [];
  sections.push('## Uploaded Farm Data Summary\n');

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

  if (financial) {
    sections.push(`\n### 4. Financial & Commercial Data (${financial.recordCount} records)
- Market Price: avg RM ${financial.avgPricePerKg}/kg | Min: RM ${financial.minPrice} | Max: RM ${financial.maxPrice} | Trend: ${financial.priceTrend}
- Price Volatility: ${financial.priceVolatilityPct}% | Avg Sales Volume: ${financial.avgVolumeKg} kg
- Total Yield Recorded: ${financial.totalYieldKg} kg | Grade A Ratio: ${financial.avgGradeAPct !== null ? `${financial.avgGradeAPct}%` : 'Not provided'}
- Cost Breakdown — Fertilizer: ${financial.avgFertCostRM !== null ? `RM ${financial.avgFertCostRM}` : 'N/A'} | Labor: ${financial.avgLaborCostRM !== null ? `RM ${financial.avgLaborCostRM}` : 'N/A'} | Equipment/Maintenance: ${financial.avgEquipCostRM !== null ? `RM ${financial.avgEquipCostRM}` : 'N/A'}
- Dominant Sales Channel: ${financial.dominantChannel} | Channel Breakdown: ${JSON.stringify(financial.channelBreakdown)}`);
  } else {
    sections.push('\n### 4. Financial & Commercial Data: NOT UPLOADED — use RM 55/kg default price, 0 volume, standard cost estimates');
  }

  sections.push(`\n## Live Market Intelligence (Tavily Web Search Results)
${intel}`);

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
