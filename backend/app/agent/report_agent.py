"""Telegram analysis report agent.

Purpose:
    Convert scraped channel messages into LLM-written hourly Markdown reports,
    then synthesize daily and combined reports from those saved Markdown files.
Responsibilities:
    Read stored Telegram messages, prepare source context for the LLM, persist
    the hourly channel analysis into ``Reports/``, and roll those hourly
    reports into daily and combined summaries.
Dependencies:
    The scheduled scrape repository, optional OpenAI SDK integration, and the
    Python standard library.
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from app.scheduler.scrape_repository import TelegramGroupScrapeRepository

IST = timezone(timedelta(hours=5, minutes=30))
UTC = timezone.utc

DEFAULT_STOPWORDS = {
    "about",
    "after",
    "again",
    "also",
    "and",
    "are",
    "been",
    "before",
    "because",
    "being",
    "between",
    "both",
    "but",
    "can",
    "could",
    "did",
    "does",
    "doing",
    "during",
    "each",
    "for",
    "from",
    "had",
    "has",
    "have",
    "here",
    "into",
    "just",
    "like",
    "made",
    "make",
    "more",
    "most",
    "much",
    "not",
    "now",
    "only",
    "other",
    "our",
    "over",
    "said",
    "same",
    "some",
    "than",
    "that",
    "the",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "too",
    "under",
    "very",
    "was",
    "were",
    "what",
    "when",
    "where",
    "which",
    "while",
    "with",
    "will",
    "would",
    "you",
    "your",
}

SUSPICIOUS_KEYWORDS = {
    "wallet": 4,
    "drain": 4,
    "phish": 5,
    "phishing": 5,
    "leak": 3,
    "dump": 3,
    "exploit": 4,
    "rce": 4,
    "zero-day": 4,
    "zeroday": 4,
    "credential": 4,
    "login": 2,
    "otp": 3,
    "password": 3,
    "steal": 4,
    "scam": 5,
    "malware": 4,
    "botnet": 4,
    "ransomware": 5,
    "ddos": 3,
    "proxy": 2,
    "vpn": 2,
    "crypto": 2,
    "btc": 2,
    "usdt": 2,
    "telegram": 1,
    "api": 1,
    "key": 1,
    "token": 1,
}

COUNTRY_KEYWORDS = {
    "afghanistan", "albania", "algeria", "argentina", "australia", "austria", "bangladesh",
    "belgium", "brazil", "canada", "china", "egypt", "france", "germany", "india", "iran",
    "iraq", "israel", "italy", "japan", "malaysia", "mexico", "netherlands", "pakistan",
    "poland", "russia", "saudi arabia", "singapore", "south africa", "spain", "sweden",
    "switzerland", "turkey", "uae", "uk", "united kingdom", "united states", "usa", "us",
    "ukraine", "vietnam",
}

LINK_PATTERN = re.compile(r"https?://[^\s<>()\"']+", re.IGNORECASE)
WORD_PATTERN = re.compile(r"\b[\w'-]{3,}\b", re.UNICODE)
CAPITALIZED_PATTERN = re.compile(r"\b(?:[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){0,3})\b")


@dataclass(frozen=True)
class ReportSummary:
    """Structured analysis generated from a message batch."""

    title: str
    time_range: str
    message_count: int
    active_senders: list[tuple[str, int]]
    topics: list[tuple[str, int]]
    links: list[tuple[str, int]]
    entities: list[tuple[str, int]]
    suspicious_score: int
    suspicious_reasons: list[str]
    conclusion: str
    evidence: list[str]
    llm_summary: str | None = None


class AnalysisReportAgent:
    """Generate hourly, daily, and combined Markdown reports."""

    def __init__(self, scrape_repository: TelegramGroupScrapeRepository, report_root: Path) -> None:
        self._scrape_repository = scrape_repository
        self._report_root = report_root
        self._state_path = self._report_root / ".analysis_state.json"
        self._report_root.mkdir(parents=True, exist_ok=True)
        (self._report_root / "hourly").mkdir(parents=True, exist_ok=True)
        (self._report_root / "daily").mkdir(parents=True, exist_ok=True)
        (self._report_root / "combined").mkdir(parents=True, exist_ok=True)
        (self._report_root / "memory").mkdir(parents=True, exist_ok=True)
        (self._report_root / "pdf").mkdir(parents=True, exist_ok=True)
        self._state = self._load_state()

    def _load_state(self) -> dict[str, Any]:
        if not self._state_path.exists():
            return {"channels": {}, "combined": {}, "groups": {}}
        try:
            data = json.loads(self._state_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data.setdefault("channels", {})
                data.setdefault("combined", {})
                data.setdefault("groups", {})
                return data
        except Exception:
            pass
        return {"channels": {}, "combined": {}, "groups": {}}

    def _save_state(self) -> None:
        temporary = self._state_path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(self._state, indent=2, ensure_ascii=False), encoding="utf-8")
        temporary.replace(self._state_path)

    @staticmethod
    def _slugify(value: str | None) -> str:
        cleaned = "".join(character if character.isalnum() or character in ("-", "_") else "_" for character in str(value or "channel")).strip("_")
        return cleaned or "channel"

    def _group_slug(self, entity: Mapping[str, Any]) -> str:
        return self._slugify(self._entity_title(entity))

    def _memory_path(self, slug: str) -> Path:
        return self._report_root / "memory" / f"{slug}.md"

    def _daily_markdown_path(self, slug: str, day_date: date) -> Path:
        return self._report_root / "daily" / slug / f"{day_date.isoformat()}.md"

    def _daily_pdf_path(self, slug: str, day_date: date) -> Path:
        return self._report_root / "pdf" / slug / f"{day_date.isoformat()}.pdf"

    def _hourly_path(self, slug: str, stamp: datetime) -> Path:
        return self._report_root / "hourly" / slug / f"{stamp.date().isoformat()}_{stamp.strftime('%H%M')}.md"

    @staticmethod
    def _to_ist(value: datetime) -> datetime:
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(IST)

    @staticmethod
    def _start_of_hour(value: datetime) -> datetime:
        return value.replace(minute=0, second=0, microsecond=0)

    @staticmethod
    def _start_of_day(value: datetime) -> datetime:
        return value.replace(hour=0, minute=0, second=0, microsecond=0)

    @staticmethod
    def _fmt_dt(value: datetime | None) -> str:
        if value is None:
            return "Unknown"
        return AnalysisReportAgent._to_ist(value).strftime("%Y-%m-%d %H:%M:%S IST")

    @staticmethod
    def _escape_md(value: Any) -> str:
        return str(value).replace("|", "\\|").replace("\n", " ").strip()

    @staticmethod
    def _message_text(message: Mapping[str, Any]) -> str:
        return str(message.get("text") or message.get("message_text") or "").strip()

    @classmethod
    def _message_time(cls, message: Mapping[str, Any]) -> datetime | None:
        raw = message.get("created_at") or message.get("message_date") or message.get("date")
        if isinstance(raw, datetime):
            return raw
        if isinstance(raw, str) and raw:
            try:
                parsed = datetime.fromisoformat(raw)
                return parsed
            except ValueError:
                return None
        return None

    @classmethod
    def _message_ts_ist(cls, message: Mapping[str, Any]) -> str:
        timestamp = cls._message_time(message)
        return cls._fmt_dt(timestamp) if timestamp else "Unknown"

    @classmethod
    def _collect_links(cls, messages: Iterable[Mapping[str, Any]]) -> Counter[str]:
        counter: Counter[str] = Counter()
        for message in messages:
            text = cls._message_text(message)
            urls = list(message.get("urls") or [])
            urls.extend(LINK_PATTERN.findall(text))
            for url in urls:
                counter[url.strip()] += 1
        return counter

    @classmethod
    def _collect_words(cls, messages: Iterable[Mapping[str, Any]]) -> Counter[str]:
        counter: Counter[str] = Counter()
        for message in messages:
            text = cls._message_text(message).lower()
            for token in WORD_PATTERN.findall(text):
                token = token.lower()
                if token in DEFAULT_STOPWORDS:
                    continue
                if token.isdigit():
                    continue
                counter[token] += 1
        return counter

    @classmethod
    def _collect_entities(cls, messages: Iterable[Mapping[str, Any]]) -> Counter[str]:
        counter: Counter[str] = Counter()
        for message in messages:
            text = cls._message_text(message)
            for match in CAPITALIZED_PATTERN.findall(text):
                cleaned = match.strip()
                if len(cleaned) < 3:
                    continue
                counter[cleaned] += 1

            lower_text = text.lower()
            for country in COUNTRY_KEYWORDS:
                if country in lower_text:
                    counter[country.title()] += 1
        return counter

    @classmethod
    def _collect_senders(cls, messages: Iterable[Mapping[str, Any]]) -> Counter[str]:
        counter: Counter[str] = Counter()
        for message in messages:
            sender = message.get("sender_name") or message.get("sender_username") or message.get("sender") or "Unknown"
            counter[str(sender)] += 1
        return counter

    @classmethod
    def _score_suspicion(cls, messages: Iterable[Mapping[str, Any]]) -> tuple[int, list[str]]:
        score = 0
        reasons: list[str] = []
        for message in messages:
            text = cls._message_text(message).lower()
            for keyword, weight in SUSPICIOUS_KEYWORDS.items():
                if keyword in text:
                    score += weight
                    reasons.append(f"Keyword match: {keyword}")
            urls = list(message.get("urls") or [])
            if urls:
                score += min(len(urls), 2)
                reasons.append("Shared URL(s) detected")
            if "http://" in text or "https://" in text:
                score += 1
        unique_reasons = []
        seen = set()
        for reason in reasons:
            if reason in seen:
                continue
            seen.add(reason)
            unique_reasons.append(reason)
        return score, unique_reasons[:6]

    @classmethod
    def _build_evidence(cls, messages: Iterable[Mapping[str, Any]], limit: int = 5) -> list[str]:
        evidence: list[str] = []
        for message in list(messages)[:limit]:
            ts = cls._message_ts_ist(message)
            sender = message.get("sender_name") or message.get("sender_username") or message.get("sender") or "Unknown"
            text = cls._message_text(message)
            if len(text) > 220:
                text = text[:217] + "..."
            evidence.append(f"- [{ts}] {sender}: {text}")
        return evidence

    def _build_transcript(self, messages: list[dict[str, Any]], limit: int = 60) -> str:
        transcript_lines: list[str] = []
        for message in messages[:limit]:
            sender = message.get("sender_name") or message.get("sender_username") or message.get("sender") or "Unknown"
            ts = self._message_ts_ist(message)
            text = self._message_text(message)
            if len(text) > 320:
                text = text[:317] + "..."
            transcript_lines.append(f"[{ts}] {sender}: {text}")
        return "\n".join(transcript_lines) if transcript_lines else "No messages available."

    def _llm_text(self, system_message: str, user_message: str) -> str | None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        try:
            from openai import OpenAI  # type: ignore
        except Exception:
            return None

        model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
        try:
            client = OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.2,
            )
            content = response.choices[0].message.content
            return content.strip() if content else None
        except Exception:
            return None

    def _llm_hourly_report(
        self,
        title: str,
        messages: list[dict[str, Any]],
        facts: ReportSummary,
        start: datetime | None,
        end: datetime | None,
    ) -> str | None:
        transcript = self._build_transcript(messages)
        system_message = (
            "You are an intelligence analysis assistant. Write a clean markdown report from the provided Telegram messages. "
            "Use only the source material. Do not invent facts. "
            "Focus on what the channel is discussing, shared links, named entities, suspicious indicators, and a short analyst conclusion. "
            "Keep the output concise but useful. "
            "Use markdown headings and bullet points."
        )
        user_message = f"""
