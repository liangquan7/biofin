/**
 * src/app/api/ocr/route.ts
 *
 * Dedicated OCR endpoint for the Smart Receipt & Invoice Scanner component.
 *
 * Accepts: POST multipart/form-data  { file: File }
 * Returns: JSON  { ok: true, data: Record<string, string> }
 *       or JSON  { ok: false, error: string }            (4xx / 5xx)
 *
 * Internally delegates to the shared extractImageWithVision() utility so
 * the Vision prompt and model config live in exactly one place.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractImageWithVision }    from '@/lib/vision';

// ─── File-size cap ────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB (matches frontend guard)

// ─── Accepted MIME types ──────────────────────────────────────────────────────
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

// ─── ✅ FIX #4: Simple per-IP rate limiter ────────────────────────────────────
// Prevents a single client from hammering the Anthropic Vision API and
// exhausting your API budget mid-demo.  No external dependency required.
// Limits each IP to 10 OCR requests per 60 seconds.
const RATE_LIMIT_MAX      = 10;
const RATE_LIMIT_WINDOW   = 60_000; // ms

const ipBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now   = Date.now();
  const entry = ipBuckets.get(ip);

  if (!entry || now > entry.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Periodically prune stale entries so the Map doesn't grow unbounded.
// This runs every 5 minutes and removes any window that already expired.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipBuckets.entries()) {
    if (now > entry.resetAt) ipBuckets.delete(ip);
  }
}, 5 * 60_000);

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ✅ FIX #4: Enforce rate limit before doing any work.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please wait 60 seconds before scanning again.' },
      { status: 429 },
    );
  }

  try {
    // 1. Parse multipart form data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid multipart/form-data payload.' },
        { status: 400 },
      );
    }

    // 2. Extract and validate the uploaded file
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Missing "file" field in form data.' },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unsupported file type "${file.type}". Upload JPG, PNG, WebP, or GIF.`,
        },
        { status: 415 },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { ok: false, error: `File exceeds the 8 MB size limit.` },
        { status: 413 },
      );
    }

    // 3. Run Claude Vision extraction
    //    extractImageWithVision() returns a flat Record<string, string> whose
    //    keys depend on what the model detects (receipt, soil report, etc.).
    console.log(
      `[OCR] Processing "${file.name}" (${(file.size / 1024).toFixed(1)} KB, ${file.type})`,
    );

    const data = await extractImageWithVision(file);

    console.log(
      `[OCR] Extracted ${Object.keys(data).length} fields from "${file.name}".`,
    );

    // 4. Return the structured result
    return NextResponse.json({ ok: true, data }, { status: 200 });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[OCR] Extraction failed:', message);

    return NextResponse.json(
      { ok: false, error: `Vision extraction failed: ${message}` },
      { status: 500 },
    );
  }
}