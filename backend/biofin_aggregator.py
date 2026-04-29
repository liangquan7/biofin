"""
biofin_aggregator.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BioFin Oracle — Smart CSV Aggregation Layer (Task 4)

PURPOSE
-------
Large historical CSVs (sensor data, daily operations logs, 2+ years of
environmental records) can easily contain 5,000+ rows.  Naively truncating
to 20 rows destroys seasonal context and long-run trends.  This module
transforms every category of BioFin CSV into a *condensed JSON summary*
that preserves:

  • Full statistical profile (mean, std, min, max, percentiles)
  • Annual / quarterly / monthly aggregates → seasonal patterns visible
  • Key variance events (anomaly rows that deviate > 2σ from the mean)
  • The last N rows for current / most-recent context
  • A human-readable insights block the LLM can reason over directly

The resulting JSON is roughly 2–5 KB regardless of whether the source
CSV had 200 or 20,000 rows.

ARCHITECTURE
------------
Called by the Next.js route.ts POST handler via a Python sidecar process
(or inline via Pyodide / Vercel Python runtime).

  route.ts  ──FormData──►  /api/aggregate  (this module as FastAPI endpoint)
                ◄──JSON summary──

Alternatively, run as a standalone CLI during development:

  python biofin_aggregator.py --input envgeo.csv --category env_geo

CATEGORIES HANDLED
------------------
  env_geo      Environmental & Geospatial   (soil, weather sensors, GPS)
  bio_crop     Biological & Crop Health      (plant records, image labels)
  operations   Farming Operations            (inputs, irrigation, events)
  financial    Financial & Commercial        (sales, costs, revenue)

DEPENDENCIES
------------
  pip install pandas numpy fastapi uvicorn python-multipart
"""

from __future__ import annotations

import io
import json
import math
import argparse
import os
import sys
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
import uvicorn


# ─── Constants ───────────────────────────────────────────────────────────────

RECENT_ROWS          = 8    # How many tail rows to include verbatim as "recent_data"
ANOMALY_SIGMA        = 2.0  # Standard deviations above mean → flagged as anomaly
MAX_ANOMALY_ROWS     = 5    # Cap anomaly list to keep payload small
MAX_TOP_EVENTS       = 5    # Cap unique event types shown
SEASONAL_MIN_MONTHS  = 3    # Minimum months before we attempt seasonal aggregation
MAX_UPLOAD_BYTES = 20 * 1024 * 1024   # 20 MB hard cap per file
MAX_DATAFRAME_ROWS = 50_000            # cap rows before any pandas work



# ─── FastAPI App ─────────────────────────────────────────────────────────────

app = FastAPI(title="BioFin Oracle — CSV Aggregation Sidecar", version="1.0.0")

# ✅ FIX #3: Shared-secret authentication middleware.
# The sidecar must only be called from the Next.js server — never directly
# from the browser or an external host.  Set BIOFIN_SIDECAR_SECRET in both
# .env.local (Next.js) and the Python process environment.
# When the env var is absent the middleware is disabled so local dev still
# works without configuration (the process is localhost-only anyway).
SIDECAR_SECRET = os.getenv("BIOFIN_SIDECAR_SECRET", "")

@app.middleware("http")
async def require_secret(request: Request, call_next):
    if SIDECAR_SECRET:
        token = request.headers.get("X-Sidecar-Token", "")
        if token != SIDECAR_SECRET:
            return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return await call_next(request)


