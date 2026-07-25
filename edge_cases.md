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

* **Network Disconnections during Scraping:**
  If the internet drops while a scrape task is running, the client gets stuck.
  *Solution:* Scrapers run inside try-except blocks. If a connection error occurs, the scraper logs the error and resets the channel status back to "idle" so the scheduler is never blocked.

* **Manually Deleted Data Directories:**
  If a user deletes the `data/` or channel CSV folder while the server is active.
  *Solution:* All folder writes check and create parent folders on the fly using `mkdir(parents=True, exist_ok=True)`.

* **Local LLM Service Offline:**
  If Ollama is shut down, closed, or not listening on port 11434, calls will fail.
  *Solution:* Backend catches requests connection errors immediately and runs the regex fallback threat extractor so you still get structured threat metrics.

---

### 🧪 Automated Test Verification and Proofs

We have created unit tests inside the `backend/tests/` folder to prove that these edge cases are solved:
1. **`test_llm_offline_fallback`**: Simulates the local LLM being offline by throwing a connection error and verifies that the system successfully falls back to regex parser rules.
2. **`test_data_directory_recreation`**: Proves that if data folders are missing or deleted, writing messages automatically recreates them on the fly.
3. **`test_scraper_resilience_on_error`**: Simulates a network drop during scraping and proves that the monitored channel state is reset to `"idle"` rather than getting locked.
4. **`test_ledger_url_deduplication`**: Verifies that duplicate links are merged correctly and their mention count increments statefully.


