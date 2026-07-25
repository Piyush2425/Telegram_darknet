# 🛡️ Telegram Darknet Monitor: Cyber Threat Intelligence Command Center

**Telegram Darknet Monitor** is a state-of-the-art, full-stack Cyber Threat Intelligence (CTI) platform designed to monitor Telegram channels and groups for cybersecurity threat telemetry, credential leaks, and cyberattack coordination. 

The application provides a sleek **dark-mode analyst dashboard** where users can browse target channels, monitor scrapers, customize scheduler rules, view stateful intelligence ledgers, and export professional PDF intelligence briefings.

---

## 🎯 Key Architectural Features

### 1. 3-Column Schedulers
Configure and manage three independent background workflows per channel:
- **Auto-Scraping**: Fetches new messages silently via Telethon and logs them chronologically to daily `.csv` files.
- **Auto-AI Cycles**: Triggers the local LLM to run incremental, low-latency json threat extractions on new message segments. Updates the daily CTI ledger dynamically.
- **Auto-Report PDF Compiler**: Runs longer compilation tasks to build final page-numbered PDF briefings from the accumulated daily ledgers.

### 2. Stateful daily CTI Ledger (`.md` & `.state.json`)
The application maintains a stateful CTI database ledger per channel per day:
- **Deduplication**: If a URL, Onion link, suspicious username, or IOC (CVEs, IPs, Crypto Wallets) appears multiple times, the ledger automatically **increments its Mention Count** and updates its **Last Seen (IST)** timestamp.
- **Suspicious Username Filtering**: The LLM automatically filters standard chat participants, logging *only* threat actors and malicious sellers.
- **Evidence Block**: A chronological transcript table (`Time | Sender | Chat Message`) is cleanly appended at the bottom as audit evidence.

### 3. Professional PDF Reports & UI Parser
- **On-the-Fly PDF Exporter**: Convert daily CTI ledgers into ReportLab PDFs with headers, footers, page numbering, and formatted table layouts.
- **Frontend Markdown Parser**: Renders the daily `.md` report dynamically inside the dashboard with colored severity badges (CRITICAL, HIGH, MEDIUM, LOW) and active hyperlinks.

---

## 📁 Project Directory Structure

```
├── backend/                  # FastAPI Backend API Server
│   ├── app/
│   │   ├── api/              # Route handlers (channels, messages, reports)
│   │   ├── db/               # In-memory MongoDB stores
│   │   ├── llm/              # Threat analyzer & LLM json extraction prompts
│   │   ├── reports/          # ReportLab PDF compiler
│   │   └── scrapers/         # Telethon scrapers & background schedulers
│   ├── run.py                # Backend boot script
│   └── .env                  # Backend environment settings (API ID, Hash, LLM URL)
│
├── frontend/                 # Vite + React Frontend Client
│   ├── src/
│   │   ├── pages/            # Dashboard, Channel Details, Scraper Control
│   │   ├── services/         # Axios API client integrations
│   │   └── types/            # TypeScript type definitions
│   └── package.json          # Node dependencies
│
├── data/                     # Stateful channel partitioning database (CSV, MD, JSON)
│   └── {channel_id}/
│       ├── chats/            # Partitioned raw message CSVs
│       └── reports/          # Daily log ledgers (.md, .json) and PDF exports (.pdf)
│
├── darknet.py                # Python concurrent server boot script
└── darknet.bat               # Windows command wrapper
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.8 or higher.
- Node.js (v18+) & NPM.
- A local LLM engine active (e.g. **Ollama** running `llama3` or `mistral`).

### 2. Configuration
Create a `.env` file inside the `backend/` directory:
```env
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
USE_LOCAL_LLM=True
LOCAL_LLM_URL=http://localhost:11434/api/generate
LOCAL_LLM_MODEL=llama3
```

### 3. Start Both Services in One Click
You can launch both the **FastAPI Backend Server** (port `8000`) and the **Vite Frontend Dev Client** (port `5173`) concurrently using our unified runner tool:

- **In CMD (Command Prompt)**:
  ```cmd
  darknet serve
  ```

- **In PowerShell**:
  ```powershell
  .\darknet serve
  ```

Press `Ctrl + C` in your terminal to shut down both services cleanly and concurrently!
