# 🛡️ Telegram Darknet Monitor: Threat Vectors & Edge Cases Guide

This document lists potential edge cases, data anomalies, and connectivity scenarios that can occur within the Telegram Darknet Monitor system, along with how our system handles or mitigates them.

---

## 📡 1. Telegram API & Connectivity Edge Cases

| Edge Case | Potential Impact | Our Mitigation Strategy |
| :--- | :--- | :--- |
| **Telegram Flood Wait Rates** | If scraping a huge message history at once, Telegram triggers a `FloodWaitError` and blocks requests. | We configured incremental scraping. Except for the first run, the scraper only crawls messages since the `latest_saved_id`, keeping queries small and silent. |
| **Corrupted SQLite Session File** | If the `.session` file gets corrupted, Telethon fails to initialize. | `telegram_scraper.py` detects sqlite corruption (e.g., `nonce` or `auth_key` exceptions), deletes the locked `.session` files automatically, and re-initiates the login cycle. |
| **2FA Security Enforcements** | User has Two-Factor Authentication (2FA) active on their Telegram account. | The authentication route supports a multi-step login flow (`PHONE` -> `OTP` -> `2FA`) to verify passwords dynamically. |
| **Channel Deletions / Private Bans** | A monitored channel is deleted or the user is kicked out. | The scraper wraps entity checks inside try-except blocks, falling back to cached details and logging an warning without crashing the scheduler loop. |

---

## 🧠 2. LLM Analysis & Processing Edge Cases

| Edge Case | Potential Impact | Our Mitigation Strategy |
| :--- | :--- | :--- |
| **Context Window Overflow** | Crawling thousands of messages at once exceeds the LLM context window (e.g., 8k tokens). | The scraper groups messages in small hourly/daily batches and runs incremental AI cycles to summarize newly collected intelligence step-by-step. |
| **Local CPU/GPU Timeouts** | Ollama running on a CPU can take long periods, causing connection timeouts. | We increased connection timeouts to 120 seconds and implemented a **regex indicator extraction fallback** if the LLM fails. |
| **Malformed LLM JSON Output** | The LLM returns syntax-broken JSON that breaks standard code parsers. | We implemented strict regex fallbacks and schema validation guards to clean and normalize JSON responses. |
| **Empty Scrape Cycles** | No new messages are scraped in the scheduled cycle. | The scheduler checks message counts first; if there are no new posts, it skips the LLM API call entirely to save processing power and tokens. |

---

## 📝 3. CTI Data & Report Parsing Edge Cases

| Edge Case | Potential Impact | Our Mitigation Strategy |
| :--- | :--- | :--- |
| **Escaped Structural Characters** | If messages contain pipes (`|`), standard splits parse them into extra columns, distorting the tables. | We parse tables using negative lookbehinds `(?<!\\)\|` to ignore escaped pipes, keeping columns aligned. |
| **ReportLab Cell Discrepancies** | Rows with different cell counts than headers crash or misalign the PDF layout. | `pdf_generator.py` normalizes cell counts: padding shorter rows and merging extra columns back into the message body. |
| **Time Zone Divergences** | Using server UTC dates causes file partition naming and scheduler shifts. | The platform synchronizes all scrapers, daily partitions, ledgers, and timers to India Standard Time (IST, UTC+5:30). |
| **Duplicate Threat Indicators** | The same malicious IP or onion link is posted multiple times. | The daily JSON state database merges duplicates, incrementing the **Mention Count** and updating the **Last Seen (IST)** timestamp. |