@app.post("/aggregate")
async def aggregate_endpoint(
    file:     UploadFile = File(...),
    category: str        = Form(...),
) -> JSONResponse:
    """
    Accept a CSV (or JSON) file and return a condensed summary JSON
    ready to be embedded directly in the LLM prompt.
    """
    try:
        # ── Guard 1: reject by declared Content-Length before touching the body.
        # UploadFile.size is populated by python-multipart when the client sends
        # a Content-Length header (all browsers do for normal form submissions).
        if file.size is not None and file.size > MAX_UPLOAD_BYTES:
            return JSONResponse(
                {
                    "error": (
                        f"File '{file.filename}' is "
                        f"{file.size / 1_048_576:.1f} MB, which exceeds the "
                        f"{MAX_UPLOAD_BYTES // 1_048_576} MB limit."
                    ),
                    "fallback": True,
                },
                status_code=413,
            )

        

        filename = file.filename or "upload"

        # ── Route to the correct aggregator ───────────────────────────────────
        aggregators = {
            "env_geo":    aggregate_env_geo,
            "bio_crop":   aggregate_bio_crop,
            "operations": aggregate_operations,
            "financial":  aggregate_financial,
        }
        if category not in aggregators:
            return JSONResponse(
                {
                    "error": (
                        f"Unknown category '{category}'. "
                        f"Expected one of: {list(aggregators.keys())}"
                    )
                },
                status_code=400,
            )

        # ── Parse into DataFrame ───────────────────────────────────────────────
        df = _load_to_dataframe(file, filename)

        # ── Guard 3: cap row count before any O(n) pandas work.
        # We keep the *tail* (most-recent rows) because date-sorted CSVs have
        # the freshest data at the bottom, which matters most for the LLM context.
        original_row_count = len(df)
        SAFE_LIMIT = 500
        if original_row_count > SAFE_LIMIT:
            df = df.tail(SAFE_LIMIT).reset_index(drop=True)

        summary = aggregators[category](df, filename)

        # Annotate if we truncated so the TypeScript client can surface a warning.
        if original_row_count > SAFE_LIMIT:
            summary["truncated"] = True
            summary["original_row_count"] = original_row_count
            summary["truncated_to"] = SAFE_LIMIT

        return JSONResponse(summary)

    except Exception as exc:
        return JSONResponse(
            {"error": str(exc), "fallback": True},
            status_code=422,
        )

# ─── Loader ───────────────────────────────────────────────────────────────────

def _load_to_dataframe(file: UploadFile, filename: str) -> pd.DataFrame:
    df: pd.DataFrame | None = None

    try:
        file.file.seek(0)
        
        if filename.lower().endswith(".json"):
            raw = json.load(file.file)
            df = pd.DataFrame(raw if isinstance(raw, list) else [raw])
        else:
            try:
                df = pd.read_csv(file.file, sep=",", on_bad_lines="skip", dtype_backend="numpy_nullable")
                if len(df.columns) <= 1: # 如果只有一列，可能是分隔符错了
                    file.file.seek(0)
                    df = pd.read_csv(file.file, sep=";", on_bad_lines="skip")
            except Exception:
                file.file.seek(0)
                df = pd.read_csv(file.file, sep="\t", on_bad_lines="skip")

    except Exception as exc:
        raise ValueError(f"Error parsing '{filename}': {exc}")
    finally:
        file.file.seek(0)

    if df is None or df.empty:
        raise ValueError(f"Could not parse '{filename}' or file is empty.")

    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
    return df


# ─── Shared Utilities ─────────────────────────────────────────────────────────

def _coerce_date_column(df: pd.DataFrame) -> pd.Series | None:
    """Find and parse the most likely date column; return as datetime Series."""
    candidates = ["date", "timestamp", "datetime", "created_at", "recorded_at",
                  "observation_date", "sale_date", "transaction_date"]
    for col in candidates:
        if col in df.columns:
            try:
                return pd.to_datetime(df[col], errors="coerce")
            except Exception:
                pass
    # Try any column whose name contains 'date'
    for col in df.columns:
        if "date" in col or "time" in col:
            try:
                parsed = pd.to_datetime(df[col], errors="coerce")
                if parsed.notna().sum() > len(df) * 0.5:
                    return parsed
            except Exception:
                pass
    return None


