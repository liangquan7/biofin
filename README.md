# BioFin Oracle Prototype - Product Requirements Document 

**Document Version:** 0.1.0 (Prototype Baseline)
**Project Status:** Active Hackathon Development (UM Hackathon 2026)
**Architecture:** Next.js Monolith (Serverless API Route Backend)
**Primary Technology:** Next.js (TypeScript), React, Chart.js

---

## 1. Project Overview
The BioFin Oracle is a web-based prototype designed to visualize agricultural, environmental, and financial data for SME orchard owners. 

Unlike the initial theoretical design, this system operates entirely within a Next.js environment. The backend logic is isolated to a single serverless function (`app/api/analyze/route.ts`). The core processing engine currently relies on static arithmetic aggregation and hardcoded heuristic triggers to generate recommendations, with a placeholder infrastructure for future Large Language Model (GLM) integration.

## 2. System Architecture

The system abandons distributed processing (Django/Celery) in favor of a synchronous Next.js pipeline.

* **Frontend (`page.tsx`):** A client-side React dashboard that captures user-uploaded CSV/JSON files, sends them via `FormData` to the internal API, and renders the returned JSON payload into static charts and interactive sliders.
* **Backend (`route.ts`):** A Next.js App Router POST endpoint. It acts as the data ingestion, parsing, aggregation, and decision-routing layer.
* **Data Storage:** None. The system is entirely ephemeral. Data is processed in-memory during the HTTP request and discarded.

## 3. Core Functionalities & Processing Pipeline

The backend must execute the following sequential pipeline within `route.ts`.

### 3.1 Data Ingestion & Parsing
* **Input:** Receives `multipart/form-data` containing up to four optional files: `plantGrowth`, `envVars`, `weatherRecords`, and `salesHistory`.
* **Parsing:** Executes `parseCSV` or `tryParseJSON` to convert raw text into arrays of typed interfaces (`PlantRecord`, `EnvRecord`, `WeatherRecord`, `SalesRecord`).

### 3.2 Aggregation Engine
The backend performs arithmetic synthesis on the parsed arrays.
* **Plant Metrics:** Calculates average `fertilizer_kg_ha`, `irrigation_mm`, `soil_ph`, and NPK ppm. Computes a static `bioFertReduction` percentage based on deviation from a hardcoded 400kg/ha baseline.
* **Environmental Metrics:** Averages temperature, humidity, solar radiation, and wind speed.
* **Weather Metrics:** Calculates max wind speed, average rainfall, and counts `storm_warning` boolean flags.
* **Sales Metrics:** Averages `volume_kg` and `price_per_kg`.

### 3.3 Heuristic Evaluation (The Fallback Logic)
Before any LLM integration is executed, the backend evaluates the aggregated data against hardcoded logical thresholds.
* **Weather Risk:** * If storm warnings > 2 or rainfall > 50mm → Assign `rain` risk.
  * If max temp > 35°C and rainfall < 5mm → Assign `drought` risk.
  * If max wind > 24km/h → Assign `wind` risk.
* **Market Risk:** * If `avgVolume` > 1000kg → Trigger `isOversupplied` boolean.
  * If `avgPrice` < RM 40 → Trigger `isPriceDropping` boolean.
* **Fallback Execution:** If the GLM API is unavailable or bypassed, the system executes `buildDefaultResult`, passing these heuristic flags to return pre-written strings (e.g., "System operating normally. GLM API unavailable; returning heuristic fallback.").

### 3.4 API Integration Layer (GLM & Tavily)
The architecture includes configuration variables (`GLM_BASE_URL`, `GLM_API_KEY`, `GLM_MODEL`) intended to connect to `api.ilmu.ai/v1`. 
* **Requirement for Implementation:** The static heuristic functions must be replaced or augmented by a `fetch` call that passes the aggregated JSON data to the GLM model. 
* **Constraint:** The GLM model must be prompted to return a JSON object matching the `AnalysisResult` TypeScript interface to ensure the Next.js frontend hydrates without error.

## 4. Implementation Roadmap (Backend Step-by-Step)

To transform this from a static calculator to the required Hackathon prototype, the `route.ts` file must be built out in the following order:

1. **Verify Parser Integrity:** Ensure the `readFile` function robustly handles edge cases (e.g., null values, missing columns) in the uploaded CSVs.
2. **Finalize Aggregation Logic:** Ensure `summarisePlant` and related functions correctly clamp and map the unstructured CSV inputs to the strict data types required by the `AnalysisResult` schema.
3. **Construct the LLM Prompt:** Write a prompt template inside `route.ts` that dynamically injects the aggregated data variables.
4. **Execute the Fetch Call:** Implement the asynchronous POST request to the GLM endpoint. Set strict timeouts.
5. **Implement JSON Validation:** Write a parsing function to catch and sanitize the LLM response. If the LLM hallucinates markdown or invalid JSON, catch the error and route immediately to the `buildDefaultResult` heuristic fallback.

## 5. Scope & Limitations
* **Synchronous Bottleneck:** Because Next.js serverless functions have execution timeouts (typically 10-60 seconds depending on the host), the GLM API call must resolve quickly. Lengthy reasoning chains will cause the Vercel deployment to 504 Timeout.
* **No Historical Context:** Without a database, the system cannot perform true trend analysis over multiple sessions. All insights are generated solely from the instantaneous file payload.
