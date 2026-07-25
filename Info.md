Recommended flow
Telegram scraping stays as-is.
Every hour, a report job reads the new messages collected since the last analysis checkpoint.
The LLM analyzes each channel separately.
The result is saved as Markdown for that channel.
At the end of the day, a daily report is generated per channel.
A combined daily report is also generated across all channels.
Where this fits in your code
Scrape and persist messages: [`backend/app/scheduler/scheduler_service.py`](c:/Users/Admin/Desktop/darknet-monitor/backend/app/scheduler/scheduler_service.py)
Message storage and CSV export: [`backend/app/scheduler/scrape_repository.py`](c:/Users/Admin/Desktop/darknet-monitor/backend/app/scheduler/scrape_repository.py)
Raw message normalization: [`backend/app/scheduler/message_collector.py`](c:/Users/Admin/Desktop/darknet-monitor/backend/app/scheduler/message_collector.py)
Best architecture
Add a new analysis serviceCreate something like:backend/app/analysis/analysis_service.py
backend/app/analysis/report_repository.py
backend/app/analysis/report_scheduler.py

This service should not scrape Telegram.
It should only read already stored messages.

Track analysis checkpointsStore, per channel:last analyzed message ID
last analysis time
hourly report path
daily report path

That way the LLM only processes new data.

Generate hourly channel reportsEvery hour, for each enabled channel:load messages since last analysis checkpoint
summarize topics
detect shared links
extract entities like company names, countries, people, products
classify tone and suspiciousness
write/update a .md file


Generate daily channel reportsAt the end of the day:produce one markdown file per channel
include:what they talked about
important links
named entities
possible suspicious discussion
short conclusion
evidence snippets



Generate one combined reportMerge all channel analyses into one daily summary.
This report should answer:which channels were most active
what topics were repeated
whether any cross-channel coordination exists
which links/entities appeared across multiple channels


Suggested storage layout
reports/hourly/<channel_id>.md
reports/daily/<channel_id>/YYYY-MM-DD.md
reports/daily/combined/YYYY-MM-DD.md
Suggested MongoDB collections
analysis_state
analysis_results
analysis_daily_reports
What the LLM should extract
Main discussion topic
Topic drift over time
Shared URLs
Companies mentioned
Countries mentioned
People/organizations mentioned
Possible coordination signals
Suspiciousness score
Short conclusion
Important implementation detail
Do not send the entire database to the LLM every hour.
Send only the delta since the last checkpoint.
Keep a rolling context window per channel.
Good report format
Title
Time range
Summary
Topics discussed
Links shared
Entities mentioned
Suspicious indicators
Conclusion
Evidence excerpts
How to hook it into your current system
After save_messages() in [`backend/app/scheduler/scrape_repository.py`](c:/Users/Admin/Desktop/darknet-monitor/backend/app/scheduler/scrape_repository.py), record the latest message ID.
Add an analysis job that reads from telegram_messages.
Add a scheduler tick that runs every hour.
Add a daily rollup job at a fixed end-of-day time.
Expose reports through a backend endpoint like:GET /api/reports/hourly
GET /api/reports/daily
GET /api/reports/combined

Practical recommendation
Start with hourly per-channel summaries.
Then add daily per-channel reports.
Then add the combined daily report.
Finally, add a UI page to list and open the .md reports.
One caution
If you want the LLM to judge “suspicious or not,” keep it advisory.
Store “possible suspicious indicators” and a confidence/risk score, not a hard legal conclusion.