def _numeric_summary(series: pd.Series) -> dict[str, Any]:
    """Return a compact statistical profile for a numeric Series."""
    clean = series.dropna()
    if clean.empty:
        return {}

    # 核心修复点：定义一个内部的防暴雷转换函数
    def _safe(val: float) -> float:
        """Replace nan/inf with 0 so json.dumps never chokes."""
        return round(val, 3) if math.isfinite(val) else 0.0

    q = clean.quantile([0.25, 0.5, 0.75])
    return {
        "count": int(clean.count()),
        "mean":  _safe(float(clean.mean())),
        "std":   _safe(float(clean.std())),   # NaN 将被安全地转换为 0.0
        "min":   _safe(float(clean.min())),
        "p25":   _safe(float(q[0.25])),
        "p50":   _safe(float(q[0.50])),
        "p75":   _safe(float(q[0.75])),
        "max":   _safe(float(clean.max())),
    }


def _detect_anomalies(df: pd.DataFrame, col: str, sigma: float = ANOMALY_SIGMA) -> list[dict]:
    """Return rows where `col` deviates more than `sigma` standard deviations."""
    if col not in df.columns:
        return []
    series = pd.to_numeric(df[col], errors="coerce").dropna()
    if len(series) < 10:
        return []
    mean, std = series.mean(), series.std()
    if std == 0:
        return []
    mask = (series - mean).abs() > sigma * std
    anomaly_idx = series[mask].index
    rows = df.loc[anomaly_idx].head(MAX_ANOMALY_ROWS)
    return rows.to_dict(orient="records")


def _monthly_agg(df: pd.DataFrame, date_col: pd.Series, value_col: str) -> dict[str, float]:
    """Return mean-per-month dict for a numeric column keyed by 'YYYY-MM'."""
    if value_col not in df.columns:
        return {}
    tmp = pd.DataFrame({"date": date_col, "val": pd.to_numeric(df[value_col], errors="coerce")})
    tmp = tmp.dropna()
    if tmp.empty:
        return {}
    tmp["month"] = tmp["date"].dt.to_period("M").astype(str)
    monthly = tmp.groupby("month")["val"].mean().round(3)
    return monthly.to_dict()


def _annual_agg(df: pd.DataFrame, date_col: pd.Series, value_col: str) -> dict[str, float]:
    """Return mean-per-year dict for a numeric column."""
    if value_col not in df.columns:
        return {}
    tmp = pd.DataFrame({"date": date_col, "val": pd.to_numeric(df[value_col], errors="coerce")})
    tmp = tmp.dropna()
    if tmp.empty:
        return {}
    tmp["year"] = tmp["date"].dt.year.astype(str)
    annual = tmp.groupby("year")["val"].mean().round(3)
    return annual.to_dict()


def _time_range(date_col: pd.Series) -> dict[str, str]:
    clean = date_col.dropna()
    if clean.empty:
        return {}
    return {
        "first": str(clean.min().date()),
        "last":  str(clean.max().date()),
        "span_days": str((clean.max() - clean.min()).days),
    }


def _recent_rows(df: pd.DataFrame, date_col: pd.Series | None, n: int = RECENT_ROWS) -> list[dict]:
    """Return the N most-recent rows as clean dicts."""
    if date_col is not None:
        tmp = df.copy()
        tmp["__date__"] = date_col
        tmp = tmp.sort_values("__date__", ascending=False).drop(columns=["__date__"])
    else:
        tmp = df
    # Replace NaN/NaT with None for JSON serialisation
    return json.loads(tmp.head(n).to_json(orient="records", date_format="iso"))


def _llm_insight(label: str, stats: dict[str, Any]) -> str:
    """Compose a one-sentence LLM-ready insight from stats."""
    if not stats:
        return f"{label}: no data."
    return (
        f"{label}: avg {stats.get('mean','?')}, "
        f"range [{stats.get('min','?')}–{stats.get('max','?')}], "
        f"std {stats.get('std','?')} over {stats.get('count','?')} records."
    )


# ─── Category Aggregators ────────────────────────────────────────────────────

