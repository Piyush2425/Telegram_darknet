# 🛡️ Telegram Darknet Monitor: Features & Capabilities Guide

This guide details all the core features, background automation workflows, and threat intelligence capabilities implemented in the **Telegram Darknet Monitor** platform.

---

## 🖥️ 1. Cyber Threat Intelligence Analyst Dashboard

- **Telegram-Like Channel Directory**: A centralized control center displaying all synced and monitored channels.
- **Account Synchronisation**: Real-time integration with your personal Telegram account to sync all target groups and channels in a single click.
- **Target Channels Customisation**: Allows adding new monitored channels dynamically using their public Telegram usernames or unique numeric channel IDs.
- **Visual Scraper Console**: An embedded real-time terminal window showing running logs, Telethon connection status, and database write operations directly in the web browser.

---

## ⚙️ 2. Multi-Phase Background Automation Schedulers

Analysts can configure and run three independent workflows concurrently per channel through the **Unified Schedulers Panel**:
1. **Auto-Scraping Scheduler**:
   - Automatically wakes up at set intervals (minutes or hours) to scrape new messages.
   - Stores logs cleanly in date-wise CSV partitions under `data/{channel_id}/chats/messages_{YYYY-MM-DD}.csv`.
2. **Auto-AI Cycles (Incremental Threat Extraction)**:
   - Uses a local LLM (e.g. Ollama running `llama3.1`) to parse small, newly crawled batches of messages incrementally.
   - Extracts URLs, Onion links, suspicious threat actors, and Indicators of Compromise (IOCs) and statefully updates the daily intelligence ledger.
3. **Auto-Report PDF Compiler**:
   - Runs on longer daily intervals (e.g. every 24 hours) to compile professional PDF briefings from the accumulated daily ledgers.

---

## 📝 3. Stateful daily CTI Ledger

The daily markdown log file (`data/{channel_id}/reports/ChatLog_{channel_id}_{YYYY-MM-DD}.md`) functions as a stateful, deduplicated database ledger:
- **Metrics Deduplication**: When a previously seen item (URL, Onion link, Telegram username, IOC, CVE, or Crypto Wallet) appears again, the system **increments its Mention Count** and updates its **Last Seen (IST)** timestamp.
- **Suspicious Username Filtering**: The LLM filters out normal group participants, registering *only* suspicious usernames involved in malicious threat actions.
- **Chronological Timeline**: Records a timeline of newly discovered threat alerts (e.g. Critical database leaks, Malware campaigns) sorted by time.
- **Evidence Block**: Appends a clean, formatted table (`Time (IST) | Sender | Chat Message`) at the bottom, housing the full conversation history.

---

## 📊 4. Interactive Frontend Markdown Parser

The Daily Report tab dynamically compiles raw markdown logs into an interactive web interface:
- **Interactive Data Tables**: Displays metrics as clean HTML tables with alternating row colors.
- **glowing Severity Badges**: Automatically detects threat levels (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) and formats them into custom glowing colored badges.
- **Active Hyperlinks**: Converts raw text URLs into clickable web links that open securely in a new tab.

---

## 📋 5. Professional CTI PDF Exporter

Analysts can compile and download professional intelligence reports on-the-fly:
- **ReportLab PDF Engine**: Compiles the daily CTI ledger dynamically into a page-numbered PDF document.
- **Formatted Tables**: Automatically formats and aligns text columns, implementing full word-wrapping to prevent layout distortions.
- **Confidentiality Markers**: Adds professional header and footer banners, marking the report as a *Confidential Security Assessment Report*.

---

## 🔒 6. Enterprise Security & Developer DX

- **Credential UI Masking**: Masks sensitive fields like your **Telegram API ID** and **API Hash** behind password inputs on the Settings page to prevent accidental exposures.
- **Automated `.env` Fallback**: If settings inputs are left blank, the system automatically falls back to your local `.env` configuration.
- **Git Shielding**: Configured `.gitignore` to untrack the `data/` folder and session files, preventing your private scraping database from leaking to public GitHub repositories.
- **Concurrent Boot Script (`darknet serve`)**: Allows booting both the FastAPI backend and Vite React frontend concurrently in one click using a single terminal, handling shutdown signals cleanly.
