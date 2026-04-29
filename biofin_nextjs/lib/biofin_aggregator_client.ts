// ─── biofin_aggregator_client.ts ──────────────────────────────────────────────
//
// Drop this file at:  src/lib/biofin_aggregator_client.ts
//
// PURPOSE
// ───────
// Calls the Python aggregation sidecar (/api/aggregate or in-process) and
// returns a compact JSON summary that replaces the raw dense-string approach
// previously used in route.ts (aggregateEnvGeoDense, aggregateBioCropDense,
// aggregateOperationsDense, aggregateFinancialDense).
//
// INTEGRATION INTO route.ts
// ─────────────────────────
// 1. Import this file at the top of route.ts:
//      import { buildAggregatedPromptData } from '@/lib/biofin_aggregator_client';
//
// 2. Inside the POST handler, REPLACE the four dense-string calls with:
//
//      // OLD approach (produces unbounded prompt strings):
//      // const envStr  = aggregateEnvGeoDense(envGeoRows);
//      // const bioStr  = aggregateBioCropDense(bioCropRows);
//      // const opsStr  = aggregateOperationsDense(operationsRows);
//      // const finStr  = aggregateFinancialDense(financialRows);
//
//      // NEW approach (smart Python aggregation):
//      const aggregated = await buildAggregatedPromptData({
//        envGeoFile:     formData.get('envGeoData')   as File | null,
//        bioCropFile:    formData.get('bioCropData')  as File | null,
//        operationsFile: formData.get('operationsData') as File | null,
//        financialFile:  formData.get('financialData')  as File | null,
//      });
//
// 3. Pass `aggregated.promptBlock` as the data section of buildUserPrompt()
//    instead of the four separate dense strings.
//
// ──────────────────────────────────────────────────────────────────────────────

// ─── Types mirroring Python output ───────────────────────────────────────────

interface NumericStats {
  count: number;
  mean:  number;
  std:   number;
  min:   number;
  p25:   number;
  p50:   number;
  p75:   number;
  max:   number;
}

interface CategorySummary {
  category:          string;
  source_file:       string;
  total_records:     number;
  columns_detected:  string[];
  time_range:        { first?: string; last?: string; span_days?: string };
  historical_summary: Record<string, unknown>;
  recent_data:        Record<string, unknown>[];
  error?:             string;
  fallback?:          boolean;
}

interface AggregatedData {
  env_geo:    CategorySummary | null;
  bio_crop:   CategorySummary | null;
  operations: CategorySummary | null;
  financial:  CategorySummary | null;
}