def aggregate_env_geo(df: pd.DataFrame, filename: str) -> dict[str, Any]:
    """
    Aggregate Environmental & Geospatial data.

    Typical columns: date, soil_ph, soil_moisture, temperature, humidity,
    rainfall_mm, solar_radiation, wind_speed, pressure, co2_ppm,
    gps_lat, gps_lng, elevation_m
    """
    date_col = _coerce_date_column(df)

    numeric_cols = {
        "soil_ph":        ("Soil pH",          True),   # (label, anomaly_detect)
        "soil_moisture":  ("Soil Moisture %",   True),
        "temperature":    ("Temperature °C",    True),
        "humidity":       ("Humidity %",        False),
        "rainfall_mm":    ("Rainfall mm",       True),
        "solar_radiation":("Solar Radiation",   False),
        "wind_speed":     ("Wind Speed km/h",   True),
        "pressure":       ("Pressure hPa",      False),
        "co2_ppm":        ("CO₂ ppm",           False),
    }
    # Also try alternate column names
    col_aliases = {
        "soil_ph":        ["ph", "soil_ph_value", "pH"],
        "soil_moisture":  ["moisture", "moisture_pct", "moisture_%"],
        "temperature":    ["temp", "temp_c", "air_temp", "avg_temp"],
        "humidity":       ["relative_humidity", "rh"],
        "rainfall_mm":    ["rainfall", "rain_mm", "precip_mm", "precipitation"],
        "solar_radiation":["solar", "radiation", "solar_w_m2"],
        "wind_speed":     ["wind", "wind_km_h"],
        "pressure":       ["atm_pressure", "barometric_pressure"],
        "co2_ppm":        ["co2", "co2_level"],
    }

    def _resolve(col: str) -> str | None:
        if col in df.columns:
            return col
        for alias in col_aliases.get(col, []):
            if alias in df.columns:
                return alias
            if alias.lower() in df.columns:
                return alias.lower()
        return None

    stats_block: dict[str, Any] = {}
    monthly_block: dict[str, Any] = {}
    anomalies: list[dict] = []
    insights: list[str] = []

    for canonical, (label, do_anomaly) in numeric_cols.items():
        resolved = _resolve(canonical)
        if resolved is None:
            continue
        s = _numeric_summary(pd.to_numeric(df[resolved], errors="coerce"))
        if s:
            stats_block[canonical] = s
            insights.append(_llm_insight(label, s))
        if date_col is not None and s:
            monthly = _monthly_agg(df, date_col, resolved)
            if len(monthly) >= SEASONAL_MIN_MONTHS:
                monthly_block[canonical] = monthly
        if do_anomaly:
            rows = _detect_anomalies(df, resolved)
            if rows:
                anomalies.extend(rows[:2])  # max 2 anomalies per column

    # GPS centroid
    lat_col = next((c for c in df.columns if "lat" in c), None)
    lng_col = next((c for c in df.columns if c in ["lng", "lon", "long", "longitude"]), None)
    gps = {}
    if lat_col and lng_col:
        gps = {
            "lat": round(float(pd.to_numeric(df[lat_col], errors="coerce").mean()), 6),
            "lng": round(float(pd.to_numeric(df[lng_col], errors="coerce").mean()), 6),
        }

    return {
        "category":          "env_geo",
        "source_file":       filename,
        "total_records":     len(df),
        "columns_detected":  list(df.columns),
        "time_range":        _time_range(date_col) if date_col is not None else {},
        "historical_summary": {
            "statistics":    stats_block,
            "monthly_trends":monthly_block,
            "annual_trends": {
                col: _annual_agg(df, date_col, _resolve(col) or col)
                for col in ["soil_ph", "soil_moisture", "temperature", "rainfall_mm"]
                if _resolve(col) and date_col is not None
            },
            "anomalies":     anomalies[:MAX_ANOMALY_ROWS],
            "gps_centroid":  gps,
            "key_insights":  insights,
        },
        "recent_data": _recent_rows(df, date_col),
    }


