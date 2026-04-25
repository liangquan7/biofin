**The Z.AI Decision Brain for Malaysian Agri-Fintech.** Moving SME orchard owners from weather-dependent gambles to data-driven operational management.

Built for **UM Hackathon 2026** — Domain 2: AI for Economic Empowerment & Decision Intelligence.

## The Idea
Malaysian high-value agriculture is paralyzed by the "Triple Volatility" crisis: biological waste, extreme meteorological shifts, and market information asymmetry. Existing tools provide passive dashboards that require manual interpretation—a fatal flaw when reacting to sudden environmental shifts.

**BioFin Oracle** operates as an active intelligence engine. It ingests unstructured market news and structured farm telemetry to generate explainable, quantifiable action plans. It outputs direct operational directives (e.g., altering harvest dates) rather than just visualizing data.

## How It Works
* **Data Ingestion** — Users upload up to four static CSV/JSON datasets (Plant Growth, Environmental Variables, Weather Records, Sales History).
* **Pre-Aggregation** — The Next.js backend mathematically compresses the raw arrays into statistical summaries and trend signals to prevent LLM context window collapse.
* **AI Reasoning** — The aggregated payload is transmitted to the Z.AI GLM API (`ilmu-glm-5.1`), forcing a deterministic JSON response conforming to a strict TypeScript interface.
* **Execution Ledger** — The React frontend renders the "Agentic Decision Ledger," displaying the explicit operational command alongside the AI's causal reasoning chain.
* **Simulation** — Users manipulate frontend sliders (e.g., fertilizer load, labor hours) to instantly recalculate projected profit margins via client-side logic.

## Screens

| Screen | What it does |
| :--- | :--- |
| **Command Center** | Displays the Agentic Decision Ledger, immediate biological/soil health metrics, and a 7-day micro-climate forecast. |
| **Simulation Sandbox** | Digital Twin interface. Sliders for input variables (Nitrogen, Labor) dynamically updating expected net profit graphs. |
| **Global Operations** | Triggers manual stress tests (e.g., logistics disruption) and displays automated hedging strategies. |
| **SME Compliance** | Audits uploaded data against LHDN e-invoicing Phase 3 rules and calculates system ROI. |

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| UI Framework | Next.js (React), Tailwind CSS |
| Visualization | Chart.js |
| API Routing | Next.js App Router (`app/api/analyze/route.ts`) |
| AI Engine | Z.AI GLM API (`ilmu-glm-5.1`) |
| Web Search | Tavily Search API |

## AI Integration

**Z.AI GLM API (Synchronous Inference):**
* Context-aware reasoning of agricultural telemetry.
* Generation of strict JSON decision matrices.
* Translation of raw numbers into human-readable causal logic.

**Heuristic Evaluation Engine (Local System Fallback):**
* Hardcoded risk flags (e.g., max wind > 24km/h) that trigger a default functional dataset if the LLM times out or hallucinates an invalid schema.

## Prerequisites
* Node.js (v18+)
* Z.AI GLM API Key
* Tavily API Key

## Setup

```bash
# Clone the repo
git clone https://github.com/liangquan7/biofin.git
cd biofin/biofin_nextjs

# Install dependencies
npm install
npm install lucide-react chart.js react-chartjs-2


# Add Environment variables (not checked in)
# Create a .env.local file in the root (biofin/biofin_nextjs/) and copy the following lines into it:
ZAI_BASE_URL=YOUR-BASE-URL
ZAI_API_KEY=YOUR-API-KEY
ZAI_MODEL=MODEL-NAME
TAVILY_API_KEY=YOUR-API-KEY
```

## Running

```bash
# Run the development server
npm run dev
# Then open website at http://localhost:3000/
```

## Project Structure

```plaintext
biofin_nextjs/
  app/
    api/analyze/route.ts     # Core backend pipeline: file parsing, aggregation, LLM routing
    page.tsx                 # Main dashboard UI entry point
    layout.tsx               # Global application layout
    globals.css              # Tailwind and global styles
  public/                    # Static assets (SVGs)
  package.json               # Dependencies and scripts
  next.config.ts             # Next.js configuration
```

## System Constraints
The system architecture dictates strict operational boundaries:
* **Ephemeral State:** There is no database. All data is processed in-memory and destroyed post-request.
* **Timeout Risk:** Vercel serverless functions cap execution time. Prolonged LLM inference chains will trigger a 504 error, routing the system to the Heuristic Fallback.
* **Input Fragility:** The parsing engine relies entirely on the structural integrity of the uploaded CSV files.

## What's Real vs Mocked

**Real (AI-powered & Engineered)**
* Next.js backend CSV parsing and arithmetic aggregation.
* Z.AI GLM zero-shot inference generating structural JSON.
* Client-side digital twin recalculations via Chart.js.
* Real-time fallback interception for failed LLM calls.

**Mocked (For Hackathon Scope)**
* **No IoT Integration:** Sensor data is manually uploaded via CSV, not polled from live hardware.
* **No Distributed Backend:** The system is a synchronous monolith. It does not utilize Django or Celery task queues.
* **No Persistence:** Historical trend analysis across multiple sessions is impossible due to the lack of PostgreSQL or any persistent database storage.

## Team
* **Tan Liang Chuan:** Lead AI Orchestrator
* **Thet Htun Oakar & Ng Yi Ren:** Backend Lead
* **Tan Li Hong & Chen Bing Yan:** Frontend Lead

