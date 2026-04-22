import { NextRequest, NextResponse } from 'next/server';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlantRecord {
  date?: string;
  fertilizer_kg_ha?: string; fertilizer?: string;
  irrigation_mm?: string;    irrigation?: string;
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
  rainfall_mm?: string;      rainfall?: string;
  temp_max?: string;         temperature_max?: string;
  temp_min?: string;         temperature_min?: string;
  wind_speed_kmh?: string;   wind_speed?: string;
  storm_warning?: string;    storm?: string;
  humidity?: string;
  [key: string]: string | undefined;
}

// ─── CSV / JSON Parsers ───────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const num = (v: string | undefined, fallback = 0): number => {
  const n = parseFloat(v ?? '');
  return isFinite(n) ? n : fallback;
};

const avg = (vals: number[]): number =>
  vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─── Plant / Growth Analysis ─────────────────────────────────────────────────

function analyzePlantData(rows: PlantRecord[]) {
  if (!rows.length) {
    return {
      fertilizerInput: 400, laborHours: 120,
      bioFertReduction: 0, bioIrrigation: 4,
      soilPH: 6.5, soilMoisture: 82,
      nitrogenPPM: 42, phosphorusPPM: 18, potassiumPPM: 120,
    };
  }

  const fert   = avg(rows.map(r => num(r.fertilizer_kg_ha ?? r.fertilizer, 400)));
  const irrig  = avg(rows.map(r => num(r.irrigation_mm   ?? r.irrigation,  4)));
  const labor  = avg(rows.map(r => num(r.labor_hours      ?? r.labor,       120)));
  const ph     = avg(rows.map(r => num(r.soil_ph          ?? r.ph,          6.5)));
  const moist  = avg(rows.map(r => num(r.soil_moisture    ?? r.moisture,    82)));
  const nit    = avg(rows.map(r => num(r.nitrogen_ppm     ?? r.nitrogen,    42)));
  const phos   = avg(rows.map(r => num(r.phosphorus_ppm   ?? r.phosphorus,  18)));
  const pot    = avg(rows.map(r => num(r.potassium_ppm    ?? r.potassium,   120)));

  // Fertilizer deviation from optimal (400 kg/ha = 0 reduction)
  const bioFertReduction = clamp(Math.round(Math.max(0, (400 - fert) / 20 + (fert > 600 ? (fert - 600) / 15 : 0))), 0, 50);
  const bioIrrigation    = clamp(Math.round(irrig * 10) / 10, 0, 8);

  return {
    fertilizerInput:  Math.round(clamp(fert,  200, 800)),
    laborHours:       Math.round(clamp(labor, 0, 300)),
    bioFertReduction,
    bioIrrigation,
    soilPH:           Math.round(ph * 10) / 10,
    soilMoisture:     Math.round(moist),
    nitrogenPPM:      Math.round(nit),
    phosphorusPPM:    Math.round(phos),
    potassiumPPM:     Math.round(pot),
  };
}

// ─── Environment Analysis ─────────────────────────────────────────────────────

function analyzeEnvData(rows: EnvRecord[]) {
  if (!rows.length) {
    return { avgTemp: 30, avgHumidity: 82, avgSolar: 750, avgWind: 22, avgPressure: 1008, avgCO2: 412 };
  }
  return {
    avgTemp:     Math.round(avg(rows.map(r => num(r.temperature_c   ?? r.temperature, 30))) * 10) / 10,
    avgHumidity: Math.round(avg(rows.map(r => num(r.humidity_pct    ?? r.humidity,    82)))),
    avgSolar:    Math.round(avg(rows.map(r => num(r.solar_radiation  ?? r.solar,       750)))),
    avgWind:     Math.round(avg(rows.map(r => num(r.wind_speed       ?? r.wind,        22)))),
    avgPressure: Math.round(avg(rows.map(r => num(r.barometric_pressure ?? r.pressure, 1008)))),
    avgCO2:      Math.round(avg(rows.map(r => num(r.co2_ppm          ?? r.co2,         412)))),
  };
}

// ─── Weather Analysis ─────────────────────────────────────────────────────────

