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
│── darknet.py                # Python concurrent server boot script
├── darknet.bat               # Windows command wrapper
└── darknet                   # Linux / macOS shell command wrapper
```

---

## 🚀 Installation & Setup Guides

### 🔑 Step 0: Get Telegram API Credentials (Required)
To connect with the real Telegram network, you need a Telegram developer profile:
1. Go to **[https://my.telegram.org](https://my.telegram.org)**.
2. Enter your phone number (with country code) and verify it using the confirmation code sent to your Telegram app.
3. Click on **API Development Tools**.
4. Create a new application (you can enter any app name and short name).
5. Copy your **App api_id** and **App api_hash** to a secure notepad. You will need these for the `.env` file.

---

### 🦙 Step 1: Set Up Local AI Threat Analysis (Recommended)
This project uses a local Large Language Model (LLM) to perform offline threat analysis:
1. Download and install **Ollama** from **[https://ollama.com](https://ollama.com)**.
2. Open your terminal or command prompt and run the following command to download the model:
   ```bash
   ollama pull llama3.1:8b
   ```
3. Keep the Ollama application running in the background.

---

### 🐧 Linux / Ubuntu Setup Guide

#### 1. Install System Dependencies
Update your package list and install Python (with venv) and Node.js:
```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nodejs npm
```

#### 2. Configure Backend API
Clone the repository and set up the Python environment:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Optional: Install testing tools
pip install pytest pytest-asyncio httpx
```

Create a `.env` configuration file:
```bash
cp .env.example .env
nano .env
```
Fill in your `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`.

#### 3. Configure Frontend Client
Install the Node dependencies:
```bash
cd ../frontend
npm install
```

#### 4. Grant Script Permissions & Run Services
Go back to the root folder, grant execute permissions to our runner script, and run both services with a single command:
```bash
cd ..
chmod +x darknet
./darknet serve
```

---

### 🪟 Windows Setup Guide

#### 1. Configure Backend API
Open PowerShell or Command Prompt in the repository root and navigate to the backend folder:
```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```
Create a `.env` file from `.env.example` and fill in your API credentials.

#### 2. Configure Frontend Client
Install dependencies:
```powershell
cd ../frontend
npm install
```

#### 3. Run Services
Return to the root folder and run:
- **In PowerShell**:
  ```powershell
  .\darknet serve
  ```
- **In CMD (Command Prompt)**:
  ```cmd
  darknet serve
  ```

---

## 💻 Running the Command in Terminal

Below is a quick reference for running the service command depending on your terminal shell:

| Operating System / Shell | Command to Run | Action Required First |
| :--- | :--- | :--- |
| **Windows (PowerShell)** | `.\darknet serve` | None |
| **Windows (Command Prompt / CMD)** | `darknet serve` | None |
| **Linux / macOS (Bash / Zsh)** | `./darknet serve` | Run `chmod +x darknet` first |

> [!TIP]
> To stop both backend and frontend servers at any time, simply press **`Ctrl + C`** in your terminal window.
