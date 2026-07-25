"""Analysis agent package.

Purpose:
    Host the report-generation pipeline that turns scraped Telegram messages
    into hourly, daily, and combined Markdown reports.
Responsibilities:
    Keep report-generation logic separate from scraping and persistence.
Dependencies:
    The scheduled scrape repository and standard library file handling.
"""

from .report_agent import AnalysisReportAgent

__all__ = ["AnalysisReportAgent"]
