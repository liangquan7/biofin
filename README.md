BioFin Oracle
The Z.AI Decision Brain for Malaysian Agri-Fintech

BioFin Oracle is an AI-powered decision intelligence system for Malaysian agri-SME orchard owners. It helps farmers move from weather-dependent intuition to data-driven operational management.

Built for UMHackathon 2026 — Domain 2: AI for Economic Empowerment & Decision Intelligence.

The Idea

Malaysian high-value agriculture faces a Triple Volatility Crisis:

Biological risk — crop health, soil condition, pest pressure, and quality-grade uncertainty.
Meteorological risk — rainfall instability, storm exposure, heat stress, and climate-driven yield disruption.
Market risk — price volatility, oversupply pressure, export uncertainty, and revenue instability.

Most agri-tech tools stop at passive dashboards. They show data, but farmers still need to interpret it manually.

BioFin Oracle goes further.
It converts farm records, operational data, weather signals, and market intelligence into direct, explainable action recommendations. Instead of only showing charts, it tells the SME owner what action to take, why it matters, and how it affects risk, profit, and cash runway.

How It Works
1. Data Ingestion

Users upload all four required data categories:

Environmental & Geospatial Data
Biological & Crop Data
Farming Operations Data
Financial & Commercial Data

Supported formats include CSV and JSON. Image uploads are supported for selected categories through a preliminary OCR/CV placeholder path, but production-grade OCR/CV extraction is outside the preliminary MVP scope.

2. Pre-Aggregation

The Next.js backend parses uploaded files and compresses raw data into structured summaries, statistical indicators, and trend signals. This reduces LLM context overload and keeps the AI reasoning pipeline more stable.

3. AI Reasoning

The aggregated payload is sent to a configured GLM-compatible AI reasoning model through environment variables. The backend instructs the model to return a strict AnalysisResult JSON object that matches the frontend contract.

4. Validation & Fallback

Before the result reaches the dashboard, the backend applies:

Markdown/JSON cleanup
Brace-based JSON extraction
Schema repair through sanitiseResult
Numeric range clamping
Safe fallback result generation if AI output fails

This prevents malformed AI output from crashing the frontend.

5. Execution Ledger

The frontend renders an Agentic Decision Ledger, showing:

The recommended action
The reasoning chain
Risk level
financial and operational indicators
market and weather context
6. Simulation Sandbox

Users can adjust operational sliders such as irrigation, labour, fertilizer, and selling channel assumptions. The dashboard recalculates projected profit, cash runway, and risk impact through client-side simulation logic.

Screens
Screen	What it does
Command Center	Displays the main AI recommendation, risk index, cash runway, processed record count, and Agentic Decision Ledger.
Simulation Sandbox	Allows users to adjust operational and commercial assumptions to simulate projected profit and risk changes.
Global Operations	Shows weather and market intelligence, operational risks, and export-related signals.
SME Compliance & ROI	Provides compliance-readiness indicators and ROI-related insights for SME decision support.
Tech Stack
Layer	Technology
UI Framework	Next.js, React, Tailwind CSS
API Routing	Next.js App Router — app/api/analyze/route.ts
AI Engine	Configured GLM-compatible reasoning model through environment variables
Market Intelligence	Tavily Search API
Data Processing	Server-side CSV/JSON parsing, aggregation, and schema validation
Frontend Simulation	Client-side calculation and dashboard rendering
AI Integration
GLM-Compatible AI Reasoning

BioFin Oracle uses a configured AI reasoning endpoint to process summarised farm, operational, weather, and market data. The model is instructed to produce a strict structured JSON response instead of free-form text.

The AI layer supports:

Context-aware reasoning over agricultural data
Generation of structured decision recommendations
Explanation of causal links between data signals and recommended actions
Schema-constrained output for frontend stability
Local Fallback & Heuristic Evaluation

If the AI call fails, times out, or returns invalid output, the system falls back to deterministic logic. This ensures the dashboard can still render safe baseline values instead of crashing.

Fallback protection includes:

Default AnalysisResult generation
Financial oversupply-risk analysis
Required-field repair
Safe numeric defaults
SSE error and complete events
Prerequisites
Node.js v18 or above
Z.AI / GLM-compatible API key
Tavily API key
Git
npm
Setup
# Clone the repository
git clone https://github.com/liangquan7/biofin.git

# Move into the frontend project
cd biofin/frontend

# Install dependencies
npm install

Create a .env.local file inside the frontend directory:

ZAI_API_KEY=your_zai_or_glm_api_key_here
ZAI_BASE_URL=your_model_base_url_here
ZAI_MODEL=your_configured_model_name_here
TAVILY_API_KEY=your_tavily_api_key_here

Do not commit .env.local to GitHub.

Running the Project
npm run dev

Then open:

http://localhost:3000
Production Build
npm run build

The current release branch has been verified with a successful local build and no build-breaking TypeScript errors.

Project Structure
frontend/
  app/
    api/
      analyze/
        route.ts       # Core backend pipeline: parsing, aggregation, AI routing, SSE streaming
    page.tsx           # Main upload and dashboard UI
    layout.tsx         # Global app layout
    globals.css        # Tailwind and global styles

  public/              # Static assets
  package.json         # Dependencies and scripts
  next.config.ts       # Next.js configuration
System Constraints
Ephemeral State

BioFin Oracle does not use a persistent database in the preliminary MVP. Uploaded data is processed during the request and is not stored permanently.

Serverless Timeout Risk

The system runs as a serverless Next.js application. To reduce timeout risk, the backend summarises uploaded data before AI reasoning and emits SSE progress events while analysis is running. If the AI path fails before a hard platform timeout, fallback logic returns a safe baseline result.

Input Constraints

Uploaded files must be structurally parseable CSV or JSON. The system includes file-size limits, parsing checks, schema repair, and fallback handling to reduce failure risk from malformed input.

OCR/CV Limitation

Image uploads are routed through a preliminary placeholder path. Real production-grade OCR/CV extraction is not claimed in the preliminary MVP.

What Is Real vs Mocked
Real / Implemented
Next.js frontend dashboard
CSV/JSON upload workflow
Server-side file parsing and summarisation
SSE progress streaming
AI reasoning pipeline
Tavily market intelligence integration
AnalysisResult schema validation and repair
5 MB per-file upload limit
Oversized-file rejection
Dashboard rendering across main tabs
Fallback handling for AI-service failure
Client-side simulation logic
Mocked / Limited for Hackathon Scope
No live IoT sensor integration
No persistent database
No production-grade OCR/CV extraction
No real payment processing
No official LHDN MyInvois validation
No distributed worker queue such as Celery
No long-term historical trend storage across sessions
Team
Member	Role
Tan Liang Chuan	Lead AI Orchestrator / Technical Lead
Thet Htun Oakar	Backend Lead
Ng Yi Ren	Backend Lead
Tan Li Hong	Frontend Lead
Chen Bing Yan	QA Lead / Frontend
Summary

BioFin Oracle transforms fragmented agricultural, operational, and financial data into practical decision intelligence for Malaysian agri-SMEs. It helps orchard owners understand risk, protect profit, and make faster management decisions under biological, weather, and market uncertainty.