interface AggregationResult {
  /** The aggregated data as a structured object */
  data: AggregatedData;
  /** A compact string block ready to embed directly into the LLM user prompt */
  promptBlock: string;
  /** Total source records across all categories (for summary.totalDataPoints) */
  totalSourceRecords: number;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/** URL of the Python aggregation sidecar.  Override via env var. */
const AGGREGATOR_URL = process.env.BIOFIN_AGGREGATOR_URL ?? 'http://localhost:8001';

/** Timeout for the aggregation call.  Large CSVs may take a few seconds. */
const AGGREGATOR_TIMEOUT_MS = 30_000;

// ─── Main export ─────────────────────────────────────────────────────────────

export async function buildAggregatedPromptData(files: {
  envGeoFile:     File | null;
  bioCropFile:    File | null;
  operationsFile: File | null;
  financialFile:  File | null;
}): Promise<AggregationResult> {

  const results: Partial<AggregatedData> = {
    env_geo:    null,
    bio_crop:   null,
    operations: null,
    financial:  null,
  };

  const pairs: [keyof AggregatedData, File | null, string][] = [
    ['env_geo',    files.envGeoFile,     'env_geo'],
    ['bio_crop',   files.bioCropFile,    'bio_crop'],
    ['operations', files.operationsFile, 'operations'],
    ['financial',  files.financialFile,  'financial'],
  ];

  // Fire all four aggregation calls concurrently
await Promise.allSettled(
  pairs.map(async ([key, file, category]) => {
    if (!file) return;
    try {
      const summary = await callAggregator(file, category);
      results[key] = summary;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      
      // 打印日志方便本地调试
      console.warn(`[BioFin Aggregator] ${category} failed:`, err);
      
      // Store the error for inspection after all settle
      results[key] = {
        category,
        source_file:        file!.name,
        total_records:      0,
        columns_detected:   [],
        time_range:         {},
        historical_summary: { error: msg },
        recent_data:        [],
        fallback:           true,
        _413:               msg.includes('HTTP 413'), // tag for post-settle check
      } as any; 
    }
  })
);

// After all requests complete (no orphans), surface any 413 as a hard error:
const tooLargeEntry = (Object.values(results) as any[])
  .find(r => r?._413 === true);
if (tooLargeEntry) {
  throw new Error(
    `File "${tooLargeEntry.source_file}" exceeds the 20 MB aggregation limit. ` +
    `Please split it into smaller exports.`
  );
}

  const data = results as AggregatedData;

  // ── C-3 FIX: Silent sidecar failure gate ─────────────────────────────────
  // If the user uploaded files but ALL categories came back as fallback=true,
  // the sidecar is almost certainly unreachable. Surface this as a hard error
  // rather than silently returning the NO_DATA_UPLOADED sentinel and letting
  // the LLM generate mock data while the user thinks their files were processed.
  const uploadedCount = pairs.filter(([, file]) => file !== null).length;
  const fallbackCount = (Object.values(data) as (CategorySummary | null)[])
    .filter(r => r?.fallback === true).length;

  if (uploadedCount > 0 && fallbackCount === uploadedCount) {
    throw new Error(
      `CSV aggregation service is unreachable at ${AGGREGATOR_URL}. ` +
      `Ensure the Python sidecar is running: uvicorn biofin_aggregator:app --port 8001`
    );
  }

  // Partial failure: some categories worked, some didn't. Log and continue.
  if (fallbackCount > 0 && fallbackCount < uploadedCount) {
    console.warn(
      `[BioFin Aggregator] ${fallbackCount}/${uploadedCount} category aggregations ` +
      `failed. Proceeding with partial data.`
    );
  }
  // ── End C-3 FIX ──────────────────────────────────────────────────────────

  return {
    data,
    promptBlock:        buildPromptBlock(data),
    totalSourceRecords: countTotalRecords(data),
  };
}

// ─── HTTP call to sidecar ─────────────────────────────────────────────────────

async function callAggregator(file: File, category: string): Promise<CategorySummary> {
  const form = new FormData();
  form.append('file',     file);
  form.append('category', category);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGGREGATOR_TIMEOUT_MS);