def aggregate_bio_crop(df: pd.DataFrame, filename: str) -> dict[str, Any]:
    """
    Aggregate Biological & Crop Health data.

    Typical columns: date, crop_variety, sowing_date, expected_harvest_date,
    plant_height_cm, canopy_diameter_cm, fruit_count, fruit_weight_kg,
    grade_a_pct, grade_b_pct, health_score, image_label, image_confidence
    """
    date_col = _coerce_date_column(df)

    # Crop variety — find unique values
    variety_col = next((c for c in df.columns if "variety" in c or "crop_type" in c or "strain" in c), None)
    varieties   = list(df[variety_col].dropna().unique())[:5] if variety_col else []

    # Key dates
    sow_col     = next((c for c in df.columns if "sow" in c or "planting" in c), None)
    harvest_col = next((c for c in df.columns if "harvest" in c), None)
    sow_date     = str(df[sow_col].dropna().iloc[0])     if sow_col     and not df[sow_col].dropna().empty     else None
    harvest_date = str(df[harvest_col].dropna().iloc[0]) if harvest_col and not df[harvest_col].dropna().empty else None

    # Growth metrics
    numeric_cols = {
        "plant_height_cm":    "Plant Height cm",
        "canopy_diameter_cm": "Canopy Diameter cm",
        "fruit_count":        "Fruit Count",
        "fruit_weight_kg":    "Fruit Weight kg",
        "grade_a_pct":        "Grade A %",
        "grade_b_pct":        "Grade B %",
        "health_score":       "Health Score",
    }
    alt_names = {
        "plant_height_cm":    ["height", "plant_height", "height_cm"],
        "canopy_diameter_cm": ["canopy", "canopy_cm", "crown_diameter"],
        "fruit_count":        ["fruits", "fruit_no", "number_of_fruits"],
        "fruit_weight_kg":    ["weight", "avg_weight", "fruit_kg"],
        "grade_a_pct":        ["grade_a", "a_grade", "grade_a_%"],
        "grade_b_pct":        ["grade_b", "b_grade", "grade_b_%"],
        "health_score":       ["health", "bio_health", "plant_score"],
    }

    def _resolve(col: str) -> str | None:
        if col in df.columns:
            return col
        for a in alt_names.get(col, []):
            if a in df.columns or a.lower() in df.columns:
                return a if a in df.columns else a.lower()
        return None

    stats_block: dict[str, Any] = {}
    monthly_block: dict[str, Any] = {}
    insights: list[str] = []

    for canonical, label in numeric_cols.items():
        resolved = _resolve(canonical)
        if resolved is None:
            continue
        s = _numeric_summary(pd.to_numeric(df[resolved], errors="coerce"))
        if s:
            stats_block[canonical] = s
            insights.append(_llm_insight(label, s))
        if date_col is not None and s:
            monthly = _monthly_agg(df, date_col, resolved)
            if len(monthly) >= SEASONAL_MIN_MONTHS:
                monthly_block[canonical] = monthly

    # CV image labels
    label_col = next((c for c in df.columns if "label" in c or "cv_label" in c or "image_label" in c), None)
    cv_labels: list[str] = []
    if label_col:
        cv_labels = list(df[label_col].dropna().unique())[:10]

    return {
        "category":          "bio_crop",
        "source_file":       filename,
        "total_records":     len(df),
        "columns_detected":  list(df.columns),
        "time_range":        _time_range(date_col) if date_col is not None else {},
        "historical_summary": {
            "crop_varieties":   varieties,
            "sowing_date":      sow_date,
            "expected_harvest": harvest_date,
            "statistics":       stats_block,
            "monthly_trends":   monthly_block,
            "cv_image_labels":  cv_labels,
            "key_insights":     insights,
        },
        "recent_data": _recent_rows(df, date_col),
    }


