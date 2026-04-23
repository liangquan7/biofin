import fs from 'fs';
import path from 'path';
import {
  num, avg, clamp, trendLabel,
  parseCSV, tryParseJSON,
  summariseEnvGeo, summariseBioCrop, summariseOperations, summariseFinancial,
  analyzeFinancialData,
  repairLLMJson,
  sanitiseResult, buildDefaultResult,
  buildSystemPrompt, buildUserPrompt,
  type EnvGeoRecord, type BioCropRecord, type OperationsRecord, type FinancialRecord,
  type AnalysisResult,
} from '../app/api/analyze/lib';

// ──────────────────────────────────────────────
// Test Data Fixtures
// ──────────────────────────────────────────────

const envGeoCSV = fs.readFileSync(path.resolve(__dirname, '../../test-data/env_geo_data.csv'), 'utf-8');
const bioCropCSV = fs.readFileSync(path.resolve(__dirname, '../../test-data/bio_crop_data.csv'), 'utf-8');
const operationsCSV = fs.readFileSync(path.resolve(__dirname, '../../test-data/operations_data.csv'), 'utf-8');
const financialCSV = fs.readFileSync(path.resolve(__dirname, '../../test-data/financial_data.csv'), 'utf-8');

// ──────────────────────────────────────────────
// 1. Numeric Helpers
// ──────────────────────────────────────────────

describe('num()', () => {
  it('parses valid number strings', () => {
    expect(num('42')).toBe(42);
    expect(num('3.14')).toBeCloseTo(3.14);
    expect(num('-5')).toBe(-5);
    expect(num('0')).toBe(0);
  });

  it('returns fallback for undefined/empty/NaN', () => {
    expect(num(undefined)).toBe(0);
    expect(num(undefined, 99)).toBe(99);
    expect(num('')).toBe(0);
    expect(num('', 7)).toBe(7);
    expect(num('abc', 10)).toBe(10);
  });
});

describe('avg()', () => {
  it('computes average of numbers', () => {
    expect(avg([1, 2, 3, 4, 5])).toBe(3);
    expect(avg([10, 20])).toBe(15);
  });

  it('returns 0 for empty array', () => {
    expect(avg([])).toBe(0);
  });

  it('handles single-element array', () => {
    expect(avg([42])).toBe(42);
  });
});