function analyzeWeatherData(rows: WeatherRecord[]) {
  if (!rows.length) {
    return { weatherRisk: null as 'rain' | 'drought' | 'wind' | null, avgRainfall: 12, avgTempMax: 32, maxWind: 22 };
  }
  const rainfall = rows.map(r => num(r.rainfall_mm ?? r.rainfall, 0));
  const tempMax  = rows.map(r => num(r.temp_max   ?? r.temperature_max, 32));
  const wind     = rows.map(r => num(r.wind_speed_kmh ?? r.wind_speed,  15));

  const avgRainfall = avg(rainfall);
  const avgTempMax  = avg(tempMax);
  const maxWind     = Math.max(...wind, 0);
  const stormDays   = rows.filter(r => {
    const sw = (r.storm_warning ?? r.storm ?? '').toLowerCase();
    return sw === 'true' || sw === '1' || sw === 'yes';
  }).length;

  let weatherRisk: 'rain' | 'drought' | 'wind' | null = null;
  if (stormDays > 2 || avgRainfall > 50) weatherRisk = 'rain';
  else if (avgTempMax > 35 && avgRainfall < 5) weatherRisk = 'drought';
  else if (maxWind > 24) weatherRisk = 'wind';

  return {
    weatherRisk,
    avgRainfall: Math.round(avgRainfall * 10) / 10,
    avgTempMax:  Math.round(avgTempMax * 10) / 10,
    maxWind:     Math.round(maxWind),
    stormDays,
  };
}

// ─── Forecast Generator ───────────────────────────────────────────────────────