def aggregate_operations(df: pd.DataFrame, filename: str) -> dict[str, Any]:
    """
    Aggregate Farming Operations data.

    Typical columns: date, input_type, input_amount, input_unit,
    irrigation_volume_l, event_type, event_description, labor_hours, cost_rm
    """
    date_col = _coerce_date_column(df)

    def _col(*candidates: str) -> str | None:
        for c in candidates:
            if c in df.columns:
                return c
        return None

    type_col   = _col("input_type", "type", "category", "operation_type")
    amount_col = _col("input_amount", "amount", "quantity")
    unit_col   = _col("input_unit", "unit", "uom")
    irrig_col  = _col("irrigation_volume_l", "irrigation_volume", "water_volume_l")
    event_col  = _col("event_type", "event", "event_category")
    labor_col  = _col("labor_hours", "hours", "labour_hours")
    cost_col   = _col("cost_rm", "cost", "amount_rm", "total_cost")

    # Input type breakdown
    input_breakdown: dict[str, int] = {}
    if type_col:
        vc = df[type_col].dropna().str.lower().value_counts()
        input_breakdown = vc.head(10).to_dict()

    # Fertilizer analysis
    fert_mask = df[type_col].str.lower().str.contains("fert|npk|urea|compost", na=False) if type_col else pd.Series(False, index=df.index)
    pest_mask = df[type_col].str.lower().str.contains("pesticide|herbicide|fungicide|spray", na=False) if type_col else pd.Series(False, index=df.index)

    fert_stats = _numeric_summary(pd.to_numeric(df.loc[fert_mask, amount_col], errors="coerce")) if amount_col else {}
    irrig_stats = _numeric_summary(pd.to_numeric(df[irrig_col], errors="coerce")) if irrig_col else {}
    labor_stats = _numeric_summary(pd.to_numeric(df[labor_col], errors="coerce")) if labor_col else {}
    cost_stats  = _numeric_summary(pd.to_numeric(df[cost_col], errors="coerce")) if cost_col else {}

    # Recent key events
    event_types: list[str] = []
    if event_col:
        event_types = list(df[event_col].dropna().unique())[:MAX_TOP_EVENTS]

    # Days since last fertilizer / irrigation
    days_since_fert  = _days_since_last(df, date_col, fert_mask)
    days_since_irrig = _days_since_last(df, date_col, df[irrig_col].notna() if irrig_col else pd.Series(False, index=df.index))

    insights = []
    if fert_stats:   insights.append(_llm_insight("Fertilizer applications", fert_stats))
    if irrig_stats:  insights.append(_llm_insight("Irrigation volume (L)", irrig_stats))
    if labor_stats:  insights.append(_llm_insight("Labor hours", labor_stats))
    if cost_stats:   insights.append(_llm_insight("Operation costs (RM)", cost_stats))

    return {
        "category":          "operations",
        "source_file":       filename,
        "total_records":     len(df),
        "columns_detected":  list(df.columns),
        "time_range":        _time_range(date_col) if date_col is not None else {},
        "historical_summary": {
            "input_type_breakdown":   input_breakdown,
            "fertilizer_events":      int(fert_mask.sum()),
            "pesticide_events":       int(pest_mask.sum()),
            "fertilizer_stats":       fert_stats,
            "irrigation_stats":       irrig_stats,
            "labor_stats":            labor_stats,
            "cost_stats":             cost_stats,
            "special_event_types":    event_types,
            "days_since_fertilizer":  days_since_fert,
            "days_since_irrigation":  days_since_irrig,
            "key_insights":           insights,
        },
        "recent_data": _recent_rows(df, date_col),
    }


