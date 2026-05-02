/**
 * src/lib/vision.ts
 *
 * Shared Claude Vision extraction utility.
 * Extracted from src/app/api/analyze/route.ts so it can be consumed by
 * both the main analysis pipeline AND the dedicated OCR endpoint.
 *
 * Environment variable required:
 *   ANTHROPIC_API_KEY  — your Anthropic API key
 */

const ANTHROPIC_VISION_URL   = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VISION_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_API_KEY      = process.env.ANTHROPIC_API_KEY ?? '';

/** Claude Vision MIME types accepted by the messages API */
type AnthropicImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

/** Converts a File to a raw base64 string (no data-URI prefix). */
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return Buffer.from(buf).toString('base64');
}

/** Maps a file extension to an Anthropic-accepted MIME type. */
function toAnthropicMime(filename: string): AnthropicImageMediaType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, AnthropicImageMediaType> = {
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    png:  'image/png',
    gif:  'image/gif',
    webp: 'image/webp',
    heic: 'image/jpeg', // Anthropic doesn't support HEIC natively
  };
  return map[ext] ?? 'image/jpeg';
}

/**
 * Calls the Anthropic Vision API and returns a flat key→value record
 * representing the structured data extracted from the image.
 *
 * The prompt branches on document type (soil report, receipt/invoice,
 * field/crop photo, operations log) and always returns ONLY a JSON object.
 *
 * All values are normalised to strings to match the CSV-row contract used
 * by the rest of the BioFin pipeline.
 */
export async function extractImageWithVision(
  file: File,
): Promise<Record<string, string>> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to .env.local to enable Vision extraction.',
    );
  }

  const base64Data = await fileToBase64(file);
  const mediaType  = toAnthropicMime(file.name);

  const visionPrompt = `You are an expert agricultural data extraction assistant.
Analyse the image and extract ALL structured data you can read. Return ONLY a flat JSON object.

Rules:
- If this is a SOIL REPORT or LAB TEST: extract soil_ph, nitrogen_ppm, phosphorus_ppm, potassium_ppm, organic_matter_pct, soil_type, sample_date, farm_name, lab_name.
- If this is a RECEIPT or INVOICE: extract receipt_date, vendor_name, item_description, total_amount_rm, tax_amount_rm, payment_method, receipt_number.
- If this is a FIELD/CROP PHOTO: extract image_label (one of: leaf_yellowing, fruit_grade_a, fruit_grade_b, pest_damage, healthy_canopy, irrigation_system, equipment, other), image_confidence (0-100), crop_variety (if visible), estimated_maturity_pct (if fruit visible), observation_notes.
- If this is an OPERATIONS LOG or FORM: extract date, input_type, input_amount, input_unit, area_ha, operator_name, notes.
- If you cannot determine the document type, extract whatever structured text you can see.

The JSON keys must use snake_case. All values must be strings (numbers as "42.5", not 42.5).
If a field is not visible in the image, omit it entirely — do not include null or empty string values.
Output ONLY the JSON object. First character must be {. Last character must be }.`;

  const response = await fetch(ANTHROPIC_VISION_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      ANTHROPIC_VISION_MODEL,
      max_tokens: 1024,
      messages: [{
        role:    'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          { type: 'text', text: visionPrompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown error');
    throw new Error(`Anthropic Vision API HTTP ${response.status}: ${errText}`);
  }

  const body = await response.json() as {
    content: { type: string; text?: string }[];
  };

  const rawText = body.content
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('');

  // Strip any accidental markdown fences the model may have added
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('[Vision] Failed to parse model JSON:', cleaned.slice(0, 300));
    throw new Error('Vision model returned non-JSON output.');
  }

  // Normalise all values to strings (matches the CSV-row contract)
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== null && v !== undefined && v !== '') {
      flat[k] = String(v);
    }
  }

  return flat;
}