Channel: {title}
Scope: hourly
Time window: {self._fmt_dt(start)} - {self._fmt_dt(end)}
Message count: {facts.message_count}
Top topics: {", ".join(term for term, _ in facts.topics[:8]) or "None"}
Top entities: {", ".join(term for term, _ in facts.entities[:8]) or "None"}
Shared links: {", ".join(link for link, _ in facts.links[:8]) or "None"}
Suspicion score: {facts.suspicious_score}

Source messages:
{transcript}

Write markdown with these sections:
# Hourly Analysis
## Summary
## What the channel is discussing
## Links shared
## Entities mentioned
## Suspicious indicators
## Analyst conclusion
## Evidence
""".strip()
        return self._llm_text(system_message, user_message)

    def _llm_report_from_documents(
        self,
        title: str,
        scope: str,
        documents: list[str],
        metadata_lines: list[str],
    ) -> str | None:
        if not documents:
            return None
        metadata_text = "\n".join(f"- {line}" for line in metadata_lines) if metadata_lines else "- None"
        source_reports = "\n".join(
            f"--- REPORT {index + 1} ---\n{document}" for index, document in enumerate(documents)
        )
        system_message = (
            "You are an intelligence analysis assistant. Synthesize the provided markdown reports into a clean markdown summary. "
            "Use only the supplied documents. Do not invent facts. "
            "Preserve the key themes, links, entities, suspicious indicators, and conclusions. "
            "If the documents are thin or contradictory, say so explicitly."
        )
        user_message = (
            f"Title: {title}\n"
            f"Scope: {scope}\n\n"
            f"Metadata:\n{metadata_text}\n\n"
            f"Source reports:\n{source_reports}\n\n"
            f"Write markdown with these sections:\n"
            f"# {scope.title()} Report\n"
            "## Summary\n"
            "## What changed since the last run\n"
            "## Links shared\n"
            "## Entities mentioned\n"
            "## Suspicious indicators\n"
            "## Analyst conclusion\n"
            "## Evidence"
        )
        return self._llm_text(system_message, user_message)

    def _summarize(self, title: str, scope: str, messages: list[dict[str, Any]], start: datetime | None, end: datetime | None) -> ReportSummary:
        message_count = len(messages)
        if message_count == 0:
            return ReportSummary(
                title=title,
                time_range=f"{self._fmt_dt(start)} - {self._fmt_dt(end)}",
                message_count=0,
                active_senders=[],
                topics=[],
                links=[],
                entities=[],
                suspicious_score=0,
                suspicious_reasons=[],
                conclusion="No new messages were available for this window.",
                evidence=[],
                llm_summary=None,
            )

        senders = self._collect_senders(messages)
        topics = self._collect_words(messages).most_common(10)
        links = self._collect_links(messages).most_common(10)
        entities = self._collect_entities(messages).most_common(12)
        suspicious_score, suspicious_reasons = self._score_suspicion(messages)

        if suspicious_score >= 15:
            conclusion = "High-risk discussion pattern detected. Review the linked sources, entities, and sender activity."
        elif suspicious_score >= 7:
            conclusion = "Moderate-risk discussion pattern detected. Review for recurring suspicious links or operational language."
        elif links or entities:
            conclusion = "The channel is active and shares structured references, but the discussion is not strongly suspicious from the current window."
        else:
            conclusion = "The channel appears active but low-signal for suspicious behavior in the current analysis window."

        facts = ReportSummary(
            title=title,
            time_range=f"{self._fmt_dt(start)} - {self._fmt_dt(end)}",
            message_count=message_count,
            active_senders=senders.most_common(8),
            topics=topics,
            links=links,
            entities=entities,
            suspicious_score=suspicious_score,
            suspicious_reasons=suspicious_reasons,
            conclusion=conclusion,
            evidence=self._build_evidence(messages),
        )
        llm_summary = self._llm_text(
            "You are an intelligence analysis assistant. Write a concise markdown summary from the supplied metrics. "
            "Do not invent facts. Keep it short and actionable.",
            f"""