def aggregate_financial(df: pd.DataFrame, filename: str) -> dict[str, Any]:
    """
    Aggregate Financial & Commercial data.

    Typical columns: date, price_per_kg, volume_kg, revenue_rm, cost_rm,
    profit_rm, channel, grade, customer, payment_status, payment_delay_days
    """
    date_col = _coerce_date_column(df)

    def _col(*candidates: str) -> str | None:
        for c in candidates:
            if c in df.columns:
                return c
        return None

    price_col   = _col("price_per_kg", "price", "unit_price", "price_rm_kg")
    volume_col  = _col("volume_kg", "volume", "quantity_kg", "weight_kg")
    revenue_col = _col("revenue_rm", "revenue", "total_revenue", "sales_rm")
    cost_col    = _col("cost_rm", "cost", "total_cost", "expenses_rm")
    profit_col  = _col("profit_rm", "profit", "net_profit", "margin_rm")
    channel_col = _col("channel", "sales_channel", "market_channel", "buyer_type")
    grade_col   = _col("grade", "fruit_grade", "quality_grade")
    delay_col   = _col("payment_delay_days", "payment_delay", "days_outstanding")

    price_stats   = _numeric_summary(pd.to_numeric(df[price_col],   errors="coerce")) if price_col   else {}
    volume_stats  = _numeric_summary(pd.to_numeric(df[volume_col],  errors="coerce")) if volume_col  else {}
    revenue_stats = _numeric_summary(pd.to_numeric(df[revenue_col], errors="coerce")) if revenue_col else {}
    cost_stats    = _numeric_summary(pd.to_numeric(df[cost_col],    errors="coerce")) if cost_col    else {}
    profit_stats  = _numeric_summary(pd.to_numeric(df[profit_col],  errors="coerce")) if profit_col  else {}
    delay_stats   = _numeric_summary(pd.to_numeric(df[delay_col],   errors="coerce")) if delay_col   else {}

    # Monthly revenue / profit trends
    monthly_revenue = _monthly_agg(df, date_col, revenue_col) if date_col is not None and revenue_col else {}
    annual_revenue  = _annual_agg(df, date_col, revenue_col)  if date_col is not None and revenue_col else {}
    monthly_profit  = _monthly_agg(df, date_col, profit_col)  if date_col is not None and profit_col  else {}

    # Channel breakdown
    channel_breakdown: dict[str, int] = {}
    if channel_col:
        vc = df[channel_col].dropna().value_counts()
        channel_breakdown = vc.head(8).to_dict()

    # Grade breakdown
    grade_breakdown: dict[str, int] = {}
    if grade_col:
        vc = df[grade_col].dropna().value_counts()
        grade_breakdown = vc.head(5).to_dict()

    # Price volatility
    price_volatility_pct = 0.0
    if price_stats.get("mean") and price_stats.get("std"):
        mean = price_stats["mean"]
        std  = price_stats["std"]
        price_volatility_pct = round((std / mean) * 100, 1) if mean > 0 else 0.0

    # Anomaly rows (unusually high/low prices)
    price_anomalies = _detect_anomalies(df, price_col or "") if price_col else []

    insights = []
    if price_stats:   insights.append(_llm_insight("Price per kg (RM)", price_stats))
    if volume_stats:  insights.append(_llm_insight("Volume (kg)", volume_stats))
    if revenue_stats: insights.append(_llm_insight("Revenue (RM)", revenue_stats))
    if profit_stats:  insights.append(_llm_insight("Profit (RM)", profit_stats))
    if delay_stats:   insights.append(_llm_insight("Payment delay (days)", delay_stats))
    if price_volatility_pct > 20:
        insights.append(f"⚠ High price volatility: {price_volatility_pct}% coefficient of variation — market instability detected.")

    # Estimated annual revenue from historical data
    annual_est: float | None = None
    if annual_revenue:
        annual_est = round(float(np.mean(list(annual_revenue.values()))), 2)

    return {
        "category":          "financial",
        "source_file":       filename,
        "total_records":     len(df),
        "columns_detected":  list(df.columns),
        "time_range":        _time_range(date_col) if date_col is not None else {},
        "historical_summary": {
            "price_stats":          price_stats,
            "volume_stats":         volume_stats,
            "revenue_stats":        revenue_stats,
            "cost_stats":           cost_stats,
            "profit_stats":         profit_stats,
            "payment_delay_stats":  delay_stats,
            "price_volatility_pct": price_volatility_pct,
            "monthly_revenue":      monthly_revenue,
            "annual_revenue":       annual_revenue,
            "monthly_profit":       monthly_profit,
            "channel_breakdown":    channel_breakdown,
            "grade_breakdown":      grade_breakdown,
            "price_anomalies":      price_anomalies[:MAX_ANOMALY_ROWS],
            "estimated_annual_revenue_rm": annual_est,
            "key_insights":         insights,
        },
        "recent_data": _recent_rows(df, date_col),
    }