  try {
    const res = await fetch(`${AGGREGATOR_URL}/aggregate`, {
      method: 'POST',
      body:   form,
      signal: controller.signal,
      // ✅ FIX #3: Forward the shared secret so the sidecar middleware can
      // verify this request originated from the Next.js server process, not
      // from an external host or a direct browser request.
      headers: {
        'X-Sidecar-Token': process.env.BIOFIN_SIDECAR_SECRET ?? '',
      },
    });
    if (!res.ok) {
      throw new Error(`Aggregator HTTP ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as CategorySummary;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Prompt Block Builder ────────────────────────────────────────────────────
//
// Converts the structured AggregatedData into a compact, LLM-readable string.
// Format is deliberately terse — we want max information density per token.
//
function buildPromptBlock(data: AggregatedData): string {
  const sections: string[] = [];

  if (isRealData(data.env_geo))    sections.push(buildEnvGeoBlock(data.env_geo!));
  if (isRealData(data.bio_crop))   sections.push(buildBioCropBlock(data.bio_crop!));
  if (isRealData(data.operations)) sections.push(buildOperationsBlock(data.operations!));
  if (isRealData(data.financial))  sections.push(buildFinancialBlock(data.financial!));

  if (sections.length === 0) {
    // Explicit sentinel string — the LLM system prompt must instruct the model
    // to use conservative defaults when it sees this value.
    return 'NO_DATA_UPLOADED — use conservative defaults for all fields.';
  }

  return sections.join('\n\n');
}

/**
 * Returns true only when a CategorySummary represents genuine aggregated data:
 *  • the object exists (not null / undefined)
 *  • it was NOT produced by the client-side error fallback path (fallback !== true)
 *  • it contains at least one source record (total_records > 0)
 *
 * This deliberately excludes both:
 *  a) null  — file was not uploaded for this category
 *  b) { fallback: true, total_records: 0 }  — sidecar was unreachable
 */
function isRealData(cat: CategorySummary | null | undefined): cat is CategorySummary {
  return (
    cat != null &&
    cat.fallback !== true &&
    cat.total_records > 0
  );
}

// ─── Per-category block builders ─────────────────────────────────────────────

function buildEnvGeoBlock(cat: CategorySummary): string {
  const hs  = cat.historical_summary as Record<string, unknown>;
  const stats: Record<string, NumericStats> = (hs.statistics as Record<string, NumericStats>) ?? {};
  const monthly = (hs.monthly_trends as Record<string, unknown>) ?? {};
  const gps     = (hs.gps_centroid   as Record<string, unknown>) ?? {};
  const anomalies: unknown[] = (hs.anomalies as unknown[]) ?? [];
  const insights: string[] = (hs.key_insights as string[]) ?? [];
  const tr = cat.time_range;

  const lines: string[] = [
    `=== ENV_GEO (${cat.total_records} records${tr.first ? `, ${tr.first} – ${tr.last}` : ''}) ===`,
  ];

  // Statistics
  for (const [col, s] of Object.entries(stats)) {
    lines.push(`  ${col}: avg=${s.mean}, std=${s.std}, min=${s.min}, max=${s.max} (n=${s.count})`);
  }

  // Seasonal monthly trends (only if data spans multiple months)
  for (const [col, monthly_vals] of Object.entries(monthly)) {
    const vals = Object.entries(monthly_vals as Record<string, number>)
      .map(([m, v]) => `${m.slice(5)}:${v}`)  // "2024-03" → "03:30.2"
      .join(', ');
    lines.push(`  ${col}_monthly: [${vals}]`);
  }

  if ((gps as Record<string, unknown>).lat) lines.push(`  gps_centroid: ${(gps as Record<string, unknown>).lat},${(gps as Record<string, unknown>).lng}`);

  if (anomalies.length > 0) {
    lines.push(`  anomalies: ${anomalies.length} threshold-breach rows detected`);
  }

  if (insights.length > 0) {
    lines.push(`  insights: ${insights.slice(0, 3).join(' | ')}`);
  }

  // Recent rows
  if (cat.recent_data.length > 0) {
    lines.push(`  recent_${cat.recent_data.length}_rows: ${JSON.stringify(cat.recent_data)}`);
  }

  return lines.join('\n');
}

function buildBioCropBlock(cat: CategorySummary): string {
  const hs     = cat.historical_summary as Record<string, unknown>;
  const stats  = (hs.statistics         as Record<string, NumericStats>) ?? {};
  const monthly = (hs.monthly_trends    as Record<string, Record<string, number>>) ?? {};
  const insights: string[] = (hs.key_insights as string[]) ?? [];
  const tr = cat.time_range;

  const lines: string[] = [
    `=== BIO_CROP (${cat.total_records} records${tr.first ? `, ${tr.first} – ${tr.last}` : ''}) ===`,
  ];

  if ((hs.crop_varieties as string[] | undefined)?.length)   lines.push(`  varieties: [${(hs.crop_varieties as string[]).join(', ')}]`);
  if (hs.sowing_date)              lines.push(`  sowing_date: ${hs.sowing_date}`);
  if (hs.expected_harvest)        lines.push(`  expected_harvest: ${hs.expected_harvest}`);
  if ((hs.cv_image_labels as string[] | undefined)?.length) lines.push(`  cv_labels: [${(hs.cv_image_labels as string[]).join(', ')}]`);

  for (const [col, s] of Object.entries(stats)) {
    lines.push(`  ${col}: avg=${s.mean}, min=${s.min}, max=${s.max} (n=${s.count})`);
  }
  for (const [col, mv] of Object.entries(monthly)) {
    const vals = Object.entries(mv).map(([m, v]) => `${m.slice(5)}:${v}`).join(', ');
    lines.push(`  ${col}_monthly: [${vals}]`);
  }
  if (insights.length > 0) {
    lines.push(`  insights: ${insights.slice(0, 3).join(' | ')}`);
  }
  if (cat.recent_data.length > 0) {
    lines.push(`  recent_${cat.recent_data.length}_rows: ${JSON.stringify(cat.recent_data)}`);
  }

  return lines.join('\n');
}

function buildOperationsBlock(cat: CategorySummary): string {
  const hs = cat.historical_summary as Record<string, unknown>;
  const tr = cat.time_range;

  const lines: string[] = [
    `=== OPERATIONS (${cat.total_records} records${tr.first ? `, ${tr.first} – ${tr.last}` : ''}) ===`,
  ];

  if (hs.fertilizer_events != null)  lines.push(`  fertilizer_events: ${hs.fertilizer_events}`);
  if (hs.pesticide_events != null)   lines.push(`  pesticide_events: ${hs.pesticide_events}`);
  if (hs.days_since_fertilizer)      lines.push(`  days_since_last_fertilizer: ${hs.days_since_fertilizer}`);
  if (hs.days_since_irrigation)      lines.push(`  days_since_last_irrigation: ${hs.days_since_irrigation}`);

  for (const [key, label] of [
    ['fertilizer_stats', 'fert_amount'],
    ['irrigation_stats', 'irrigation_volume_l'],
    ['labor_stats',      'labor_hours'],
    ['cost_stats',       'cost_rm'],
  ] as [string, string][]) {
    const s = hs[key] as NumericStats | undefined;
    if (s?.mean) {
      lines.push(`  ${label}: avg=${s.mean}, min=${s.min}, max=${s.max} (n=${s.count})`);
    }
  }

  const breakdownEntries = Object.entries((hs.input_type_breakdown as Record<string, unknown>) ?? {}).slice(0, 6);
  if (breakdownEntries.length > 0) {
    lines.push(`  input_types: ${breakdownEntries.map(([k, v]) => `${k}:${v}`).join(', ')}`);
  }
  const specialEvents = hs.special_event_types as string[] | undefined;
  if (specialEvents && specialEvents.length > 0) {
    lines.push(`  event_types: [${specialEvents.join(', ')}]`);
  }

  const insights: string[] = (hs.key_insights as string[]) ?? [];
  if (insights.length > 0) {
    lines.push(`  insights: ${insights.slice(0, 2).join(' | ')}`);
  }
  if (cat.recent_data.length > 0) {
    lines.push(`  recent_${cat.recent_data.length}_rows: ${JSON.stringify(cat.recent_data)}`);
  }

  return lines.join('\n');
}

function buildFinancialBlock(cat: CategorySummary): string {
  const hs = cat.historical_summary as Record<string, unknown>;
  const tr = cat.time_range;

  const lines: string[] = [
    `=== FINANCIAL (${cat.total_records} records${tr.first ? `, ${tr.first} – ${tr.last}` : ''}) ===`,
  ];

  for (const [key, label] of [
    ['price_stats',   'price_rm_kg'],
    ['volume_stats',  'volume_kg'],
    ['revenue_stats', 'revenue_rm'],
    ['cost_stats',    'cost_rm'],
    ['profit_stats',  'profit_rm'],
  ] as [string, string][]) {
    const s = hs[key] as NumericStats | undefined;
    if (s?.mean) {
      lines.push(`  ${label}: avg=${s.mean}, min=${s.min}, max=${s.max} (n=${s.count})`);
    }
  }

  if (hs.price_volatility_pct != null) {
    lines.push(`  price_volatility_pct: ${hs.price_volatility_pct}`);
  }
  if (hs.estimated_annual_revenue_rm != null) {
    lines.push(`  estimated_annual_revenue_rm: ${hs.estimated_annual_revenue_rm}`);
  }

  // Monthly revenue trend (most valuable for seasonality)
  const monthlyRev = (hs.monthly_revenue as Record<string, number>) ?? {};
  if (Object.keys(monthlyRev).length > 0) {
    const vals = Object.entries(monthlyRev).map(([m, v]) => `${m.slice(5)}:${v}`).join(', ');
    lines.push(`  revenue_monthly: [${vals}]`);
  }

  const annualRev = (hs.annual_revenue as Record<string, number>) ?? {};
  if (Object.keys(annualRev).length > 0) {
    const vals = Object.entries(annualRev).map(([yr, v]) => `${yr}:${v}`).join(', ');
    lines.push(`  revenue_annual: [${vals}]`);
  }

  const channelEntries = Object.entries((hs.channel_breakdown as Record<string, unknown>) ?? {}).slice(0, 5);
  if (channelEntries.length > 0) {
    lines.push(`  channels: ${channelEntries.map(([k, v]) => `${k}:${v}`).join(', ')}`);
  }

  const insights: string[] = (hs.key_insights as string[]) ?? [];
  if (insights.length > 0) {
    lines.push(`  insights: ${insights.slice(0, 3).join(' | ')}`);
  }
  if (cat.recent_data.length > 0) {
    lines.push(`  recent_${cat.recent_data.length}_rows: ${JSON.stringify(cat.recent_data)}`);
  }

  return lines.join('\n');
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function countTotalRecords(data: AggregatedData): number {
  return (
    (data.env_geo?.total_records    ?? 0) +
    (data.bio_crop?.total_records   ?? 0) +
    (data.operations?.total_records ?? 0) +
    (data.financial?.total_records  ?? 0)
  );
}