describe('clamp()', () => {
  it('clamps values within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('handles boundary values', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('trendLabel()', () => {
  it('returns stable for single record', () => {
    expect(trendLabel([5])).toBe('stable (single record)');
  });

  it('returns stable for zero overall', () => {
    expect(trendLabel([0, 0, 0])).toBe('stable');
  });

  it('detects rising trend (>5% increase)', () => {
    const label = trendLabel([10, 10, 10, 15, 15, 15]);
    expect(label).toContain('↑ rising');
    expect(label).toContain('+');
  });

  it('detects falling trend (>5% decrease)', () => {
    const label = trendLabel([20, 20, 20, 10, 10, 10]);
    expect(label).toContain('↓ falling');
  });

  it('returns stable for small changes', () => {
    const label = trendLabel([10, 10, 10, 10, 10]);
    expect(label).toContain('→ stable');
  });

  it('appends unit when provided', () => {
    const label = trendLabel([10, 10, 15, 15, 15], 'ppm');
    expect(label).toContain('ppm');
  });
});

// ──────────────────────────────────────────────
// 2. CSV / JSON Parsers
// ──────────────────────────────────────────────

describe('parseCSV()', () => {
  it('parses a simple CSV correctly', () => {
    const csv = 'name,age,city\nAlice,30,NYC\nBob,25,LA';
    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'Alice', age: '30', city: 'NYC' });
    expect(result[1]).toEqual({ name: 'Bob', age: '25', city: 'LA' });
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCSV('name,age')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('trims whitespace from headers and values', () => {
    const csv = ' name , age \n Alice , 30 ';
    const result = parseCSV(csv);
    expect(result[0]).toEqual({ name: 'Alice', age: '30' });
  });

  it('strips surrounding quotes from values', () => {
    const csv = 'name,city\n"Alice","NYC"';
    const result = parseCSV(csv);
    expect(result[0]).toEqual({ name: 'Alice', city: 'NYC' });
  });

  it('skips blank lines', () => {
    const csv = 'name,age\nAlice,30\n\nBob,25';
    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
  });

  it('handles CRLF line endings', () => {
    const csv = 'name,age\r\nAlice,30\r\nBob,25';
    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
  });

  it('handles missing values (fewer columns than headers)', () => {
    const csv = 'name,age,city\nAlice,30';
    const result = parseCSV(csv);
    expect(result[0].city).toBe('');
  });

  it('parses the test env_geo_data.csv file', () => {
    const result = parseCSV(envGeoCSV);
    expect(result.length).toBe(12);
    expect(result[0]).toHaveProperty('date', '2024-01-10');
    expect(result[0]).toHaveProperty('soil_ph', '5.8');
    expect(result[0]).toHaveProperty('soil_type', 'peat');
    expect(result[11]).toHaveProperty('date', '2024-12-12');
  });

  it('parses the test bio_crop_data.csv file', () => {
    const result = parseCSV(bioCropCSV);
    expect(result.length).toBe(12);
    expect(result[0]).toHaveProperty('crop_variety', 'Musang King (D197)');
    expect(result[0]).toHaveProperty('image_label', 'healthy_green');
  });

  it('parses the test operations_data.csv file', () => {
    const result = parseCSV(operationsCSV);
    expect(result.length).toBe(41);
    expect(result[0]).toHaveProperty('input_type', 'Fertilizer (NPK 15-15-15)');
    expect(result[0]).toHaveProperty('irrigation_volume_l', '500');
  });

  it('parses the test financial_data.csv file', () => {
    const result = parseCSV(financialCSV);
    expect(result.length).toBe(12);
    expect(result[0]).toHaveProperty('market_price_per_kg', '60');
    expect(result[0]).toHaveProperty('channel', 'Local Market');
  });
});

describe('tryParseJSON()', () => {
  it('parses valid JSON array', () => {
    const result = tryParseJSON('[{"a":1}]');
    expect(result).toEqual([{ a: 1 }]);
  });

  it('parses valid JSON object', () => {
    const result = tryParseJSON('{"a":1}');
    expect(result).toEqual({ a: 1 });
  });

  it('returns null for invalid JSON', () => {
    expect(tryParseJSON('not json')).toBeNull();
    expect(tryParseJSON('{invalid}')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(tryParseJSON('')).toBeNull();
  });
});

// ──────────────────────────────────────────────
// 3. Summarise Functions
// ──────────────────────────────────────────────

describe('summariseEnvGeo()', () => {
  it('returns null for empty rows', () => {
    expect(summariseEnvGeo([])).toBeNull();
  });

  it('summarises single row with defaults for missing fields', () => {
    const rows: EnvGeoRecord[] = [{ date: '2024-01-01', soil_ph: '6.2' }];
    const result = summariseEnvGeo(rows)!;
    expect(result.recordCount).toBe(1);
    expect(result.avgSoilPH).toBe(6.2);
    expect(result.latestSoilPH).toBe(6.2);
    expect(result.soilType).toBe('Not specified');
    expect(result.waterType).toBe('Not specified');
    expect(result.gpsProvided).toBe(false);
  });

  it('uses alias keys (ph, nitrogen_ppm, etc.)', () => {
    const rows: EnvGeoRecord[] = [{
      date: '2024-01-01',
      ph: '5.5',
      nitrogen_ppm: '30',
      phosphorus_ppm: '10',
      potassium_ppm: '100',
      gps_lat: '3.1',
    }];
    const result = summariseEnvGeo(rows)!;
    expect(result.avgSoilPH).toBe(5.5);
    expect(result.avgNitrogenPPM).toBe(30);
    expect(result.avgPhosphorusPPM).toBe(10);
    expect(result.avgPotassiumPPM).toBe(100);
    expect(result.gpsProvided).toBe(true);
  });

  it('computes averages across multiple rows', () => {
    const rows: EnvGeoRecord[] = [
      { date: '2024-01', soil_ph: '6.0', dissolved_oxygen: '5.0', ammonia_nitrogen: '0.1' },
      { date: '2024-02', soil_ph: '7.0', dissolved_oxygen: '7.0', ammonia_nitrogen: '0.3' },
    ];
    const result = summariseEnvGeo(rows)!;
    expect(result.avgSoilPH).toBe(6.5);
    expect(result.avgDissolvedOxygen).toBe(6.0);
    expect(Number(result.avgAmmoniaNitrogen)).toBeCloseTo(0.20);
  });

  it('processes the test CSV data end-to-end', () => {
    const rows = parseCSV(envGeoCSV) as EnvGeoRecord[];
    const result = summariseEnvGeo(rows)!;
    expect(result.recordCount).toBe(12);
    expect(result.avgSoilPH).toBeGreaterThan(5.5);
    expect(result.avgSoilPH).toBeLessThan(7.5);
    expect(result.soilType).toBeTruthy();
    expect(result.waterType).toBeTruthy();
    expect(result.gpsProvided).toBe(true);
    expect(result.sampleDates.length).toBeGreaterThan(0);
    expect(result.recentPhReadings).toHaveLength(3);
  });

  it('filters out zero dissolved oxygen values', () => {
    const rows: EnvGeoRecord[] = [
      { dissolved_oxygen: '0' },
      { dissolved_oxygen: '6.0' },
    ];
    const result = summariseEnvGeo(rows)!;
    expect(result.avgDissolvedOxygen).toBe(6.0);
  });
});

describe('summariseBioCrop()', () => {
  it('returns null for empty rows', () => {
    expect(summariseBioCrop([])).toBeNull();
  });

  it('extracts crop variety from crop_variety field', () => {
    const rows: BioCropRecord[] = [{ crop_variety: 'Musang King (D197)' }];
    const result = summariseBioCrop(rows)!;
    expect(result.cropVariety).toBe('Musang King (D197)');
  });

  it('falls back to variety alias', () => {
    const rows: BioCropRecord[] = [{ variety: 'D24' }];
    const result = summariseBioCrop(rows)!;
    expect(result.cropVariety).toBe('D24');
  });

  it('falls back to strain alias', () => {
    const rows: BioCropRecord[] = [{ strain: 'D197' }];
    const result = summariseBioCrop(rows)!;
    expect(result.cropVariety).toBe('D197');
  });

  it('defaults to Musang King when no variety specified', () => {
    const rows: BioCropRecord[] = [{ date: '2024-01-01' }];
    const result = summariseBioCrop(rows)!;
    expect(result.cropVariety).toBe('Musang King (D197)');
  });

  it('extracts sowing and harvest dates with aliases', () => {
    const rows: BioCropRecord[] = [{ planting_date: '2023-06-01', harvest_date: '2024-08-15' }];
    const result = summariseBioCrop(rows)!;
    expect(result.sowingDate).toBe('2023-06-01');
    expect(result.expectedHarvestDate).toBe('2024-08-15');
  });

  it('aggregates image metadata', () => {
    const rows: BioCropRecord[] = [
      { image_filename: 'a.jpg', image_label: 'leaf_yellowing', image_confidence: '80' },
      { image_filename: 'b.jpg', image_label: 'healthy_green', image_confidence: '90' },
      { image_filename: 'c.jpg', image_label: 'leaf_yellowing', image_confidence: '70' },
    ];
    const result = summariseBioCrop(rows)!;
    expect(result.imageRecordsCount).toBe(3);
    expect(result.detectedCVLabels).toEqual(['leaf_yellowing', 'healthy_green']);
    expect(result.avgCVConfidence).toBe(80);
  });

  it('processes the test CSV data end-to-end', () => {
    const rows = parseCSV(bioCropCSV) as BioCropRecord[];
    const result = summariseBioCrop(rows)!;
    expect(result.recordCount).toBe(12);
    expect(result.cropVariety).toBe('Musang King (D197)');
    expect(result.sowingDate).toBe('2023-01-15');
    expect(result.expectedHarvestDate).toBe('2024-07-30');
    expect(result.imageRecordsCount).toBe(12);
    expect(result.detectedCVLabels.length).toBeGreaterThan(0);
  });
});

describe('summariseOperations()', () => {
  it('returns null for empty rows', () => {
    expect(summariseOperations([])).toBeNull();
  });

  it('classifies fertilizer rows correctly', () => {
    const rows: OperationsRecord[] = [
      { input_type: 'Fertilizer (NPK 15-15-15)', input_amount: '30', input_unit: 'kg' },
      { input_type: 'Urea', input_amount: '20', input_unit: 'kg' },
      { input_type: 'Compost', input_amount: '40', input_unit: 'kg' },
    ];
    const result = summariseOperations(rows)!;
    expect(result.totalFertilizerEvents).toBe(3);
    expect(result.totalPesticideEvents).toBe(0);
  });

  it('classifies pesticide/herbicide/fungicide rows', () => {
    const rows: OperationsRecord[] = [
      { input_type: 'Pesticide (Chlorpyrifos)' },
      { input_type: 'Herbicide (Glyphosate)' },
      { input_type: 'Fungicide (Mancozeb)' },
      { input_type: 'Insecticide (Imidacloprid)' },
    ];
    const result = summariseOperations(rows)!;
    expect(result.totalPesticideEvents).toBe(4);
  });

  it('classifies feed/aqua rows', () => {
    const rows: OperationsRecord[] = [
      { input_type: 'Feed pellets' },
      { input_type: 'Aqua feed' },
    ];
    const result = summariseOperations(rows)!;
    expect(result.totalFeedEvents).toBe(2);
  });

  it('counts irrigation events and computes average volume', () => {
    const rows: OperationsRecord[] = [
      { irrigation_volume_l: '500' },
      { irrigation_volume_l: '600' },
    ];
    const result = summariseOperations(rows)!;
    expect(result.totalIrrigationEvents).toBe(2);
    expect(result.avgIrrigationVolumeL).toBe(550);
  });

  it('uses irrigation_volume alias', () => {
    const rows: OperationsRecord[] = [
      { irrigation_volume: '400' },
    ];
    const result = summariseOperations(rows)!;
    expect(result.totalIrrigationEvents).toBe(1);
    expect(result.avgIrrigationVolumeL).toBe(400);
  });

  it('extracts special events', () => {
    const rows: OperationsRecord[] = [
      { event_type: 'Extreme Weather', event_description: 'Heavy rain' },
      { event_type: 'Equipment Failure', event_description: 'Pump broke' },
      { event_type: 'Extreme Weather', event_description: 'Drought' },
    ];
    const result = summariseOperations(rows)!;
    expect(result.specialEventCount).toBe(3);
    expect(result.specialEventTypes).toEqual(['Extreme Weather', 'Equipment Failure']);
  });

  it('extracts recent pesticide records', () => {
    const rows: OperationsRecord[] = [
      { date: '2024-01', input_type: 'Pesticide A', input_amount: '2', input_unit: 'L' },
      { date: '2024-02', input_type: 'Fungicide B', input_amount: '1.5', input_unit: 'L' },
      { date: '2024-03', input_type: 'Insecticide C', input_amount: '1', input_unit: 'L' },
      { date: '2024-04', input_type: 'Pesticide D', input_amount: '3', input_unit: 'L' },
    ];
    const result = summariseOperations(rows)!;
    expect(result.recentPesticide).toHaveLength(3);
    expect(result.recentPesticide[2].type).toBe('Pesticide D');
  });

  it('processes the test CSV data end-to-end', () => {
    const rows = parseCSV(operationsCSV) as OperationsRecord[];
    const result = summariseOperations(rows)!;
    expect(result.recordCount).toBe(41);
    expect(result.totalFertilizerEvents).toBeGreaterThan(0);
    expect(result.totalPesticideEvents).toBeGreaterThan(0);
    expect(result.totalIrrigationEvents).toBeGreaterThan(0);
    expect(result.specialEventCount).toBeGreaterThan(0);
    expect(result.specialEventTypes).toContain('Extreme Weather');
  });
});

describe('summariseFinancial()', () => {
  it('returns null for empty rows', () => {
    expect(summariseFinancial([])).toBeNull();
  });

  it('computes price stats', () => {
    const rows: FinancialRecord[] = [
      { market_price_per_kg: '50', volume_kg: '100', harvest_weight_kg: '500', channel: 'Local' },
      { market_price_per_kg: '60', volume_kg: '200', harvest_weight_kg: '600', channel: 'Export' },
      { market_price_per_kg: '40', volume_kg: '150', harvest_weight_kg: '550', channel: 'Local' },
    ];
    const result = summariseFinancial(rows)!;
    expect(result.minPrice).toBe(40);
    expect(result.maxPrice).toBe(60);
    expect(Number(result.avgPricePerKg)).toBeCloseTo(50);
    expect(Number(result.avgVolumeKg)).toBe(150);
    expect(Number(result.totalYieldKg)).toBe(1650);
  });

  it('computes price volatility', () => {
    const rows: FinancialRecord[] = [
      { market_price_per_kg: '30' },
      { market_price_per_kg: '70' },
    ];
    const result = summariseFinancial(rows)!;
    // volatility = (70-30)/50*100 = 80%
    expect(result.priceVolatilityPct).toBe(80);
  });

  it('computes grade A average', () => {
    const rows: FinancialRecord[] = [
      { grade_a_pct: '75' },
      { grade_a_pct: '80' },
    ];
    const result = summariseFinancial(rows)!;
    expect(Number(result.avgGradeAPct)).toBeCloseTo(77.5);
  });

  it('determines dominant channel', () => {
    const rows: FinancialRecord[] = [
      { channel: 'Singapore Export' },
      { channel: 'Singapore Export' },
      { channel: 'Local Market' },
    ];
    const result = summariseFinancial(rows)!;
    expect(result.dominantChannel).toBe('Singapore Export');
    expect(result.channelBreakdown).toEqual({ 'Singapore Export': 2, 'Local Market': 1 });
  });

  it('uses alias keys (price_per_kg, fert_cost, etc.)', () => {
    const rows: FinancialRecord[] = [
      { price_per_kg: '55', fert_cost: '1000', maintenance_cost: '500', yield_kg: '800', market: 'Local' },
    ];
    const result = summariseFinancial(rows)!;
    expect(Number(result.avgPricePerKg)).toBeCloseTo(55);
  });

  it('processes the test CSV data end-to-end', () => {
    const rows = parseCSV(financialCSV) as FinancialRecord[];
    const result = summariseFinancial(rows)!;
    expect(result.recordCount).toBe(12);
    expect(result.avgPricePerKg).toBeTruthy();
    expect(result.dominantChannel).toBeTruthy();
    expect(result.priceVolatilityPct).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// 4. Financial Risk Analysis
// ──────────────────────────────────────────────

describe('analyzeFinancialData()', () => {
  it('returns no risk for empty rows', () => {
    expect(analyzeFinancialData([])).toEqual({ unsalableRisk: false, alternativeStrategy: null });
  });

  it('detects oversupply risk (avgVolume > 1000)', () => {
    const rows: FinancialRecord[] = [
      { volume_kg: '1200' },
      { volume_kg: '1500' },
    ];
    const result = analyzeFinancialData(rows);
    expect(result.unsalableRisk).toBe(true);
    expect(result.alternativeStrategy).toContain('Pivot 30%');
  });

  it('detects price dropping risk (avgPrice < 40)', () => {
    const rows: FinancialRecord[] = [
      { market_price_per_kg: '30' },
      { market_price_per_kg: '35' },
    ];
    const result = analyzeFinancialData(rows);
    expect(result.unsalableRisk).toBe(true);
  });

  it('detects high volatility risk (>30%)', () => {
    const rows: FinancialRecord[] = [
      { market_price_per_kg: '30' },
      { market_price_per_kg: '80' },
    ];
    const result = analyzeFinancialData(rows);
    expect(result.unsalableRisk).toBe(true);
  });

  it('returns no risk for stable, healthy data', () => {
    const rows: FinancialRecord[] = [
      { market_price_per_kg: '55', volume_kg: '100' },
      { market_price_per_kg: '56', volume_kg: '120' },
      { market_price_per_kg: '54', volume_kg: '110' },
    ];
    const result = analyzeFinancialData(rows);
    expect(result.unsalableRisk).toBe(false);
    expect(result.alternativeStrategy).toBeNull();
  });

  it('processes the test financial CSV data', () => {
    const rows = parseCSV(financialCSV) as FinancialRecord[];
    const result = analyzeFinancialData(rows);
    // The test data has avg volume of ~300kg (not oversupplied),
    // avg price around 53 RM/kg (not dropping below 40),
    // but volatility is high (min 42, max 62) which may trigger risk
    // Let's verify the logic:
    const prices = rows.map(r => num(r.market_price_per_kg, 55)).filter(p => p > 0);
    const avgPrice = avg(prices);
    const volatility = Math.round(((Math.max(...prices) - Math.min(...prices)) / avgPrice) * 100);
    const volumes = rows.map(r => num(r.volume_kg, 0));
    const avgVolume = avg(volumes);
    const expected = (avgVolume > 1000) || (avgPrice < 40) || (volatility > 30);
    expect(result.unsalableRisk).toBe(expected);
  });
});

// ──────────────────────────────────────────────
// 5. repairLLMJson
// ──────────────────────────────────────────────

describe('repairLLMJson()', () => {
  it('passes through clean JSON', () => {
    const input = '{"key": "value", "num": 42}';
    expect(JSON.parse(repairLLMJson(input))).toEqual({ key: 'value', num: 42 });
  });

  it('strips markdown fences', () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(JSON.parse(repairLLMJson(input))).toEqual({ key: 'value' });
  });

  it('strips markdown fences without json label', () => {
    const input = '```\n{"key": "value"}\n```';
    expect(JSON.parse(repairLLMJson(input))).toEqual({ key: 'value' });
  });

  it('removes prose before/after JSON', () => {
    const input = 'Here is the result:\n{"key": "value"}\nEnd of response.';
    expect(JSON.parse(repairLLMJson(input))).toEqual({ key: 'value' });
  });

  it('replaces Python None/True/False', () => {
    const input = '{"a": None, "b": True, "c": False}';
    const parsed = JSON.parse(repairLLMJson(input));
    expect(parsed).toEqual({ a: null, b: true, c: false });
  });

  it('replaces smart/curly quotes', () => {
    const input = '{"key": “value”}';
    const parsed = JSON.parse(repairLLMJson(input));
    expect(parsed.key).toBe('value');
  });

  it('removes JS line comments', () => {
    const input = '{"key": "value" // a comment\n}';
    const parsed = JSON.parse(repairLLMJson(input));
    expect(parsed).toEqual({ key: 'value' });
  });

  it('removes trailing commas before } or ]', () => {
    const input = '{"a": 1, "b": [2, 3,],}';
    const parsed = JSON.parse(repairLLMJson(input));
    expect(parsed).toEqual({ a: 1, b: [2, 3] });
  });

  it('handles deeply nested trailing commas (4 levels)', () => {
    const input = '{"a": {"b": {"c": {"d": 1,},},},}';
    const parsed = JSON.parse(repairLLMJson(input));
    expect(parsed.a.b.c.d).toBe(1);
  });

  it('escapes unescaped newlines in string values', () => {
    // The input has a literal newline inside the string value
    const input = '{"text": "line1\nline2"}';
    const repaired = repairLLMJson(input);
    const parsed = JSON.parse(repaired);
    // After repair, the newline should be escaped so JSON.parse succeeds
    // and the result contains the escaped newline sequence
    expect(parsed.text).toContain('line1');
    expect(parsed.text).toContain('line2');
  });

  it('auto-closes unclosed brackets (truncated output)', () => {
    const input = '{"a": [1, 2';
    const repaired = repairLLMJson(input);
    const parsed = JSON.parse(repaired);
    expect(parsed.a).toEqual([1, 2]);
  });

  it('auto-closes multiple unclosed brackets', () => {
    const input = '{"a": {"b": [1';
    const repaired = repairLLMJson(input);
    const parsed = JSON.parse(repaired);
    expect(parsed.a.b).toEqual([1]);
  });
});

// ──────────────────────────────────────────────
// 6. sanitiseResult
// ──────────────────────────────────────────────

describe('sanitiseResult()', () => {
  const defaults = buildDefaultResult([], [], [], [], 0);

  it('returns defaults for null/undefined input', () => {
    const result = sanitiseResult(null, defaults);
    expect(result.bioFertReduction).toBe(defaults.bioFertReduction);
    expect(result.bioIrrigation).toBe(defaults.bioIrrigation);
    expect(result.recommendation).toBe(defaults.recommendation);
  });

  it('returns defaults for empty object input', () => {
    const result = sanitiseResult({}, defaults);
    expect(result.loanRate).toBe(defaults.loanRate);
    expect(result.plantHealth.soilPH).toBe(defaults.plantHealth.soilPH);
  });

  it('clamps bioFertReduction to 0-50', () => {
    const result1 = sanitiseResult({ bioFertReduction: -10 }, defaults);
    expect(result1.bioFertReduction).toBe(0);
    const result2 = sanitiseResult({ bioFertReduction: 100 }, defaults);
    expect(result2.bioFertReduction).toBe(50);
  });

  it('clamps bioIrrigation to 1-8', () => {
    const result1 = sanitiseResult({ bioIrrigation: -5 }, defaults);
    expect(result1.bioIrrigation).toBe(1);
    const result2 = sanitiseResult({ bioIrrigation: 20 }, defaults);
    expect(result2.bioIrrigation).toBe(8);
  });

  it('clamps loanRate to 3-15', () => {
    expect(sanitiseResult({ loanRate: 1 }, defaults).loanRate).toBe(3);
    expect(sanitiseResult({ loanRate: 20 }, defaults).loanRate).toBe(15);
  });

  it('validates weatherRisk values', () => {
    expect(sanitiseResult({ weatherRisk: 'rain' }, defaults).weatherRisk).toBe('rain');
    expect(sanitiseResult({ weatherRisk: 'drought' }, defaults).weatherRisk).toBe('drought');
    expect(sanitiseResult({ weatherRisk: 'wind' }, defaults).weatherRisk).toBe('wind');
    expect(sanitiseResult({ weatherRisk: null }, defaults).weatherRisk).toBeNull();
    expect(sanitiseResult({ weatherRisk: 'invalid' }, defaults).weatherRisk).toBeNull();
  });

  it('validates riskLevel values', () => {
    expect(sanitiseResult({ summary: { riskLevel: 'LOW' } }, defaults).summary.riskLevel).toBe('LOW');
    expect(sanitiseResult({ summary: { riskLevel: 'INVALID' } }, defaults).summary.riskLevel).toBe('MEDIUM');
  });

  it('uses valid LLM values when provided', () => {
    const raw = {
      bioFertReduction: 10,
      bioIrrigation: 5,
      loanRate: 8,
      plantHealth: { bioHealthIndex: 85, soilPH: 6.2, npk: { nitrogen: { ppm: 40, pct: 65 } } },
      financial: { expectedProfit: 25000, cashRunway: 100 },
    };
    const result = sanitiseResult(raw, defaults);
    expect(result.bioFertReduction).toBe(10);
    expect(result.bioIrrigation).toBe(5);
    expect(result.loanRate).toBe(8);
    expect(result.plantHealth.bioHealthIndex).toBe(85);
    expect(result.plantHealth.soilPH).toBe(6.2);
    expect(result.financial.expectedProfit).toBe(25000);
  });

  it('ensures cashRunway is non-negative', () => {
    expect(sanitiseResult({ financial: { cashRunway: -10 } }, defaults).financial.cashRunway).toBe(0);
  });

  it('ensures financial costs are non-negative', () => {
    expect(sanitiseResult({ financial: { fertCost: -100 } }, defaults).financial.fertCost).toBe(0);
    expect(sanitiseResult({ financial: { laborCost: -50 } }, defaults).financial.laborCost).toBe(0);
  });

  it('preserves boolean fields in salesInsights', () => {
    const raw = { salesInsights: { hasData: true, unsalableRisk: true, alternativeStrategy: 'Do X' } };
    const result = sanitiseResult(raw, defaults);
    expect(result.salesInsights.hasData).toBe(true);
    expect(result.salesInsights.unsalableRisk).toBe(true);
    expect(result.salesInsights.alternativeStrategy).toBe('Do X');
  });

  it('falls back to defaults for non-boolean hasData/unsalableRisk', () => {
    const raw = { salesInsights: { hasData: 'yes', unsalableRisk: 1 } };
    const result = sanitiseResult(raw, defaults);
    expect(result.salesInsights.hasData).toBe(defaults.salesInsights.hasData);
    expect(result.salesInsights.unsalableRisk).toBe(defaults.salesInsights.unsalableRisk);
  });

  it('handles compliance validation', () => {
    const raw = {
      compliance: [
        { label: 'Test', status: 'ok', detail: 'Fine' },
        { label: 'Test2', status: 'invalid', detail: 'Bad status' },
      ],
    };
    const result = sanitiseResult(raw, defaults);
    expect(result.compliance[0].status).toBe('ok');
    expect(result.compliance[1].status).toBe(defaults.compliance[1].status);
  });

  it('handles forecast validation with partial data', () => {
    const raw = {
      weatherDetails: {
        forecast: [
          { day: 'Mon', emoji: '☀️', temp: '30C', alert: true },
        ],
      },
    };
    const result = sanitiseResult(raw, defaults);
    expect(result.weatherDetails.forecast[0].day).toBe('Mon');
    expect(result.weatherDetails.forecast[0].alert).toBe(true);
    // Remaining days should fall back to defaults
    expect(result.weatherDetails.forecast.length).toBe(7);
    expect(result.weatherDetails.forecast[1].day).toBe(defaults.weatherDetails.forecast[1].day);
  });
});

// ──────────────────────────────────────────────
// 7. buildDefaultResult
// ──────────────────────────────────────────────

describe('buildDefaultResult()', () => {
  it('returns a valid AnalysisResult with all required fields', () => {
    const result = buildDefaultResult([], [], [], [], 0);
    expect(result.bioFertReduction).toBe(0);
    expect(result.bioIrrigation).toBe(4);
    expect(result.inputs).toEqual({ fert: 400, labor: 120 });
    expect(result.loanRate).toBe(5);
    expect(result.plantHealth.bioHealthIndex).toBe(72);
    expect(result.plantHealth.npk.nitrogen.ppm).toBe(42);
    expect(result.environment.avgTemp).toBe(30);
    expect(result.weatherRisk).toBeNull();
    expect(result.weatherDetails.forecast).toHaveLength(7);
    expect(result.financial.expectedProfit).toBe(18500);
    expect(result.salesInsights.dominantChannel).toBe('Local Market');
    expect(result.compliance).toHaveLength(6);
    expect(result.summary.totalDataPoints).toBe(0);
    expect(result.summary.filesUploaded).toBe(0);
  });

  it('computes totalDataPoints from all row arrays', () => {
    const result = buildDefaultResult(
      [{ a: '1' }, { a: '2' }],
      [{ b: '1' }],
      [{ c: '1' }, { c: '2' }, { c: '3' }],
      [{ d: '1' }],
      3
    );
    expect(result.summary.totalDataPoints).toBe(7);
    expect(result.summary.plantGrowthRecords).toBe(1);
    expect(result.summary.envRecords).toBe(2);
    expect(result.summary.weatherRecords).toBe(3);
    expect(result.summary.salesRecords).toBe(1);
    expect(result.summary.filesUploaded).toBe(3);
  });

  it('sets hasData based on financial rows', () => {
    const result1 = buildDefaultResult([], [], [], [], 0);
    expect(result1.salesInsights.hasData).toBe(false);
    const result2 = buildDefaultResult([], [], [], [{ revenue: '100' }], 1);
    expect(result2.salesInsights.hasData).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 8. Prompt Builders
// ──────────────────────────────────────────────

describe('buildSystemPrompt()', () => {
  it('returns a non-empty string', () => {
    const prompt = buildSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('contains key analysis instructions', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('BioFin Oracle AI');
    expect(prompt).toContain('Plant Health');
    expect(prompt).toContain('Financial Projections');
    expect(prompt).toContain('Weather Risk');
    expect(prompt).toContain('Compliance');
    expect(prompt).toContain('bioFertReduction');
    expect(prompt).toContain('bioIrrigation');
  });
});

describe('buildUserPrompt()', () => {
  it('generates prompt with no data uploaded', () => {
    const prompt = buildUserPrompt(null, null, null, null, 'No data.', {
      envGeo: 0, bioCrop: 0, operations: 0, financial: 0, files: 0,
    });
    expect(prompt).toContain('NOT UPLOADED');
    expect(prompt).toContain('No data.');
    expect(prompt).toContain('0/4');
  });

  it('generates prompt with all data categories', () => {
    const envGeo = summariseEnvGeo(parseCSV(envGeoCSV) as EnvGeoRecord[]);
    const bioCrop = summariseBioCrop(parseCSV(bioCropCSV) as BioCropRecord[]);
    const operations = summariseOperations(parseCSV(operationsCSV) as OperationsRecord[]);
    const financial = summariseFinancial(parseCSV(financialCSV) as FinancialRecord[]);

    const prompt = buildUserPrompt(envGeo, bioCrop, operations, financial, 'Market intel here', {
      envGeo: envGeo!.recordCount, bioCrop: bioCrop!.recordCount,
      operations: operations!.recordCount, financial: financial!.recordCount, files: 4,
    });

    expect(prompt).toContain('Environmental & Geospatial Data');
    expect(prompt).toContain('Biological & Crop Data');
    expect(prompt).toContain('Farming Operations Data');
    expect(prompt).toContain('Financial & Commercial Data');
    expect(prompt).toContain('Market intel here');
    expect(prompt).toContain('4/4');
    expect(prompt).toContain('Musang King');
  });

  it('includes GPS information when provided', () => {
    const envGeo = summariseEnvGeo(parseCSV(envGeoCSV) as EnvGeoRecord[]);
    const prompt = buildUserPrompt(envGeo, null, null, null, '', {
      envGeo: 12, bioCrop: 0, operations: 0, financial: 0, files: 1,
    });
    expect(prompt).toContain('GPS');
  });
});

// ──────────────────────────────────────────────
// 9. Integration: Full Pipeline (parsing + summarisation)
// ──────────────────────────────────────────────

describe('Integration: parse → summarise → risk analysis', () => {
  it('processes all 4 test CSVs through the full pipeline', () => {
    const envGeoRows = parseCSV(envGeoCSV) as EnvGeoRecord[];
    const bioCropRows = parseCSV(bioCropCSV) as BioCropRecord[];
    const opsRows = parseCSV(operationsCSV) as OperationsRecord[];
    const finRows = parseCSV(financialCSV) as FinancialRecord[];

    const envGeo = summariseEnvGeo(envGeoRows);
    const bioCrop = summariseBioCrop(bioCropRows);
    const operations = summariseOperations(opsRows);
    const financial = summariseFinancial(finRows);
    const risk = analyzeFinancialData(finRows);

    // All summaries should be non-null
    expect(envGeo).not.toBeNull();
    expect(bioCrop).not.toBeNull();
    expect(operations).not.toBeNull();
    expect(financial).not.toBeNull();

    // Verify record counts
    expect(envGeo!.recordCount).toBe(12);
    expect(bioCrop!.recordCount).toBe(12);
    expect(operations!.recordCount).toBe(41);
    expect(financial!.recordCount).toBe(12);

    // Verify cross-category consistency
    expect(envGeo!.gpsProvided).toBe(true);
    expect(bioCrop!.cropVariety).toContain('Musang King');
    expect(operations!.totalFertilizerEvents + operations!.totalPesticideEvents).toBeLessThan(operations!.totalInputEvents + 1);
    expect(Number(financial!.avgPricePerKg)).toBeGreaterThan(0);

    // Build default result and verify
    const defaults = buildDefaultResult(envGeoRows, bioCropRows, opsRows, finRows, 4);
    expect(defaults.summary.totalDataPoints).toBe(77);
    expect(defaults.summary.filesUploaded).toBe(4);

    // Sanitise with defaults
    const sanitised = sanitiseResult({}, defaults);
    expect(sanitised.summary.totalDataPoints).toBe(77);
  });
});
