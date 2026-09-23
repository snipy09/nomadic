# 🌌 Nomadic — Universal Career OS & AI Job Automation Platform

> **The all-in-one desktop operating system bridging skill mastery, real-time ATS job discovery, high-speed autonomous application submission, and verified recruiter outreach.**

[![Version](https://img.shields.io/badge/version-1.0.6-blue.svg)](https://nomadic.runs-on.dev)
[![License](https://img.shields.io/badge/license-Proprietary-black.svg)](#)
[![Stack](https://img.shields.io/badge/stack-Electron_31_•_React_18_•_Vite_5_•_Tailwind_•_SQLite_•_Supabase-0284c7.svg)](#)
[![Status](https://img.shields.io/badge/distribution-Closed_Alpha_Testing-emerald.svg)](https://nomadic.runs-on.dev)

---

## 📑 Table of Contents

1. [Executive Summary & Product Vision](#1-executive-summary--product-vision)
2. [Core Pillars & Main Features](#2-core-pillars--main-features)
   - [Pillar 1: Learner Hub (Skill & Competency Mastery)](#a-pillar-1-learner-hub-skill--competency-mastery)
   - [Pillar 2: Seeker Hub (Live ATS Radar & Smart Feed)](#b-pillar-2-seeker-hub-live-ats-radar--smart-feed)
   - [Pillar 3: OmniForm Multi-Pass Auto-Applier Engine](#c-pillar-3-omniform-multi-pass-auto-applier-engine)
   - [Pillar 4: Parallel Batch Co-Pilot](#d-pillar-4-parallel-batch-co-pilot)
   - [Pillar 5: Max AI Assistant on Steroids](#e-pillar-5-max-ai-assistant-on-steroids)
   - [Pillar 6: 4-Stage Verified Recruiter Outreach](#f-pillar-6-4-stage-verified-recruiter-outreach)
3. [Business Model, Pricing Tiers & Alpha Launch](#3-business-model-pricing-tiers--alpha-launch)
4. [How the App Works (End-to-End User Journeys)](#4-how-the-app-works-end-to-end-user-journeys)
5. [System Architecture & Technology Stack](#5-system-architecture--technology-stack)
6. [Monorepo Structure & Codebase Tour](#6-monorepo-structure--codebase-tour)
7. [Database Architecture & APIs](#7-database-architecture--apis)
   - [Local SQLite Database](#a-local-sqlite-database)
   - [Supabase Cloud Database](#b-supabase-cloud-database)
   - [Master ATS Scraper Pipeline](#c-master-ats-scraper-pipeline)
8. [Current Status: What's Working vs. Known Limitations](#8-current-status-whats-working-vs-known-limitations)
9. [Developer Setup & Workflow Guide](#9-developer-setup--workflow-guide)
10. [Roadmap: What to Build & Polish Next](#10-roadmap-what-to-build--polish-next)

---

## 1. Executive Summary & Product Vision

### The Problem
Job hunting and career development today are broken into fragmented, painful steps:
1. **Disconnected Learning:** Candidates jump between scattered YouTube videos, textbooks, and tutorial sites with zero clear timeline or progress tracking.
2. **Repetitive Form Fatigue:** Applying for 100+ jobs means typing the same name, email, LinkedIn, work authorization, and demographic questions hundreds of times across clunky ATS portals (Ashby, Greenhouse, Lever, Workday).
3. **Ghost Jobs & Stale Listings:** Job aggregators show listings from months ago that are already closed or spam.
4. **Blind Recruiter Cold Emailing:** Sending messages to `info@` or broken emails that bounce and ruin the sender's email domain reputation.

### The Solution: Nomadic
**Nomadic** is an unified, high-performance desktop application (Electron 31 + React 18 + Vite 5 + Tailwind CSS + SQLite + Supabase + Playwright Stealth) that consolidates the entire career lifecycle into one smooth, automated workflow:
* **Learn:** Dynamic AI-generated day-by-day curricula, LeetCode question vault (428+ companies), and verified textbooks.
* **Discover:** Sub-30ms range-paginated ATS job feed loaded with freshly scraped, deduplicated real-world listings.
* **Auto-Apply:** >95% accurate multi-pass form solver (OmniForm) that handles React inputs, unanchored arbitration paragraphs, custom radio buttons, file attachments, and multi-tab parallel filling.
* **Reach Out:** 4-stage verified recruiter email extraction and humanized cold drip campaigns.

---

## 2. Core Pillars & Main Features

### A. Pillar 1: Learner Hub (Skill & Competency Mastery)

Designed for students and career-switchers to reach job-ready competency with zero guesswork:

* **Dynamic AI Curriculum Generation:**
  - Enter any career goal (e.g. *"Full Stack React & Node.js Developer"*, *"Product Manager"*, *"AI/ML Engineer"*).
  - Synthesizes a modular, multi-phase roadmap with milestones and day-by-day sub-topics.
  - Automatically cached in local SQLite (`custom_roadmaps`) and `localStorage` to prevent regeneration loops.
* **2-Column Phase Breakdown:**
  - **Left Column:** Interactive concept checklist with 1-click mastery completion toggles.
  - **Right Column:** Verified, live YouTube tutorial playlists and official documentation links opening directly in the default browser.
* **Goal & Horizon Calibration:**
  - Target Horizons: `1 Month (Bootcamp Sprint)`, `3 Months (Standard)`, `6 Months (Comprehensive Mastery)`.
  - Daily Commitment: `1 Hour / Day`, `2 Hours / Day`, `4+ Hours / Day`.
* **Authentic 52-Week Streak Heatmap:** GitHub-style activity contribution grid tracking daily completed lessons and coding milestones.
* **Technical Resource Vault:**
  - **LeetCode Question Bank:** Instant access to 428+ company-specific interview question sets.
  - **Curated Textbooks & Architecture Guides:** High-yield reference handbooks with embedded reading guides.
* **Opportunity Board (`OpportunityBoardView.tsx`):** Curated directory for paid research fellowships, global hackathons, open-source grants, and builder residencies.

---

### B. Pillar 2: Seeker Hub (Live ATS Radar & Smart Feed)

High-throughput, zero-noise job discovery:

* **Direct ATS Ingestion:** Ingests live listings directly from public APIs of **Ashby, Greenhouse, Lever, Internshala, and Remotive**.
* **Sub-30ms Server-Side Range Pagination:**
  - Loads 1 page at a time (configurable: `18`, `36`, or `54` items per page) via Supabase range queries (`get-cloud-feed-page`), eliminating heavy data transfers and UI lag.
* **Anti-Ghost Deduplication:** Every job is hashed via cryptographic `SHA-256(company + title + apply_url)` to guarantee zero duplicate postings.
* **Multi-Dimensional Segmented Filters:**
  - Opportunities: `All`, `Full-Time Jobs`, `Internships`, `Both`.
  - Portals: `All Sources`, `Direct ATS`, `Internshala`, `Remote Tech`.
  - Matching: `Latest`, `High Match (≥80%)`, `Saved / Bookmarked`.
* **Multi-Resume Library (`ProfileView.tsx`):**
  - Upload multiple `.pdf` or `.docx` resumes with active default indicators and 1-click deletion.
  - Pre-apply gatekeeper verifies that the candidate's name, contact details, and default resume exist before any auto-apply attempt.

---

### C. Pillar 3: OmniForm Multi-Pass Auto-Applier Engine

The crown jewel of Nomadic: a >95% success-rate automated form solver engineered to defeat modern ATS quirks and virtual DOM frameworks.

* **React 18 Prototype Setter Override:** Standard JavaScript `input.value = "text"` fails on React 18 because React overrides property setters. OmniForm directly calls `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value)` and dispatches synthetic `input`, `change`, and `blur` bubbling events to update component state.
* **Unanchored Arbitration & Legal Paragraph Solver:** Solves complex legal checkmarks and long-paragraph arbitration agreements (*"I acknowledge that I have opened, read, and understood the Arbitration Agreement..."*) and declarations (*"I confirm I have read the above"*).
* **Binary & Radio Group Auto-Resolution:** Automatically selects compliant defaults:
  - Work Authorization: `Yes`
  - Visa Sponsorship: `No` (or candidate preference)
  - Relocation / 3-Day Office Attendance: `Yes`
  - Demographic / EEOC Surveys: `Decline to self-identify` / `I do not wish to answer`
* **Opacity-0 Checkbox Clicking:** For modern custom UI libraries (Radix, Tailwind UI) that hide real checkboxes (`opacity: 0`), clicks are dispatched directly to the parent `<label>` wrapper.
* **Minimal PDF Stream Injector:** Generates and injects valid `%PDF-1.4` binary streams when attaching resume files to file dropzones.
* **Specialized ATS Drivers:**
  - **AshbyBot:** Direct mapping for `#_systemfield_*` inputs, custom `_yesno_` toggle groups, and post-submit error callout remediation.
  - **InternshalaBot:** Modal-aware scrolling (targeting `.modal-body` & `#application_modal` instead of the root page window) + multi-tab popup listener (`waitForEvent('page')`).
  - **GreenhouseBot & LeverBot:** Multi-pass field mapping with custom dropdown popover clickers.

---

### D. Pillar 4: Parallel Batch Co-Pilot

A headful, RAM-safe application assistant that gives candidates full transparency and control:

* **3–5 Parallel Tab Workers:** Opens a controlled queue of headful Chromium tabs (preventing memory exhaustion on 8GB laptops).
* **Live Visual Inspection:** Candidates can watch the bot fill fields in real time using their active Google Chrome profile (preserving existing logins and session cookies).
* **Unified Review Drawer (`BatchCoPilotReviewModal.tsx`):**
  - Displays all open applications side-by-side.
  - Allows natural-language prompt editing globally or per-job (e.g., *"Highlight my TypeScript experience for this role"*).
* **1-Click "Submit All":** Submits all validated applications in parallel once reviewed.

---

### E. Pillar 5: Max AI Assistant on Steroids

Positioned at `fixed bottom-6 right-6 z-[90]` with an ambient glowing badge (`NomadicAssistant.tsx`):

* **App-Wide Action Dispatch:**
  - Instruct the assistant in plain English (e.g., *"Filter job feed for remote React roles"*, *"Start auto-apply on top 3 jobs"*, *"Open LeetCode question bank"*), and it executes the UI navigation instantly.
* **Live Career Copilot:** Real-time interview coaching, salary negotiation strategy, and system architecture deep dives.
* **Strict Anti-Exploitation Guardrails:** Hardcoded refusal of academic homework, school assignments, or live test taking.

---

### F. Pillar 6: 4-Stage Verified Recruiter Outreach

Hyper-personalized cold outreach engine (`OutreachView.tsx`):

* **Dual Lead Discovery:** Targeted web search dorking + corporate domain pattern matching (`first.last@company.com`, `first@company.com`).
* **4-Stage Email Verification Pipeline:**
  1. *Stage 1:* RFC 5322 Syntax validation.
  2. *Stage 2:* Role & Disposable email filter (purges `info@`, `support@`, `sales@`).
  3. *Stage 3:* Real-time DNS MX record verification (validates Google Workspace / Microsoft 365).
  4. *Stage 4:* Direct SMTP socket ping (`HELO` ➔ `MAIL FROM` ➔ `RCPT TO` on port 25).
* **Humanized Drip Engine:**
  - Strict daily cap of **15–25 emails/day** per user.
  - Randomized delay of **60s–180s** between sends.
  - Dispatches via local authenticated SMTP or opens drafts in the user's default browser Gmail compose session.

---

## 3. Business Model, Pricing Tiers & Alpha Launch

### Closed Alpha Testing Program
* **Zero Public Downloads:** All public download buttons and open installers are locked.
* **Cohort Launch:** First official Alpha Testing cohort launches **next Monday**.
* **Pre-Registration:** Open at **₹99 (one-time)** via direct WhatsApp reservation (+91 94938 33632) and the web landing portal ([nomadic.runs-on.dev](https://nomadic.runs-on.dev) / [nomadicai.vercel.app](https://nomadicai.vercel.app)).

---

### 3-Tier Subscription Model

| Tier | Price | Target Audience | Features & Quotas |
| :--- | :--- | :--- | :--- |
| **Free** | **₹0** | Trial / Explorer | • 1 roadmap preview<br>• Top 10 curated jobs<br>• 2 curated textbooks<br>• 3 LeetCode company question banks<br>• Local SQLite progress persistence |
| **Pro** | **₹249 / mo** | Active Job Seekers & Learners | • **Full AI Roadmaps & Curricula**<br>• **428+ LeetCode company banks** & 12+ textbooks<br>• 52-week streak activity heatmap<br>• **Full ATS Job Board** with 18/36/54 range pagination<br>• **50 Auto-Applies / week**<br>• **25 Verified HR Leads / week**<br>• 5 resume slots |
| **Max** | **₹599 / mo** | Full Autopilot & Placement | • **All Pro features included**<br>• **Unlimited Autonomous Auto-Applies**<br>• **Unlimited Background Recruiter Outreach**<br>• Priority ATS sync radar<br>• **Exclusive Bottom-Right Max AI Assistant**<br>• Upgrade CTA buttons hidden |

### Security & Tier Enforcement
* **Server-Side Verification:** Privileged IPC actions (`launch-autonomous`, `start-batch-copilot`, `ask-nomadic-assistant`, `send-outreach`) verify subscriptions directly against Supabase `users_profile` (`getVerifiedServerUserTier`). Local SQLite tampering cannot bypass gating.
* **Lossless Tier Normalizer:** Maps legacy database strings (`learner_pro`, `seeker_pro`, `lite` → `pro`; `seeker_max` → `max`).
* **Zero Hardcoded Credentials:** Test accounts and bypass keys (`admin@jobmaxxer.com`, `admin123`) have been removed.
* **Master Admin Accounts:** `sajalmishra0906@gmail.com` and `sajalmishra222@gmail.com` (assigned `max` tier and `admin` role).

---

## 4. How the App Works (End-to-End User Journeys)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                NOMADIC USER JOURNEY                                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
                            ┌──────────────────────────────┐
                            │    1. Onboarding & Mode      │
                            │   Learner / Seeker / Both    │
                            └──────────────┬───────────────┘
                                           │
                   ┌───────────────────────┴───────────────────────┐
                   ▼                                               ▼
     ┌───────────────────────────┐                   ┌───────────────────────────┐
     │      LEARNER TRACK        │                   │       SEEKER TRACK        │
     │                           │                   │                           │
     │ 1. AI Roadmap Synthesis   │                   │ 1. Sub-30ms ATS Feed      │
     │ 2. YouTube & Docs Study   │                   │ 2. Filter: Remote/Match % │
     │ 3. Practice Drills        │                   │ 3. Select 3-5 Jobs        │
     │ 4. 52-Wk Streak Heatmap   │                   │ 4. Batch Co-Pilot Review  │
     │ 5. 428+ LeetCode Banks    │                   │ 5. 1-Click Submit All     │
     └─────────────┬─────────────┘                   └─────────────┬─────────────┘
                   │                                               │
                   └───────────────────────┬───────────────────────┘
                                           │
                                           ▼
                            ┌──────────────────────────────┐
                            │   3. Recruiter Outreach      │
                            │  4-Stage MX/SMTP Verification│
                            │  15-25 Warm Drips / Day      │
                            └──────────────────────────────┘
```

---

## 5. System Architecture & Technology Stack

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. PRESENTATION LAYER (Electron 31 + React 18 + Vite 5 + Tailwind CSS)                 │
│    • LearnerView.tsx    • FeedView.tsx    • NomadicAssistant.tsx (Max AI)             │
│    • BatchCoPilotReviewModal.tsx          • OutreachView.tsx                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. SECURE IPC & BUSINESS LOGIC (Main Process - TypeScript)                             │
│    • contextBridge IPC Isolation          • Server-Side Tier Gate (Supabase)           │
│    • Local sql.js SQLite Engine           • Permanent userData Path Locking            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. PERCEPTION & AUTOMATION ENGINE (Playwright Stealth + OmniForm)                      │
│    • generateAIPilotPlan Perception Loop  • React 18 Prototype Setter Override         │
│    • Unanchored Arbitration Radio Solver  • AshbyBot / LeverBot / InternshalaBot       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. CLOUD INFRASTRUCTURE & SCRAPERS (Supabase + Vercel)                                 │
│    • PostgreSQL users_profile & Auth      • get-cloud-feed-page (18/36/54 range)       │
│    • Scrape_All_Jobs.bat (Master Pipeline)• Web Portal (nomadic.runs-on.dev)           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

* **Interactive Excalidraw Diagram:** [Open System Architecture Diagram](https://excalidraw.com/#json=C4Hc9T-pc0uftWs5lUswl,kMC2ejGrdjXprA8HgNtuTg)
* **Local Diagram File:** `nomadic_architecture.excalidraw`

---

## 6. Monorepo Structure & Codebase Tour

```
nomadic/
├── apps/
│   ├── desktop/                         # Electron 31 Desktop Application
│   │   ├── src/
│   │   │   ├── main/                    # Electron Main Process (Node.js backend)
│   │   │   │   ├── index.ts             # Main window, IPC handlers, app lifecycle
│   │   │   │   ├── db.ts                # Local SQLite initialization (sql.js)
│   │   │   │   ├── device.ts            # Hardware fingerprinting & trial locking
│   │   │   │   └── preload.ts           # Secure contextBridge IPC exposure
│   │   │   └── renderer/                # React 18 Frontend
│   │   │       ├── App.tsx              # Root component & state management
│   │   │       ├── browserApiShim.ts    # Web fallback shim for desktop APIs
│   │   │       └── components/          # UI Views & Modals
│   │   │           ├── LearnerView.tsx  # Dynamic roadmaps & milestone checklist
│   │   │           ├── FeedView.tsx     # Range-paginated ATS job feed (18/36/54)
│   │   │           ├── NomadicAssistant.tsx # Floating Max AI Assistant
│   │   │           ├── BatchCoPilotReviewModal.tsx # Parallel review drawer
│   │   │           ├── OutreachView.tsx # Recruiter email finder & drip
│   │   │           ├── ProfileView.tsx  # Multi-resume library & user info
│   │   │           ├── ResourceVaultView.tsx # 428+ LeetCode banks & textbooks
│   │   │           ├── ApplicationsView.tsx # SQLite application status tracker
│   │   │           ├── AdminView.tsx    # Master admin dashboard
│   │   │           └── UpgradeModal.tsx # Plan selection & WhatsApp upgrade flow
│   └── web/                             # Next.js / React Web Landing Portal
│       └── src/                         # Closed Alpha Pre-Registration page
├── packages/
│   ├── automation/                      # Playwright Stealth auto-apply & OmniForm
│   ├── email-verifier/                  # 4-stage MX/SMTP email verification
│   ├── scrapers/                        # ATS Scrapers (Ashby, Greenhouse, Lever, Internshala)
│   └── supabase/                        # Supabase client, migrations & sync scripts
├── Scrape_All_Jobs.bat                  # Master multi-ATS scraper execution script
├── nomadic_architecture.excalidraw      # System architecture diagram
└── package.json                         # Monorepo root scripts & dependencies
```

---

## 7. Database Architecture & APIs

### A. Local SQLite Database
Located permanently at `%APPDATA%\Nomadic\job_automator_local.db` (`userData` locked):
* `master_profile`: Candidate personal info, education, work authorization, tech stack.
* `custom_roadmaps`: AI-synthesized career learning trees and milestone progression.
* `resumes`: Binary resume storage with default selection flags.
* `local_applications`: Application history (`draft`, `applied`, `interviewing`, `offer`, `rejected`).
* `user_activity_log`: Timestamped activity log powering the 52-week streak heatmap.
* `cached_form_answers`: Recurring ATS question/answer mappings.

### B. Supabase Cloud Database
* `users_profile`: User ID, email, subscription tier (`free`, `pro`, `max`), admin status.
* `jobs`: Aggregated listings with SHA-256 deduplication hashes.
* `hr_contacts`: Verified recruiter email database.
* `get-cloud-feed-page`: High-speed SQL stored procedure for range pagination (18/36/54 items).

### C. Master ATS Scraper Pipeline
Run via `Scrape_All_Jobs.bat`:
* Hits public JSON APIs and sitemaps for Ashby, Greenhouse, Lever, Internshala, and Remotive.
* Deduplicates and syncs active jobs directly into Supabase.

---

## 8. Current Status: What's Working vs. Known Limitations

### ✅ What's Working Flawlessly
1. **Desktop Build v1.0.6:** Signed, packaged, and fully functional on Windows.
2. **OmniForm Multi-Pass Solver:** >95% fill accuracy on Ashby, Greenhouse, Lever, and Internshala.
3. **Sub-30ms Job Board:** Range-paginated feed with 18/36/54 item selection.
4. **Max AI Assistant:** App-wide command dispatch and interview coaching.
5. **Batch Co-Pilot:** Live headful Chrome profile automation with 1-click Submit All.
6. **Zero Data Loss Storage:** Triple-layer persistence (localStorage + SQLite WAL + Supabase).
7. **Web Portal & Domains:** Live at [nomadic.runs-on.dev](https://nomadic.runs-on.dev) and [nomadicai.vercel.app](https://nomadicai.vercel.app).

### ⚠️ Known Limitations & Active Focus Areas
1. **Workday / Oracle Portals:** Workday multi-step shadow DOM forms and strict login walls require semi-autonomous user review rather than 100% headless completion.
2. **Port 25 ISP Filtering (India):** Indian residential ISPs (Airtel, Jio) block raw port 25 socket pings; the verifier automatically falls back to DNS MX record checks.
3. **Automated Recurring Billing:** Indian debit cards frequently reject recurring e-mandates (~40% failure); currently streamlined via manual UPI / WhatsApp checkout (+91 94938 33632).

---

## 9. Developer Setup & Workflow Guide

### Prerequisites
* **Node.js:** v18+ or v20+
* **Package Manager:** `npm`
* **OS:** Windows 10/11 (or macOS / Linux for desktop development)

### 1. Installation
```bash
git clone https://github.com/snipy09/nomadic.git
cd nomadic
npm install
```

### 2. Running Desktop in Development (Hot Reloading <200ms)
```bash
npm run dev:desktop
```
* Press `F12` or `Ctrl+Shift+I` to open Chrome DevTools.
* Press `Ctrl+Shift+R` to force reload.

### 3. Running Web Landing Portal
```bash
npm run dev:web
```

### 4. Running the Master Job Scraper
```bash
# Windows
.\Scrape_All_Jobs.bat
```

### 5. Packaging Production Binaries (NSIS + Portable)
```bash
npm run package:desktop
```
* Generates `Nomadic Setup 1.0.6.exe` in `apps/desktop/dist/` and copies to `C:\Users\<user>\Downloads\`.

---

## 10. Roadmap: What to Build & Polish Next

For developer partners onboarding onto the project, here is the prioritized action list:

1. **Workday Semi-Auto Wizard:** Improve step-by-step shadow DOM traversal for Workday job applications.
2. **Interactive Mock Interview Simulator:** Build a voice/text audio mock technical interview screen in `InterviewPrepView.tsx`.
3. **Automated Resume Bullet Optimizer:** 1-click AI resume tailor that aligns bullet points with the active job posting's required skills.
4. **Enhanced Outreach Drip Templates:** Add 5 customizable cold email templates with recruiter name variable insertion.
5. **Telemetry & Error Logging:** Integrate client error reporting to monitor failed form fields in real time.

---

**Built with passion by the Nomadic Engineering Team.**
