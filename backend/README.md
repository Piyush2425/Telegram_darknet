# Darknet Monitor

Darknet Monitor is a web-based Telegram OSINT tool for monitoring channels, scraping messages, and exporting member data. The repository is split into a Flask backend and a static frontend dashboard.

## Project Layout

- `backend/` - Flask API and Telegram scraping logic
- `frontend/` - Static dashboard UI that talks to the backend API

## Features

- Add and manage Telegram channels for monitoring
- Scrape messages from channels
- Extract member lists from channels
- Secure credential storage with encryption
- RESTful API for frontend integration
- Continuous per-group Telegram monitoring with independent intervals
- Incremental LLM analysis memory and daily PDF report generation

## Requirements

- Python 3.10+
- Telegram API credentials (API ID and API Hash)

## Environment Variables

Create a `backend/.env` file for local development:

```env
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your_api_hash_here
TELEGRAM_PHONE=+15551234567
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=darknet_monitor
TELEGRAM_SESSION_PATH=C:\Users\you\.darknet_monitor\darknet_monitor
TELEGRAM_SCHEDULER_TIME=02:00
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
```

The backend loads `backend/.env` automatically on startup without needing extra packages.
If `OPENAI_API_KEY` is not set, the analysis agent falls back to deterministic rule-based summaries and still writes Markdown/PDF artifacts.

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd darknet-monitor/backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Install the package in development mode:
   ```bash
   pip install -e .
   ```

5. Create `backend/.env` using the template above.

## Usage

1. Start the API server from the `backend` folder:
   ```bash
   python src/darknet_monitor/api.py
   ```

2. Open the frontend by serving `frontend/public` with any static server. For example, from the project root:
   ```bash
   python -m http.server 8000 --directory frontend/public
   ```

3. Visit `http://localhost:8000` in your browser.

4. The backend API will be available at `http://localhost:5000`

## How To Use

1. Make sure `backend/.env` contains your Telegram credentials.
2. Start the backend.
3. Open the frontend dashboard.
4. If you want, you can still use the Credentials tab to store values in the app's local config file instead of `.env`.
5. Add a Telegram channel link such as `https://t.me/channelname`.
6. Use the per-channel actions to scrape messages or members.
7. Exported CSV files are written to `~/.darknet_monitor/output`.

## Continuous Monitoring

Continuous monitoring is now group-scoped instead of being a single shared loop.

- Each discovered Telegram group can have its own `interval_minutes` value stored in MongoDB.
- The scheduler polls enabled groups and launches per-group workers when a group is due.
- Scraping is incremental. Each run resumes after the last saved `message_id` checkpoint.
- One group's scrape or analysis failure does not block the other groups.
- Group status is persisted in MongoDB and exposed through the API and frontend.

The monitored state is stored on the entity document, while message checkpoints remain in `telegram_scrape_state`.

## Analysis Flow

After each incremental scrape:

1. New messages are persisted to MongoDB and CSV.
2. The analysis agent builds an incremental Markdown memory file under `Reports/memory/`.
3. A per-group hourly Markdown report is written under `Reports/hourly/<group>/`.
4. The daily Markdown rollup is refreshed under `Reports/daily/<group>/`.
5. A daily PDF report is generated under `Reports/pdf/<group>/`.

If OpenAI credentials are available, the analysis agent uses the configured chat model to summarize the new slice. If not, it falls back to local rule-based summarization so the pipeline still produces artifacts.

## Report Layout

Generated artifacts use this layout:

- `Reports/memory/<group>.md`
- `Reports/hourly/<group>/<YYYY-MM-DD_HHMM>.md`
- `Reports/daily/<group>/<YYYY-MM-DD>.md`
- `Reports/pdf/<group>/<YYYY-MM-DD>.pdf`
- `Reports/combined/<YYYY-MM-DD>.md`