Title: {title}
Scope: {scope}
Time range: {facts.time_range}
Message count: {facts.message_count}
Topics: {', '.join(term for term, _ in facts.topics[:8]) or 'None'}
Links: {', '.join(link for link, _ in facts.links[:8]) or 'None'}
Entities: {', '.join(term for term, _ in facts.entities[:8]) or 'None'}
Suspicion score: {facts.suspicious_score}
Reasons: {', '.join(facts.suspicious_reasons) or 'None'}
Conclusion hint: {facts.conclusion}
""".strip(),
        )
        return ReportSummary(**{**facts.__dict__, "llm_summary": llm_summary})

    def _render_report(self, report: ReportSummary, scope: str) -> str:
        lines = [
            f"# {scope.title()} Report: {report.title}",
            "",
            f"- Time range: {report.time_range}",
            f"- Messages analyzed: {report.message_count}",
            f"- Suspicion score: {report.suspicious_score}",
            "",
            "## Summary",
            report.llm_summary or report.conclusion,
            "",
            "## Topics",
        ]

        if report.topics:
            lines.extend(f"- {self._escape_md(term)} ({count})" for term, count in report.topics)
        else:
            lines.append("- No strong recurring topic detected.")

        lines.extend(["", "## Links Shared"])
        if report.links:
            lines.extend(f"- {self._escape_md(link)} ({count})" for link, count in report.links)
        else:
            lines.append("- No links shared in this window.")

        lines.extend(["", "## Entities Mentioned"])
        if report.entities:
            lines.extend(f"- {self._escape_md(entity)} ({count})" for entity, count in report.entities)
        else:
            lines.append("- No notable company/country/person mentions detected.")

        lines.extend(["", "## Active Senders"])
        if report.active_senders:
            lines.extend(f"- {self._escape_md(sender)} ({count} messages)" for sender, count in report.active_senders)
        else:
            lines.append("- No sender activity recorded.")

        lines.extend(["", "## Suspicious Indicators"])
        if report.suspicious_reasons:
            lines.extend(f"- {reason}" for reason in report.suspicious_reasons)
        else:
            lines.append("- No suspicious indicators detected in the current window.")

        lines.extend(["", "## Conclusion", report.conclusion, "", "## Evidence"])
        if report.evidence:
            lines.extend(report.evidence)
        else:
            lines.append("- No evidence snippets available.")

        lines.append("")
        return "\n".join(lines)

    def _write_markdown(self, path: Path, report: ReportSummary, scope: str) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(self._render_report(report, scope), encoding="utf-8")
        temporary.replace(path)
        return path

    def _write_raw_markdown(self, path: Path, content: str) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(content.strip() + "\n", encoding="utf-8")
        temporary.replace(path)
        return path

    def _append_memory_block(self, path: Path, block: str) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        existing = ""
        if path.exists():
            try:
                existing = path.read_text(encoding="utf-8").rstrip()
            except Exception:
                existing = ""
        content = (existing + "\n\n" + block.strip()).strip() + "\n"
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(content, encoding="utf-8")
        temporary.replace(path)
        return path

    @staticmethod
    def _markdown_to_plain_lines(markdown_text: str) -> list[str]:
        lines: list[str] = []
        for raw_line in markdown_text.splitlines():
            line = raw_line.rstrip()
            if not line:
                lines.append("")
                continue
            line = re.sub(r"^#{1,6}\s*", "", line)
            line = line.replace("**", "").replace("__", "")
            line = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1 (\2)", line)
            line = line.replace("`", "")
            lines.append(line)
        return lines

    def _write_pdf_report(self, pdf_path: Path, title: str, markdown_text: str) -> Path:
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = pdf_path.with_suffix(".pdf.tmp")
        lines = [title, ""] + self._markdown_to_plain_lines(markdown_text)
        page_width, page_height = letter
        margin_x = 48
        margin_y = 48
        font_name = "Helvetica"
        font_size = 10
        leading = 13
        usable_width = page_width - margin_x * 2
        text_width = usable_width

        def wrap_line(text: str) -> list[str]:
            if not text:
                return [""]
            words = text.split()
            if not words:
                return [""]
            wrapped: list[str] = []
            current = words[0]
            for word in words[1:]:
                candidate = f"{current} {word}"
                if stringWidth(candidate, font_name, font_size) <= text_width:
                    current = candidate
                else:
                    wrapped.append(current)
                    current = word
            wrapped.append(current)
            return wrapped

        c = canvas.Canvas(str(temporary), pagesize=letter)
        y = page_height - margin_y
        c.setTitle(title)
        c.setAuthor("Darknet Monitor")
        c.setFont(font_name, 14)
        c.drawString(margin_x, y, title[:120])
        y -= 24
        c.setFont(font_name, font_size)
        for line in lines[1:]:
            paragraphs = wrap_line(line) if line else [""]
            for paragraph in paragraphs:
                if y < margin_y:
                    c.showPage()
                    c.setFont(font_name, font_size)
                    y = page_height - margin_y
                c.drawString(margin_x, y, paragraph[:220])
                y -= leading
            if not line:
                y -= 2
        c.save()
        temporary.replace(pdf_path)
        return pdf_path

    def _channel_hourly_paths(self, slug: str, day_date: date) -> list[Path]:
        hourly_root = self._report_root / "hourly" / slug
        if not hourly_root.exists():
            return []
        return sorted(hourly_root.glob(f"{day_date.isoformat()}_*.md"))

    def _read_documents(self, paths: list[Path]) -> list[str]:
        documents: list[str] = []
        for path in paths:
            try:
                documents.append(path.read_text(encoding="utf-8"))
            except Exception:
                continue
        return documents

    def _entity_title(self, entity: Mapping[str, Any]) -> str:
        return str(entity.get("title") or entity.get("username") or entity.get("telegram_id"))

    def _channel_window(self, scraped_at: datetime | None) -> tuple[datetime, datetime]:
        current = self._to_ist(scraped_at or datetime.now(UTC))
        hour_start = self._start_of_hour(current)
        return hour_start.astimezone(UTC), current.astimezone(UTC)

    def _daily_window(self, scraped_at: datetime | None) -> tuple[datetime, datetime, date]:
        current = self._to_ist(scraped_at or datetime.now(UTC))
        day_start = self._start_of_day(current)
        return day_start.astimezone(UTC), current.astimezone(UTC), current.date()

    def _render_incremental_block(
        self,
        title: str,
        messages: list[dict[str, Any]],
        summary: ReportSummary,
        scraped_at: datetime | None,
        last_message_id: int | None,
    ) -> str:
        current = self._to_ist(scraped_at or datetime.now(UTC))
        lines = [
            f"## {current.strftime('%Y-%m-%d %H:%M')} IST",
            "",
            f"- Messages analyzed: {summary.message_count}",
            f"- Last message ID: {last_message_id if last_message_id is not None else 'Unknown'}",
            f"- Suspicion score: {summary.suspicious_score}",
            "",
            "### Main Topics",
        ]
        if summary.topics:
            lines.extend(f"- {self._escape_md(term)} ({count})" for term, count in summary.topics[:8])
        else:
            lines.append("- No strong recurring topic detected.")
        lines.extend(["", "### Important Links"])
        if summary.links:
            lines.extend(f"- {self._escape_md(link)} ({count})" for link, count in summary.links[:8])
        else:
            lines.append("- No links shared in this window.")
        lines.extend(["", "### Named Entities"])
        if summary.entities:
            lines.extend(f"- {self._escape_md(entity)} ({count})" for entity, count in summary.entities[:10])
        else:
            lines.append("- No notable entities detected.")
        lines.extend(["", "### Suspicious or Noteworthy Signals"])
        if summary.suspicious_reasons:
            lines.extend(f"- {reason}" for reason in summary.suspicious_reasons)
        else:
            lines.append("- No noteworthy suspicious indicators in this slice.")
        lines.extend(["", "### Analyst Conclusion", summary.llm_summary or summary.conclusion, "", "### Evidence Snippets"])
        if summary.evidence:
            lines.extend(summary.evidence)
        else:
            lines.append("- No evidence snippets available.")
        lines.extend(["", "---", ""])
        return "\n".join(lines)

    def _normalize_window_messages(self, messages: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
        normalized = [dict(message) for message in messages]
        normalized.sort(key=lambda item: (item.get("message_id") or 0, item.get("created_at") or ""))
        return normalized

    def _update_group_artifacts(
        self,
        entity: Mapping[str, Any],
        messages: list[dict[str, Any]],
        scraped_at: datetime | None = None,
        source: str = "scrape",
    ) -> dict[str, Any]:
        telegram_id = int(entity["telegram_id"])
        title = self._entity_title(entity)
        slug = self._group_slug(entity)
        current_ist = self._to_ist(scraped_at or datetime.now(UTC))
        day_start_utc, day_end_utc, day_date = self._daily_window(scraped_at)
        hour_start_utc, hour_end_utc = self._channel_window(scraped_at)

        normalized_messages = self._normalize_window_messages(messages)
        summary = self._summarize(title, source, normalized_messages, hour_start_utc, hour_end_utc)
        last_message_id = max((int(message.get("message_id") or 0) for message in normalized_messages), default=None)

        hourly_path = self._hourly_path(slug, current_ist)
        hourly_content = self._render_report(summary, "Hourly") if not normalized_messages else (
            self._llm_hourly_report(title, normalized_messages, summary, hour_start_utc, hour_end_utc)
            or self._render_report(summary, "Hourly")
        )
        self._write_raw_markdown(hourly_path, hourly_content)

        memory_path = self._memory_path(slug)
        memory_block = "\n".join(
            [
                f"### {current_ist.strftime('%Y-%m-%d %H:%M')} IST",
                "",
                f"- Source: {source}",
                f"- Messages analyzed: {summary.message_count}",
                f"- Last message ID: {last_message_id if last_message_id is not None else 'Unknown'}",
                f"- Interval minutes: {int(entity.get('interval_minutes') or 60)}",
                "",
                "#### Topics",
                *(f"- {self._escape_md(term)} ({count})" for term, count in (summary.topics[:8] if summary.topics else [])),
            ]
        )
        if not summary.topics:
            memory_block += "\n- No strong recurring topic detected.\n"
        memory_block += "\n#### Links\n"
        memory_block += "\n".join(f"- {self._escape_md(link)} ({count})" for link, count in (summary.links[:8] if summary.links else []))
        if not summary.links:
            memory_block += "\n- No links shared in this window.\n"
        memory_block += "\n#### Entities\n"
        memory_block += "\n".join(f"- {self._escape_md(entity_name)} ({count})" for entity_name, count in (summary.entities[:10] if summary.entities else []))
        if not summary.entities:
            memory_block += "\n- No notable entities detected.\n"
        memory_block += "\n#### Signals\n"
        if summary.suspicious_reasons:
            memory_block += "\n".join(f"- {reason}" for reason in summary.suspicious_reasons)
        else:
            memory_block += "\n- No noteworthy suspicious indicators in this slice.\n"
        memory_block += "\n#### Conclusion\n"
        memory_block += (summary.llm_summary or summary.conclusion) + "\n"
        memory_block += "\n#### Evidence\n"
        if summary.evidence:
            memory_block += "\n".join(summary.evidence)
        else:
            memory_block += "- No evidence snippets available.\n"
        self._append_memory_block(memory_path, memory_block)

        daily_md_path = self._daily_markdown_path(slug, day_date)
        daily_summary = self._summarize(
            title,
            "daily",
            self._scrape_repository.list_messages_between(telegram_id, start=day_start_utc, end=day_end_utc),
            day_start_utc,
            day_end_utc,
        )
        daily_sections = self._read_documents([memory_path])
        daily_content = self._llm_report_from_documents(
            title=title,
            scope="daily",
            documents=daily_sections,
            metadata_lines=[
                f"Channel: {title}",
                f"Telegram ID: {telegram_id}",
                f"Day: {day_date.isoformat()}",
                f"Messages analyzed this slice: {summary.message_count}",
                f"Memory blocks: {len(daily_sections)}",
            ],
        )
        if not daily_content:
            daily_content = self._render_report(daily_summary, "Daily")
        self._write_raw_markdown(daily_md_path, daily_content)

        pdf_path = self._daily_pdf_path(slug, day_date)
        try:
            self._write_pdf_report(pdf_path, f"Daily Report: {title} ({day_date.isoformat()})", daily_content)
            pdf_generated = True
        except Exception:
            pdf_generated = False
            pdf_path = pdf_path

        channel_state = self._state.setdefault("channels", {}).setdefault(str(telegram_id), {})
        group_state = self._state.setdefault("groups", {}).setdefault(str(telegram_id), {})
        current_iso = current_ist.isoformat()
        state_update = {
            "title": title,
            "slug": slug,
            "last_hourly_report": str(hourly_path.relative_to(self._report_root)),
            "last_daily_report": str(daily_md_path.relative_to(self._report_root)),
            "last_daily_pdf": str(pdf_path.relative_to(self._report_root)),
            "last_memory_file": str(memory_path.relative_to(self._report_root)),
            "last_analysis_at": current_iso,
            "last_analysis_message_id": last_message_id,
            "last_analysis_source": source,
            "last_daily_date": day_date.isoformat(),
            "pdf_generated": pdf_generated,
        }
        channel_state.update(state_update)
        group_state.update(state_update)
        self._save_state()
        return {
            "hourly": str(hourly_path),
            "daily": str(daily_md_path),
            "daily_pdf": str(pdf_path),
            "memory": str(memory_path),
            "last_message_id": last_message_id,
            "analysis_at": current_iso,
            "pdf_generated": pdf_generated,
        }

    def update_channel_reports(
        self,
        entity: Mapping[str, Any],
        scraped_at: datetime | None = None,
    ) -> dict[str, str]:
        """Generate and persist hourly, daily, memory, and PDF artifacts for one group."""
        telegram_id = int(entity["telegram_id"])
        hour_start_utc, hour_end_utc = self._channel_window(scraped_at)
        messages = self._scrape_repository.list_messages_between(
            telegram_id,
            start=hour_start_utc,
            end=hour_end_utc,
        )
        if not messages:
            messages = self._scrape_repository.list_messages_between(
                telegram_id,
                start=self._daily_window(scraped_at)[0],
                end=self._daily_window(scraped_at)[1],
            )
        artifacts = self._update_group_artifacts(entity, messages, scraped_at=scraped_at, source="scrape")
        return {"hourly": artifacts["hourly"], "daily": artifacts["daily"]}

    def update_group_memory(
        self,
        entity: Mapping[str, Any],
        new_messages: Iterable[Mapping[str, Any]],
        scraped_at: datetime | None = None,
    ) -> dict[str, Any]:
        """Append new messages to the per-group knowledge base and refresh reports."""
        messages = self._normalize_window_messages(new_messages)
        return self._update_group_artifacts(entity, messages, scraped_at=scraped_at, source="incremental")

    def write_combined_report(
        self,
        entities: Iterable[Mapping[str, Any]],
        scraped_at: datetime | None = None,
    ) -> Path:
        """Generate the combined Markdown report for all monitored channels."""
        current_ist = self._to_ist(scraped_at or datetime.now(UTC))
        report_date = current_ist.date()
        channel_rollup: list[str] = []
        daily_documents: list[str] = []
        for entity in entities:
            telegram_id = int(entity["telegram_id"])
            title = self._entity_title(entity)
            daily_path = self._report_root / "daily" / self._slugify(title) / f"{report_date.isoformat()}.md"
            if daily_path.exists():
                daily_documents.append(daily_path.read_text(encoding="utf-8"))
                channel_rollup.append(f"{title}: daily report available")
            else:
                channel_rollup.append(f"{title}: no daily report yet")

        summary = self._llm_report_from_documents(
            title="Combined Channels",
            scope="combined daily",
            documents=daily_documents,
            metadata_lines=[
                f"Report date: {report_date.isoformat()}",
                f"Channels analyzed: {len(channel_rollup)}",
                f"Daily reports collected: {len(daily_documents)}",
            ],
        )
        if not summary:
            summary = "\n".join(
                [
                    "# Combined Daily Report",
                    "",
                    f"- Report date: {report_date.isoformat()}",
                    f"- Channels analyzed: {len(channel_rollup)}",
                    "",
                    "## Channel Rollup",
                    *[f"- {line}" for line in channel_rollup],
                    "",
                    "## Summary",
                    "No daily reports were available to synthesize.",
                    "",
                ]
            )

        combined_path = self._report_root / "combined" / f"{report_date.isoformat()}.md"
        self._write_raw_markdown(combined_path, summary)

        combined_state = self._state.setdefault("combined", {})
        combined_state.update(
            {
                "last_report": str(combined_path.relative_to(self._report_root)),
                "last_report_date": report_date.isoformat(),
                "last_generated_at": current_ist.isoformat(),
            }
        )
        self._save_state()
        return combined_path

    def latest_reports(self) -> dict[str, Any]:
        """Return lightweight metadata for the most recent generated reports."""
        return self._state
