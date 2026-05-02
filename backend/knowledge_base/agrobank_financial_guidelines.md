# SME Agricultural Loan Financial Health Review Guidelines
**Document Reference:** AGROBANK-FIN-GDL-007:2024  
**Issuing Authority:** Agrobank Malaysia — Credit Risk & Agricultural Finance Division  
**Version:** 2.5  
**Effective Date:** 15 January 2024  
**Review Cycle:** Annual (aligned with Bank Negara Malaysia CAFIB review cycle)  
**Classification:** Internal Reference — For Authorised Credit Officers and AI-Assisted Underwriting Systems

---

## Foreword

These guidelines were developed by Agrobank Malaysia's Credit Risk Division in response to a 22% increase in agricultural SME non-performing loan (NPL) rates observed between Q3 2021 and Q2 2023, driven primarily by post-COVID supply chain disruptions, the 2022 prolonged monsoon flood events in Kelantan and Terengganu, and volatile CPO (Crude Palm Oil) commodity pricing. The guidelines establish standardised financial health indicators, red-line thresholds, and escalation protocols to support both human credit officers and AI-powered underwriting tools in making consistent, evidence-based lending decisions.

These guidelines are to be read in conjunction with:
- Bank Negara Malaysia (BNM) Policy Document on Credit Risk (BNM/RH/PD 032-2): Effective 1 February 2020
- Agrobank Credit Manual Circular CM-2023-09 (Agricultural SME Collateral Valuation)
- SME Corp Malaysia: SME Definition Circular No. 1/2023 (turnover and employee count thresholds)

---

## 1. Scope and Applicability

These guidelines apply to all loan facility assessments for:
- **Agri-SMEs**: Businesses with annual turnover ≤ RM 50 million engaged primarily (≥ 50% revenue) in agriculture, aquaculture, agro-processing, or agricultural supply chain activities
- **Smallholders seeking facility upgrades**: Individual or cooperative borrowers with cultivated area between 2 – 500 hectares
- **Agri-fintech platform referrals**: Borrowers applying through MDEC-registered digital agricultural financing platforms

This document does **not** govern large corporate plantation financing (turnover > RM 50M), which falls under Agrobank's Corporate Credit Policy CCP-001.

---

## 2. Financial Health Assessment Framework

The financial health of an agricultural SME applicant is assessed across **five dimensions**, each carrying defined weights and sub-indicator red lines.

### 2.1 Framework Overview

| Dimension | Weight | Key Indicators |
|---|---|---|
| Revenue Stability | 30% | Sales trend, seasonal volatility, commodity price sensitivity |
| Debt Serviceability | 25% | DSCR, total debt burden, existing facility utilisation |
| Liquidity Position | 20% | Current ratio, quick ratio, cash cycle |
| Asset Quality | 15% | Land value, equipment depreciation, inventory health |
| Management & Governance | 10% | Business age, audit status, succession planning |

---

## 3. Revenue Stability Indicators

### 3.1 Quarterly Sales Trend — Red Line Thresholds

Revenue trend analysis is conducted on the most recent **eight consecutive quarters** of financial data (management accounts accepted; audited preferred).

| Scenario | Classification | Action |
|---|---|---|
| Sales growth ≥ 5% QoQ for ≥ 5 of last 8 quarters | **Green** | No sales-related conditions |
| Sales growth 0% – 4.9% QoQ on average | **Amber** | Require cashflow projection for loan tenure |
| Sales decline of **1% – 14.9% QoQ for 2 consecutive quarters** | **Amber-Red** | Mandatory management interview; require explanation and recovery plan |
| Sales decline of **≥ 15% QoQ for 2 consecutive quarters** | 🔴 **RED LINE — Trigger 1** | Automatic escalation to Senior Credit Committee; facility approval suspended pending review |
| Sales decline in **any 3 consecutive quarters** (regardless of magnitude) | 🔴 **RED LINE — Trigger 2** | Facility suspension; existing facilities reviewed for restructuring eligibility |
| Sales decline of ≥ **30% in any single quarter** vs same quarter prior year | 🔴 **RED LINE — Trigger 3** | Immediate referral to Agricultural Distress Facility (ADF) team; standard credit process halted |

> **AI Underwriting Note:** When ingesting quarterly revenue data, flag any sequence matching RED LINE Trigger 1, 2, or 3 before proceeding to full scoring. These are non-negotiable stops, not scoring deductions.