The frontend reads these through `/api/reports`, `/api/reports/content`, and the per-group report endpoints.

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/credentials` - Save API credentials
- `GET /api/credentials` - Check if credentials are loaded
- `POST /api/initialize` - Initialize Telegram client
- `POST /api/channels` - Add a new channel
- `GET /api/channels` - List all channels
- `DELETE /api/channels/<channel_id>` - Remove a channel
- `POST /api/channels/<channel_id>/scrape/messages` - Scrape messages
- `POST /api/channels/<channel_id>/scrape/members` - Scrape members
- `GET /api/telegram-entities/monitoring` - List monitored groups and their status
- `PUT /api/telegram-entities/<telegram_id>/interval` - Update a group scrape interval
- `POST /api/telegram-entities/<telegram_id>/monitor/start` - Start monitoring a group
- `POST /api/telegram-entities/<telegram_id>/monitor/stop` - Stop monitoring a group
- `GET /api/telegram-entities/<telegram_id>/status` - Read current group status
- `GET /api/telegram-entities/<telegram_id>/memory` - Fetch the group knowledge base Markdown
- `GET /api/telegram-entities/<telegram_id>/reports` - List group report artifacts
- `POST /api/telegram-entities/<telegram_id>/reports/generate` - Regenerate the group report
- `GET /api/telegram-entities/<telegram_id>/reports/download?path=...` - Download a group report file
- `GET /api/reports` - List all report artifacts
- `GET /api/reports/content?path=...` - Read Markdown report content
- `GET /api/reports/download?path=...` - Download any report artifact

## Security

Credentials are stored in an encrypted format in `~/.darknet_monitor/config.enc`. In a production environment, you should implement proper encryption using the `cryptography` library.

## Current Status

The project now includes:

- a working Flask API entry point
- a frontend dashboard script at `frontend/public/app.js`
- channel management, credential storage, and scrape actions wired into the UI
- a native HTML/CSS/JavaScript Telegram Explorer that discovers account-accessible groups and
  channels without downloading messages

## Telegram Explorer

Telegram Explorer uses the Telethon Client API and the existing authorized user
session. It ignores users, Saved Messages, and secret chats, then upserts groups,
supergroups, and channels into MongoDB's `telegram_entities` collection. Refreshes
also write a complete CSV snapshot ordered by entity title.

Add MongoDB settings to `backend/.env` if the defaults are not appropriate:

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=darknet_monitor
# Optional overrides:
# TELEGRAM_SESSION_PATH=C:\Users\you\.darknet_monitor\darknet_monitor
# TELEGRAM_ENTITIES_CSV=C:\Users\you\.darknet_monitor\output\telegram_entities.csv
```

Install dependencies and start the Flask API from `backend`:

```bash
pip install -r requirements.txt
python src/darknet_monitor/api.py
```

Serve `frontend/public` as described in the Usage section and open the Telegram
Explorer tab in the existing dashboard.

The session must already be authorized. The dashboard intentionally does not
request login codes or two-factor passwords. Use the existing Telegram login flow
once if Explorer reports an invalid session.

The future Telegram Monitor can load its targets through
`MongoEntityRepository.list_enabled()`, which returns only documents where
`enabled == true`.

## Verification

After making changes, verify the feature locally with:

```bash
python -m py_compile src/darknet_monitor/api.py app/scheduler/scheduler_service.py app/agent/report_agent.py app/explorer/entity_repository.py app/scheduler/scrape_repository.py
```

From the frontend directory:

```bash
npm run build
```

Then exercise the feature in the browser:

1. Discover or load Telegram entities.
2. Open `Monitoring` and start one group.
3. Set a custom interval in minutes and save it.
4. Confirm the status panel shows last scrape, next scrape, and last analysis.
5. Trigger a scrape and confirm `Reports/memory/`, `Reports/daily/`, and `Reports/pdf/` are updated.
6. Open the Reports page and confirm the daily PDF is listed and downloadable.

## Notes

- The dashboard expects the backend to run on `http://localhost:5000`.
- Telegram scraping requires valid Telegram API credentials and may require authorization from your Telegram account.

## License

This project is licensed under the MIT License.