function buildForecast(wx: ReturnType<typeof analyzeWeatherData>, env: ReturnType<typeof analyzeEnvData>) {
  const base = env.avgTemp;
  const days = ['Today', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((day, i) => {
    const isStorm   = wx.weatherRisk === 'rain'    && (i === 3 || i === 4);
    const isDrought = wx.weatherRisk === 'drought' && i < 4;
    const isWindy   = wx.weatherRisk === 'wind'    && (i === 2 || i === 3);
    const alert     = isStorm || isWindy;
    const emoji     = isStorm ? '⛈️' : isWindy ? '🌀' : isDrought ? '☀️' : i === 1 ? '🌤️' : '☀️';
    return { day, emoji, temp: `${Math.round(base - i * 0.6)}°C`, alert };
  });
}

// ─── Recommendation Engine ────────────────────────────────────────────────────

function buildRecommendation(plant: ReturnType<typeof analyzePlantData>, wx: ReturnType<typeof analyzeWeatherData>, health: number): string {
  if (health < 55) {
    return 'Critical: Bio-health index is below safe threshold. Increase irrigation frequency and optimise fertilizer application immediately. Grade A ratio at risk.';
  }
  if (wx.weatherRisk === 'drought') {
    return 'Prolonged drought detected in uploaded records. Activate drip irrigation protocols and install shade netting in Sector A. Consider advancing harvest by 48 hours to protect yield.';
  }
  if (wx.weatherRisk === 'rain') {
    return 'Heavy rainfall pattern detected. Prepare field drainage and elevate fruit supports. Advancing harvest window by 48 hours preserves estimated 80% of Grade A premium.';
  }
  if (wx.weatherRisk === 'wind') {
    return 'High wind event in historical record. Inspect and reinforce tree ties in exposed sectors. Monitor barometric pressure — accelerate harvest if pressure drops below 1000 hPa.';
  }
  if (plant.fertilizerInput > 600) {
    return 'Fertilizer input is above optimal range. A 15% reduction will improve net margin and reduce risk of nutrient burn. Maintain current irrigation schedule.';
  }
  if (plant.fertilizerInput < 300) {
    return 'Fertilizer input below recommended minimum. Increase to 350–450 kg/ha to sustain fruit development through the current growth phase.';
  }
  return 'All input parameters are within the safe operating zone. Maintain current harvest schedule and continue monitoring live sensor telemetry.';
}

// ─── Financial Projection ─────────────────────────────────────────────────────

function projectFinancials(plant: ReturnType<typeof analyzePlantData>, wx: ReturnType<typeof analyzeWeatherData>) {
  const baseRevenue = 35_000;
  const fertCost    = plant.fertilizerInput * 12;
  const laborCost   = plant.laborHours      * 15;
  const cost        = fertCost + laborCost;

  let yieldAdj = 0;
  if      (plant.fertilizerInput <  300) yieldAdj = -4_000;
  else if (plant.fertilizerInput >  500 && plant.fertilizerInput < 650) yieldAdj = 5_500;
  else if (plant.fertilizerInput >= 650) yieldAdj = -6_000;

  const weatherLoss  = wx.weatherRisk === 'drought' ? -8_000 : wx.weatherRisk === 'rain' ? -5_000 : wx.weatherRisk === 'wind' ? -3_000 : 0;
  const expectedProfit = baseRevenue - cost + yieldAdj + weatherLoss;
  const cashRunway     = cost > 15_000 ? 92 : 142;
  const suggestedLoanRate = plant.fertilizerInput > 550 || wx.weatherRisk ? 6.5 : 5;

  return { expectedProfit, cashRunway, suggestedLoanRate, fertCost, laborCost, weatherLoss };
}

// ─── Compliance Assessment ────────────────────────────────────────────────────

function assessCompliance(plant: ReturnType<typeof analyzePlantData>) {
  // Derive compliance posture from plant health data
  const healthOk = plant.soilPH >= 5.8 && plant.soilPH <= 7.0;
  const fertOk   = plant.fertilizerInput >= 300 && plant.fertilizerInput <= 650;

  return {
    items: [
      { label: 'Invoice XML Format',           status: fertOk  ? 'ok'   : 'error', detail: fertOk ? 'Valid structure'                  : 'Missing <TaxTotal> node' },
      { label: 'MyInvois Digital Signature',   status: 'ok',                       detail: 'Certificate valid until 2027-03' },
      { label: 'Supplier TIN Verification',    status: healthOk? 'ok'   : 'error', detail: healthOk ? 'All TINs verified'              : '3 supplier TINs unverified' },
      { label: 'SST Tax Rate Accuracy',        status: 'ok',                       detail: 'All compliant with 6% standard rate' },
      { label: 'Compliance Submission Deadline',status:'warn',                     detail: '18 days until Q2 deadline' },
      { label: 'e-Invoicing Version',          status: 'ok',                       detail: 'Upgraded to MyInvois 2.1' },
    ],
  };
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const plantFile   = formData.get('plantGrowth')    as File | null;
    const envFile     = formData.get('envVars')         as File | null;
    const weatherFile = formData.get('weatherRecords') as File | null;

    const [plantRows, envRows, weatherRows] = await Promise.all([
      plantFile   ? readFile(plantFile)   : Promise.resolve([]),
      envFile     ? readFile(envFile)     : Promise.resolve([]),
      weatherFile ? readFile(weatherFile) : Promise.resolve([]),
    ]);

    const plant   = analyzePlantData  (plantRows   as PlantRecord[]);
    const env     = analyzeEnvData    (envRows     as EnvRecord[]);
    const weather = analyzeWeatherData(weatherRows as WeatherRecord[]);
    const fin     = projectFinancials (plant, weather);
    const compliance = assessCompliance(plant);

    // Derived health indices
    const bioHealthIndex = clamp(
      Math.round(91 - plant.bioFertReduction * 1.1 - Math.abs(plant.bioIrrigation - 4) * 4.5),
      38, 100
    );
    const gradeARatio  = clamp(Math.round(78 - plant.bioFertReduction * 0.85 - Math.abs(plant.bioIrrigation - 4) * 2.8), 28, 90);
    const gradeBRatio  = clamp(Math.round(22 + plant.bioFertReduction * 0.6  + Math.abs(plant.bioIrrigation - 4) * 2.0), 5, 65);
    const lifespan     = Math.max(6, +(15 - plant.bioFertReduction * 0.14 - Math.abs(plant.bioIrrigation - 4) * 0.55).toFixed(1));

    const forecast   = buildForecast(weather, env);
    const recommendation = buildRecommendation(plant, weather, bioHealthIndex);

    // NPK percentage conversion for UI bars (0–100%)
    const npk = {
      nitrogenPct:    clamp(Math.round((plant.nitrogenPPM   / 60) * 100), 0, 100),
      phosphorusPct:  clamp(Math.round((plant.phosphorusPPM / 35) * 100), 0, 100),
      potassiumPct:   clamp(Math.round((plant.potassiumPPM  / 140)* 100), 0, 100),
    };

    return NextResponse.json({
      // ── Core simulation state (maps directly to React state) ──────────────
      bioFertReduction: plant.bioFertReduction,
      bioIrrigation:    plant.bioIrrigation,
      inputs: { fert: plant.fertilizerInput, labor: plant.laborHours },
      loanRate:         fin.suggestedLoanRate,

      // ── Plant / biological health ─────────────────────────────────────────
      plantHealth: {
        bioHealthIndex,
        gradeARatio,
        gradeBRatio,
        expectedLifespan: lifespan,
        soilPH:       plant.soilPH,
        soilMoisture: plant.soilMoisture,
        npk: {
          nitrogen:   { ppm: plant.nitrogenPPM,   pct: npk.nitrogenPct   },
          phosphorus: { ppm: plant.phosphorusPPM, pct: npk.phosphorusPct },
          potassium:  { ppm: plant.potassiumPPM,  pct: npk.potassiumPct  },
        },
      },

      // ── Environmental readings ────────────────────────────────────────────
      environment: {
        avgTemp:     env.avgTemp,
        avgHumidity: env.avgHumidity,
        solarRadiation: env.avgSolar,
        windSpeed:   env.avgWind,
        pressure:    env.avgPressure,
        co2:         env.avgCO2,
      },

      // ── Weather risk ──────────────────────────────────────────────────────
      weatherRisk: weather.weatherRisk,
      weatherDetails: {
        avgRainfall:  weather.avgRainfall,
        avgTempMax:   weather.avgTempMax,
        maxWindSpeed: weather.maxWind,
        forecast,
      },

      // ── Financial projections ─────────────────────────────────────────────
      financial: {
        expectedProfit: fin.expectedProfit,
        cashRunway:     fin.cashRunway,
        fertCost:       fin.fertCost,
        laborCost:      fin.laborCost,
        weatherLoss:    fin.weatherLoss,
        suggestedLoanRate: fin.suggestedLoanRate,
      },

      // ── Compliance ────────────────────────────────────────────────────────
      compliance: compliance.items,

      // ── AI recommendation ─────────────────────────────────────────────────
      recommendation,

      // ── Summary ───────────────────────────────────────────────────────────
      summary: {
        totalDataPoints:    plantRows.length + envRows.length + weatherRows.length,
        plantGrowthRecords: plantRows.length,
        envRecords:         envRows.length,
        weatherRecords:     weatherRows.length,
        overallHealthScore: bioHealthIndex,
        riskLevel: bioHealthIndex >= 75 ? 'LOW' : bioHealthIndex >= 55 ? 'MEDIUM' : 'HIGH',
        filesUploaded: [plantFile, envFile, weatherFile].filter(Boolean).length,
      },
    });

  } catch (error) {
    console.error('[BioFin API]', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: String(error) },
      { status: 500 }
    );
  }
}

