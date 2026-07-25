# Project Edge Cases and Solutions

This is a simple list of edge cases that can happen in the Telegram Darknet Monitor project and how we solve them.

### 🔌 Telegram Connection and Auth Issues

* **Telegram Rate Limits (Flood Wait):**
  If we try to fetch too many messages at once, Telegram blocks us. 
  *Solution:* We use incremental scraping. The app only fetches messages that are newer than the last message we successfully saved, avoiding rate limits.

* **Corrupted Session Files:**
  If the `.session` database file gets locked or corrupted, the program will crash.
  *Solution:* The scraper automatically detects session errors, deletes the broken session file, and resets it so you can log in again.

* **Two-Factor Authentication (2FA):**
  If your Telegram account has 2FA enabled, simple OTP login fails.
  *Solution:* We built a multi-stage login system that supports standard phone number OTP and prompts you for your 2FA password if needed.

* **Channel Bans or Deletion:**
  If a channel you are monitoring gets banned, deleted, or you are kicked out, the code might crash trying to fetch it.
  *Solution:* The scraper wraps entity checks in protective checks. If a channel is inaccessible, it logs a warning but keeps running without crashing.

---

### 🧠 LLM and AI Processing Issues

* **LLM Timeouts (Slow Local CPU):**
  Running a local AI model on a CPU is slow and can time out.
  *Solution:* We increased the connection timeout to 120 seconds. If the AI still fails or times out, the backend immediately falls back to a deterministic regex parser to extract URLs and IOCs without using the AI.

* **Broken AI Output:**
  The AI might output corrupted JSON text that standard JSON libraries cannot parse.
  *Solution:* We use validation checks. If the JSON is invalid, the system automatically falls back to regex extractors to parse the data safely.

* **Empty Scrapes:**
  If no new messages were scraped, calling the LLM wastes CPU and API tokens.
  *Solution:* The scheduler checks message counts first. If there are 0 new messages, it skips the LLM analysis entirely.

---

### 📋 Data and PDF Report Issues

* **Pipes "|" in Chat Messages:**
  If a chat message contains the pipe symbol `|`, it breaks markdown tables.
  *Solution:* We parse tables using a regex that splits columns only on actual structural boundaries and ignores escaped pipes (`\|`).

* **PDF Layout Crashes:**
  If table rows have different numbers of columns, the ReportLab PDF builder crashes.
  *Solution:* The PDF builder normalizes all rows. It pads shorter rows with blank spaces and merges extra columns back into the text body.

* **Time Zone Differences:**
  Using UTC dates makes scrapers and files save on the wrong day depending on local time.
  *Solution:* We synchronized all scrapers, file partitions, daily report names, and schedulers to India Standard Time (IST, UTC+5:30).

* **Duplicate Threat Data:**
  If the same link, wallet, or IP address is posted multiple times, it creates duplicates in the reports.
  *Solution:* The daily JSON database merges duplicates, increments the Mention Count, and updates the Last Seen timestamp.
