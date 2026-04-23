# BioFin Oracle (Z.AI Decision Brain) - Product Requirements Document

**Document Version:** 1.0.0 (Release Candidate)
**Project Status:** Development Phase (UM Hackathon 2026 Submission)
**Target Audience:** Malaysian SME Orchard Owners (High-Value Agri-Sector)
**Primary Technology:** Next.js, Django, X.AI API, PostgreSQL, Redis

---

## 1. Project Overview
The BioFin Oracle is a **Smart Agri-Fintech Decision Brain** designed to solve the "Triple Volatility" crisis faced by Malaysian SME farmers in the high-value agriculture sector (e.g., Musang King durian). The system transitions orchard owners from traditional, "experience-based" farming to data-driven executive management.

By ingesting multi-dimensional data—ranging from structured soil NPK sensor readings to unstructured international trade news and weather APIs—the X.AI-powered GLM (Reasoning Engine) processes variables to generate deterministic, quantifiable action commands. It prevents capital waste and hedges against meteorological and market shocks.

## 2. Background & Objectives

### 2.1 Business Context (The Triple Volatility Crisis)
* **Biological Volatility:** Preventive over-fertilization wastes 15-20% of annual budgets. Missing nutrient windows causes up to 40% yield collapse.
* **Meteorological Volatility:** The 2026 climate shift features rapid transitions between extreme rain and drought. Delayed harvesting before squall lines results in catastrophic capital loss.
* **Market Volatility:** Competitor dumping (e.g., from Thailand) crashes prices. SMEs face decision paralysis on market timing.

### 2.2 Objectives
* Deliver explicit, explainable "Trade-off Decisions" rather than raw data dashboards.
* Reduce operational fertilizer/pesticide waste by 20%.
* Increase gross revenue margins by 15% via strategic market timing and logistics arbitrage.
* Provide verifiable LHDN (MyInvois 2026) compliance and financial runway forecasting.

## 3. System Functionalities

### 3.1 Dual-Pipeline Data Ingestion
The system must simultaneously process distinct data modalities to feed the intelligence engine.

| Data Type | Sources | Ingestion Method |
| :--- | :--- | :--- |
| **Structured Data** | Soil NPK metrics, irrigation volume, daily temperature, CSV financial ledgers. | REST API Endpoints (Django DRF) / User CSV Uploads. |
| **Unstructured Data** | Meteorological alerts, international trade reports, regional competitor supply changes. | Webhooks / Automated Search APIs routed through the LLM parser. |

### 3.2 X.AI Decision Engine Integration (The Brain)
The core intelligence relies on a strictly constrained Large Language Model (X.AI).
* **Deterministic JSON Output:** The LLM must output responses matching a rigid JSON schema dictated by the backend to hydrate the Next.js frontend state.
* **Agentic Ledger:** The reasoning process is divided into specialized evaluation nodes: Sensory Agent, Risk Agent, and Market Agent.
* **Causal Explainability:** Every action command (e.g., "Advance harvest by 48 hours") must explicitly reference the data correlation that triggered it (e.g., ">85% soil moisture combined with a 90% storm probability").

### 3.3 Interactive Simulation Modules (Digital Twin)
Users can manipulate variables to forecast compounding effects on cash flow and yield:
* **Bio-Cultivation Optimizer:** Simulates how reducing fertilizer inputs directly impacts the Grade A to Grade B yield ratio and plant lifespan.
* **Weather & Insurance Risk:** Calculates Yield-at-Risk (YaR) against specific weather models (Category 10 wind, drought) and compares expected loss against existing insurance coverage gaps.
* **Supply Chain Arbitrage:** Redistributes supply allocation (e.g., shifting exports from Singapore to Hong Kong) dynamically in response to inputted port lockdowns or competitor supply surges.

### 3.4 Compliance & ROI Automation
Integration of a Rule/Risk layer to guarantee SME operations do not violate local regulations.
* **LHDN MyInvois 2026 Check:** Audits synthetic financial data for valid Digital Signatures, SST Tax Rate accuracy, and XML node formatting.
* **ROI Estimator:** Calculates system payback periods based on inputted monthly labor costs and efficiency gains.

## 4. User Stories & Use Cases

> **Use Case 1: Mitigating Imminent Weather Risk**
> *As a Farm CEO,* I want the system to cross-reference current high soil moisture with incoming storm data *so that* I can receive an explicit command to advance my harvest, rather than just seeing a weather alert, saving RM 22,000 in potential root rot losses.

> **Use Case 2: Market Supply Shock Hedging**
> *As a CFO,* I want to simulate a 15% surge in Thai durian supply hitting the market in 5 days *so that* the AI can recommend immediately locking in 40% of my Singapore pre-sale orders, maintaining my profit margin.

> **Use Case 3: Cash Flow Stress Testing**
> *As an Operations Manager,* I want to input an expected 14-day payment delay from buyers and a 10% labor cost increase *so that* the system accurately recalculates my survival runway and triggers a financing alert if insolvency drops below 60 days.

## 5. Scope Definition (Hackathon Constraints)

| In-Scope (Must Have for Pitch) | Out-of-Scope (Future Iterations) |
| :--- | :--- |
| Django backend REST architecture with Celery task queues. | Direct hardware integration with physical IoT sensors. |
| X.AI API integration enforcing strict JSON response schemas. | Automated API trading or autonomous execution of logistics contracts. |
| Next.js interactive simulation dashboard (UI/UX). | Real-time production database deployment (using SQLite/Redis locally for demo). |
| Demonstrable causal logic ledger resolving a specific crisis scenario. | Comprehensive multi-year historical data training pipeline. |

## 6. Assumptions & Dependencies

⚠️ **Technical Bottleneck Warning:** The entirety of this project's viability depends on the X.AI API's ability to consistently return structured JSON. Failure to strictly prompt the LLM will result in UI hydration failures. The Django backend must employ rigorous validation and fallback mechanisms before piping LLM data to the Next.js client.

* **Latency:** LLM processing times for multi-variable correlation will require asynchronous handling (Celery) to prevent UI timeouts during the hackathon demo.
* **Data Availability:** Given the fragmentation of Malaysian agricultural data, the hackathon prototype assumes the use of cleaned, synthetic CSV datasets acting as proxies for live data.gov.my or FAMA API feeds.
* **Frameworks:** The frontend team is proficient in Next.js/React hooks, and the backend team can successfully bridge DRF with the X.AI endpoints.