### 3.2 Revenue Concentration Risk

| Dependency | Risk Level | Action |
|---|---|---|
| ≤ 30% revenue from single buyer/commodity | Low | No adjustment |
| 31% – 60% revenue from single buyer/commodity | Moderate | 5-point CSS deduction; require diversification plan |
| 61% – 80% revenue from single buyer/commodity | High | 15-point deduction; facility cap at RM 300,000 |
| > 80% revenue from single buyer/commodity | 🔴 **RED LINE — Trigger 4** | Facility not approved unless Letter of Offtake (LOO) from buyer with ≥ 3 years remaining is submitted |

---

## 4. Debt Serviceability Indicators

### 4.1 Debt Service Coverage Ratio (DSCR)

**Formula:** DSCR = Net Operating Income ÷ Total Annual Debt Service Obligations

Net Operating Income is computed after deducting input costs, labour, and depreciation, but **before** interest and tax. For seasonal businesses, a rolling 12-month average is used.

| DSCR Value | Classification | Facility Eligibility |
|---|---|---|
| ≥ 2.0x | **Excellent** | All facility types up to full eligible limit |
| 1.5x – 1.99x | **Good** | Full eligibility with standard terms |
| 1.25x – 1.49x | **Acceptable** | Eligible; loan tenure may be extended to improve DSCR |
| 1.0x – 1.24x | **Borderline** | Amber flag; require guarantor or additional collateral |
| 0.85x – 0.99x | 🔴 **RED LINE — Trigger 5** | New facility not approved; existing facilities placed on Enhanced Monitoring (EM-2) |
| < 0.85x | 🔴 **RED LINE — Trigger 6** | Immediate NPL risk classification; restructuring or legal recovery process initiated |

### 4.2 Debt-to-Asset Ratio (DAR) — Leverage Red Lines

**Formula:** DAR = Total Liabilities ÷ Total Assets (book value)

For agricultural SMEs, total assets include land (at District Land Office assessed value), machinery, standing crop value (at 70% of market), and receivables.

| DAR Range | Classification | Action |
|---|---|---|
| < 0.35 | **Conservative** | Full eligibility |
| 0.35 – 0.49 | **Moderate** | Standard terms |
| 0.50 – 0.64 | **Elevated** | Amber; facility amount capped at 80% of applied amount |
| 0.65 – 0.74 | **High** | 🟠 Conditional; personal guarantee required |
| **≥ 0.75** | 🔴 **RED LINE — Trigger 7** | Facility declined or capped at RM 100,000 (working capital only); no term loan approved |
| **≥ 0.90** | 🔴 **RED LINE — Trigger 8** | Technically insolvent classification; refer to Agrobank Debt Advisory Programme (ADAP) |

### 4.3 Total Banking Exposure Ratio (TBER)

This ratio measures total banking system debt (all financial institutions combined, sourced from CCRIS) as a proportion of annual gross revenue.

| TBER | Risk Level | Notes |
|---|---|---|
| < 1.5x annual revenue | Low | — |
| 1.5x – 2.5x annual revenue | Moderate | Note in credit memo |
| 2.5x – 4.0x annual revenue | High | Amber flag; require detailed cashflow model |
| > 4.0x annual revenue | 🔴 **RED LINE — Trigger 9** | Considered over-leveraged in agricultural context; new facility denied |

---

## 5. Liquidity Position Indicators

### 5.1 Current Ratio

**Formula:** Current Assets ÷ Current Liabilities

| Current Ratio | Interpretation |
|---|---|
| ≥ 2.0 | Strong liquidity |
| 1.5 – 1.99 | Adequate |
| 1.2 – 1.49 | Borderline; monitor |
| 1.0 – 1.19 | Tight; short-term working capital facility recommended as condition |
| **< 1.0** | 🔴 **RED LINE — Trigger 10** | Immediate liquidity crisis risk; no term loan approved |

### 5.2 Cash Conversion Cycle (CCC)

Agricultural businesses are expected to have longer cash cycles than non-agricultural SMEs due to seasonal harvest timings. The following benchmarks are **crop-specific:**

