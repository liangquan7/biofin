**The Z.AI Decision Brain for Malaysian Agri-Fintech.** Moving SME orchard owners from weather-dependent gambles to data-driven operational management.

Built for **UM Hackathon 2026 — Domain 2: AI for Economic Empowerment & Decision Intelligence.**

## 💡 The Idea
Malaysian high-value agriculture is paralyzed by the "Triple Volatility" crisis: biological waste, extreme meteorological shifts, and market information asymmetry. Existing tools provide passive dashboards that require manual interpretation—a fatal flaw when reacting to sudden environmental shifts.

BioFin Oracle operates as an **active intelligence engine**. It ingests unstructured market news and structured farm telemetry to generate explainable, quantifiable action plans. It outputs direct operational directives (e.g., altering harvest dates) rather than just visualizing data.

## ⚙️ How It Works
* **Data Ingestion** — Users upload up to four static CSV/JSON datasets (Plant Growth, Environmental Variables, Weather Records, Sales History).
* **Pre-Aggregation** — The Next.js backend mathematically compresses the raw arrays into statistical summaries and trend signals to prevent LLM context window collapse.
* **AI Reasoning** — The aggregated payload is transmitted to the Z.AI GLM API (`ilmu-glm-5.1`), forcing a deterministic JSON response conforming to a strict TypeScript interface.
* **SSE Streaming (Timeout Mitigation)** — To bypass serverless execution limits, the backend streams the reasoning process and final JSON back to the client via Server-Sent Events (SSE) using keep-alive mechanisms.
* **Execution Ledger** — The React frontend renders the "Agentic Decision Ledger," displaying the explicit operational command alongside the AI's causal reasoning chain.
* **Simulation** — Users manipulate frontend sliders (e.g., fertilizer load, labor hours) to instantly recalculate projected profit margins via client-side logic.

## 🖥️ Screens

| Screen | What it does |
| :--- | :--- |
| **Command Center** | Displays the Agentic Decision Ledger, immediate biological/soil health metrics, and a 7-day micro-climate forecast. |
| **Simulation Sandbox** | Digital Twin interface. Sliders for input variables (Nitrogen, Labor) dynamically updating expected net profit graphs. |
| **Global Operations** | Triggers manual stress tests (e.g., logistics disruption) and displays automated hedging strategies. |
| **SME Compliance** | Audits uploaded data against LHDN e-invoicing Phase 3 rules and calculates system ROI. |

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **UI Framework** | Next.js (React), Tailwind CSS |
| **Visualization** | Chart.js, react-chartjs-2 |
| **API Routing** | Next.js App Router (Serverless with SSE Streaming) |
| **AI Engine** | Z.AI GLM API (`ilmu-glm-5.1`) |
| **Web Search** | Tavily Search API |

## 🧠 AI Integration

**Z.AI GLM API (Synchronous Inference):**
* Context-aware reasoning of agricultural telemetry.
* Generation of strict JSON decision matrices.
* Translation of raw numbers into human-readable causal logic.

**Heuristic Evaluation Engine (Graceful Fallback):**
* Hardcoded risk flags (e.g., max wind > 24km/h) that trigger a default deterministic dataset if the LLM times out, API fails, or hallucinates an invalid schema. Ensures 100% UI uptime.

## 🚀 Setup & Running

**Prerequisites:**
* Node.js (v18+)
* Z.AI GLM API Key
* Tavily API Key

```bash
# 1. Clone the repo
git clone [https://github.com/liangquan7/biofin.git](https://github.com/liangquan7/biofin.git)
cd biofin/biofin_nextjs

# 2. Install dependencies
npm install
npm install lucide-react chart.js react-chartjs-2

# 3. Configure Environment Variables
# Create a .env.local file in the root and add your keys:
ZAI_BASE_URL=[https://api.ilmu.ai/v1/chat/completions](https://api.ilmu.ai/v1/chat/completions)
ZAI_API_KEY=YOUR-API-KEY
ZAI_MODEL=ilmu-glm-5.1
TAVILY_API_KEY=YOUR-TAVILY-KEY

# 4. Run the development server
npm run dev
# The dashboard will be live at http://localhost:3000/
📂 Project Structure (Core)
Plaintext
biofin_nextjs/
 ├── app/
 │   ├── api/route.ts        # Backend pipeline: SSE streaming, aggregation, LLM routing
 │   ├── page.tsx            # Main dashboard UI entry point & state management
 │   └── globals.css         # Tailwind and global styles
 ├── types/
 │   └── biofin.ts           # Single source of truth for TypeScript interfaces (AnalysisResult)
 └── package.json            # Dependencies and scripts
🚧 System Constraints
The system architecture dictates strict operational boundaries:

Ephemeral State: There is no database. All data is processed in-memory and destroyed post-request.

Timeout Risk: Vercel serverless functions cap execution time. While mitigated by SSE streaming, extreme prolonged LLM inference chains will route the system to the Heuristic Fallback.

Input Fragility: The parsing engine relies on the structural integrity of the uploaded CSV files.

🔍 What's Real vs Mocked
Real (AI-powered & Engineered)

Next.js backend CSV parsing and arithmetic pre-aggregation.

Z.AI GLM zero-shot inference generating strict structural JSON.

Server-Sent Events (SSE) pipeline for real-time frontend hydration.

Client-side digital twin recalculations via Chart.js.

Real-time fallback interception for failed LLM/API calls.

Mocked (For Hackathon Scope)

No IoT Integration: Sensor data is manually uploaded via CSV, not polled from live hardware.

OCR/CV Module: File parser router is built, but actual image-to-text extraction is a mocked placeholder.

No Persistence: Historical trend analysis across multiple sessions is not implemented due to the lack of a database (e.g., PostgreSQL).

👥 Team Dinosaur
Tan Liang Chuan: Lead AI Orchestrator

Thet Htun Oakar & Ng Yi Ren: Backend Leads

Tan Li Hong & Chen Bing Yan: Frontend Leads