# ─── Shared Helper ────────────────────────────────────────────────────────────

def _days_since_last(df: pd.DataFrame, date_col: pd.Series | None, mask: pd.Series) -> int | None:
    """Return days between the last matching row's date and the latest date in the dataset."""
    if date_col is None:
        return None
    try:
        matching_dates = date_col[mask].dropna()
        if matching_dates.empty:
            return None
        last = matching_dates.max()
        dataset_end = date_col.dropna().max()
        return max(0, (dataset_end - last).days)
    except Exception:
        return None


# ─── High-Level Entrypoint for route.ts ──────────────────────────────────────

def aggregate_all_categories(
    env_geo_csv:    bytes | None,
    bio_crop_csv:   bytes | None,
    operations_csv: bytes | None,
    financial_csv:  bytes | None,
    filenames:      dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Convenience wrapper: aggregate all four categories in one call.
    Returns a single dict ready to be JSON-serialised and embedded into
    the LLM system/user prompt.

    Usage from a Python route handler:

        summary = aggregate_all_categories(
            env_geo_csv    = await env_file.read(),
            bio_crop_csv   = await bio_file.read(),
            operations_csv = await ops_file.read(),
            financial_csv  = await fin_file.read(),
        )
        prompt_data = json.dumps(summary, ensure_ascii=False)
    """
    fnames = filenames or {}
    result: dict[str, Any] = {}

    pairs = [
        ("env_geo",    env_geo_csv,    aggregate_env_geo,    fnames.get("env_geo",    "env_geo.csv")),
        ("bio_crop",   bio_crop_csv,   aggregate_bio_crop,   fnames.get("bio_crop",   "bio_crop.csv")),
        ("operations", operations_csv, aggregate_operations, fnames.get("operations", "operations.csv")),
        ("financial",  financial_csv,  aggregate_financial,  fnames.get("financial",  "financial.csv")),
    ]
    for key, data, fn, fname in pairs:
        if data:
            try:
                df = _load_to_dataframe(data, fname)
                result[key] = fn(df, fname)
            except Exception as exc:
                result[key] = {"error": str(exc), "fallback": True, "category": key}
        else:
            result[key] = None

    return result


# ─── CLI for local development / testing ─────────────────────────────────────

def _cli() -> None:
    parser = argparse.ArgumentParser(description="BioFin Oracle CSV Aggregator")
    parser.add_argument("--input",    required=True, help="Path to CSV or JSON file")
    parser.add_argument("--category", required=True,
                        choices=["env_geo", "bio_crop", "operations", "financial"],
                        help="Data category")
    parser.add_argument("--pretty",   action="store_true", help="Pretty-print JSON output")
    args = parser.parse_args()

    with open(args.input, "rb") as f:
        contents = f.read()

    df = _load_to_dataframe(contents, args.input)

    fn_map = {
        "env_geo":    aggregate_env_geo,
        "bio_crop":   aggregate_bio_crop,
        "operations": aggregate_operations,
        "financial":  aggregate_financial,
    }
    result = fn_map[args.category](df, args.input)
    indent = 2 if args.pretty else None
    print(json.dumps(result, ensure_ascii=False, indent=indent, default=str))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] not in ("serve", "--serve"):
        _cli()
    else:
        # ✅ FIX #3: Bind to 127.0.0.1 (localhost only), NOT 0.0.0.0.
        # The Next.js server is on the same machine; no external host should
        # ever be able to reach this sidecar directly.  On a shared network
        # (e.g. a hackathon venue) binding to 0.0.0.0 exposes the service to
        # every device on the LAN with no authentication.
        uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")