| Crop Sector | Acceptable CCC (days) | Amber (days) | Red Line (days) |
|---|---|---|---|
| Oil Palm | 35 – 90 | 91 – 120 | > 120 |
| Paddy / Rice | 60 – 150 | 151 – 180 | > 180 |
| Vegetables (highland/lowland) | 14 – 45 | 46 – 60 | > 60 |
| Aquaculture (freshwater fish) | 90 – 180 | 181 – 240 | > 240 |
| Rubber | 30 – 75 | 76 – 100 | > 100 |
| Durian (D197 / Musang King) | 180 – 270 | 271 – 330 | > 330 |

---

## 6. Composite Financial Health Score (CFHS)

### 6.1 Scoring and Classification

Each dimension is scored 0–100 based on the indicator ranges above. Weighted aggregate produces the CFHS.

| CFHS | Grade | Facility Treatment |
|---|---|---|
| 85 – 100 | **A — Financially Sound** | Full approval; preferential rate eligible (BFR – 0.5%) |
| 70 – 84 | **B — Financially Stable** | Full approval at standard rate |
| 55 – 69 | **C — Financially Adequate** | Conditional approval; additional collateral or guarantor |
| 40 – 54 | **D — Financially Stressed** | Working capital only (max RM 150,000); 6-month review |
| < 40 | **E — Financially Distressed** | No new facility; referral to ADAP or TEKUN restructuring programme |

### 6.2 Red Line Override Rule

**If ANY single red-line trigger (Triggers 1–10) is activated, the CFHS score is disregarded for approval purposes.** The facility is automatically classified as requiring Senior Credit Committee review regardless of overall CFHS grade. This ensures composite scoring cannot mask individual critical vulnerabilities.

---

## 7. Supporting Documentation Requirements

| Document | Mandatory | Accepted Format |
|---|---|---|
| Audited/management financial statements (3 years) | Yes | PDF; certified by registered accountant |
| CCRIS / CTOS report (within 90 days) | Yes | PDF from BNM / CTOS |
| Land title / lease agreement | Yes | Certified true copy |
| Crop production records (last 2 seasons) | Yes | MPOB delivery receipts / DOA form |
| Bank statements — all institutions (12 months) | Yes | Bank-certified PDF |
| MyGAP or SALM certification | Preferred | MARDI / DOA certificate |
| Climate/weather risk assessment for site | Preferred | MPOB-AGRO-STD-001 CSS report |
| Letter of Offtake (if RED LINE Trigger 4 applies) | Conditional | Original buyer letterhead |

---

## 8. Seasonal and Commodity Adjustment Provisions

### 8.1 CPO Price Sensitivity Adjustment

When global CPO benchmark price (Bursa Malaysia 3rd month futures) falls below **RM 2,800/MT**, all oil palm-based revenue in CFHS calculations is automatically stress-tested at a **15% revenue haircut**. Below **RM 2,200/MT**, the haircut increases to **30%**.

### 8.2 Monsoon Flood Disruption Provision

Agricultural SMEs located in BNM-designated Flood Impact Zones (FIZ) — which include flood-prone mukim in Kelantan, Terengganu, Pahang, Johor, and Sarawak — are eligible for a **DSCR calculation moratorium of up to 2 quarters** immediately following a declared flood disaster, under the Agricultural Business Continuity Support Scheme (ABCSS) administered jointly by Agrobank and the Ministry of Agriculture and Food Security (MAFS).

---

## 9. AI Integration and Automation Notes

When this document is loaded into an AI-assisted underwriting or RAG decision system:

1. **Priority extraction fields:** Trigger thresholds in §3.1, §4.1, §4.2, §4.3, and §5.1 should be indexed as high-priority retrievable facts.
2. **Red line logic:** The system must implement red-line triggers as **hard stops** prior to computing CFHS. The override rule in §6.2 must be enforced programmatically.
3. **Crop-specific parameters:** §5.2 CCC benchmarks should be retrieved via crop-type lookup; do not apply generic thresholds across all crop types.
4. **Currency and date sensitivity:** RM thresholds are denominated in Malaysian Ringgit. The CPO price trigger in §8.1 is pegged to Bursa Malaysia spot data and must be queried dynamically.
5. **Version control:** Always confirm document version (current: v2.5) is the latest before generating binding recommendations. Superseded versions should not be used for credit decisions.

---

*© 2024 Agrobank Malaysia. These guidelines are intended for internal credit and AI system use. External distribution requires written authorisation from the Chief Credit Officer, Agrobank Malaysia.*