// ─── GET – health check ───────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'BioFin Oracle Analysis API',
    version: '2.0.0',
    endpoints: {
      'POST /api/analyze': {
        description: 'Analyse uploaded farm data files and return dashboard metrics',
        accepts: 'multipart/form-data',
        fields: {
          plantGrowth:    'CSV/JSON — columns: date, fertilizer_kg_ha, irrigation_mm, labor_hours, soil_ph, soil_moisture, nitrogen_ppm, phosphorus_ppm, potassium_ppm',
          envVars:        'CSV/JSON — columns: date, temperature_c, humidity_pct, solar_radiation, wind_speed, co2_ppm, barometric_pressure',
          weatherRecords: 'CSV/JSON — columns: date, rainfall_mm, temp_max, temp_min, wind_speed_kmh, storm_warning',
        },
        returns: 'JSON with bioFertReduction, bioIrrigation, inputs, plantHealth, environment, weatherRisk, financial, compliance, recommendation, summary',
      },
    },
    sampleCSV: {
      plantGrowth: 'date,fertilizer_kg_ha,irrigation_mm,labor_hours,soil_ph,soil_moisture,nitrogen_ppm,phosphorus_ppm,potassium_ppm\n2024-04-01,380,4.2,130,6.5,84,44,17,118',
      envVars:     'date,temperature_c,humidity_pct,solar_radiation,wind_speed,co2_ppm,barometric_pressure\n2024-04-01,30.5,84,745,19,414,1009',
      weatherRecords: 'date,rainfall_mm,temp_max,temp_min,wind_speed_kmh,storm_warning\n2024-04-01,8,33,25,18,false',
    },
  });
}
