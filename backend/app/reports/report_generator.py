import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any
from ..config import settings

class ReportGenerator:
    """Generate Markdown and PDF Cyber Threat Intelligence (CTI) reports."""

    def __init__(self):
        self.reports_dir = settings.REPORTS_DIR

    def generate_report(self, messages: List[Dict[str, Any]], threat_intels: List[Dict[str, Any]], channels: List[str]) -> Dict[str, str]:
        now = datetime.utcnow()
        timestamp_str = now.strftime("%Y-%m-%d_%H%M")
        date_str = now.strftime("%Y-%m-%d")

        title = f"Cyber Threat Intelligence Report - {date_str}"
        
        # Consolidate threat indicators
        all_cves = set()
        all_urls = set()
        all_iocs = set()
        all_wallets = set()
        all_credentials = set()
        all_malware = set()
        all_actors = set()

        total_critical = 0
        total_high = 0

        for intel in threat_intels:
            all_cves.update(intel.get("cves", []))
            all_urls.update(intel.get("urls", []))
            all_iocs.update(intel.get("iocs", []))
            all_wallets.update(intel.get("crypto_wallets", []))
            all_credentials.update(intel.get("leaked_credentials", []))
            all_malware.update(intel.get("malware_references", []))
            all_actors.update(intel.get("threat_actors", []))

            if intel.get("threat_level") == "CRITICAL":
                total_critical += 1
            elif intel.get("threat_level") == "HIGH":
                total_high += 1

        # Build Markdown content
        md_content = f"""# {title}
**Generated Date:** {now.strftime("%Y-%m-%d %H:%M:%S UTC")}  
**Monitored Channels:** {', '.join([f'@{c}' for c in channels])}  
**Total Messages Analyzed:** {len(messages)}  
**Critical Threat Items:** {total_critical} | **High Severity Items:** {total_high}  

---

## 1. Executive Summary
During the automated scraping cycle, **{len(messages)} messages** were collected across Telegram darknet groups. Automated Large Language Model (LLM) analysis detected **{len(all_cves)} CVE vulnerabilities**, **{len(all_malware)} malware families**, and **{len(all_credentials)} compromised credential sets**.

---

## 2. Key Threat Indicators

### 🔴 Critical CVE Vulnerabilities & Zero-Days
{self._format_list(list(all_cves))}

### ☣️ Malware & Ransomware References
{self._format_list(list(all_malware))}

### 👾 Threat Actor Mentions & Groups
{self._format_list(list(all_actors))}

### 💰 Cryptocurrency Wallet Addresses
{self._format_list(list(all_wallets))}

### 🔑 Compromised Credentials / Combo Extracts
{self._format_list(list(all_credentials))}

### 🛡️ Indicators of Compromise (IOC Hashes & URLs)
**URLs/Links:**
{self._format_list(list(all_urls))}

**File Hashes (SHA256/MD5):**
{self._format_list(list(all_iocs))}

---

## 3. High Risk Message Excerpts
"""

        for msg in messages:
            if msg.get("threat_level") in ["CRITICAL", "HIGH"]:
                md_content += f"""
> **[Channel @{msg.get('channel_username')}] - Threat Level: {msg.get('threat_level')}**  
> *Date:* {msg.get('date')} | *Views:* {msg.get('views')}  
> {msg.get('text')}  

---
"""

        # Save Markdown File
        md_filename = f"CTI_Report_{timestamp_str}.md"
        md_file_path = self.reports_dir / "daily" / md_filename
        with open(md_file_path, "w", encoding="utf-8") as f:
            f.write(md_content)

        # Save Text/PDF Report fallback
        pdf_filename = f"CTI_Report_{timestamp_str}.pdf"
        pdf_file_path = self.reports_dir / "pdf" / pdf_filename
        self._generate_pdf_file(pdf_file_path, title, md_content)

        return {
            "id": f"rep_{timestamp_str}",
            "title": title,
            "created_at": now.isoformat(),
            "period": "daily",
            "channels_analyzed": channels,
            "total_messages": len(messages),
            "total_threats": total_critical + total_high,
            "markdown_path": str(md_file_path.relative_to(settings.BASE_DIR)),
            "pdf_path": str(pdf_file_path.relative_to(settings.BASE_DIR)),
            "summary": f"Analyzed {len(messages)} messages across {len(channels)} channels. Extracted {len(all_cves)} CVEs, {len(all_iocs)} IOC hashes, and {len(all_credentials)} credential leaks."
        }

    def _format_list(self, items: List[str]) -> str:
        if not items:
            return "_None detected in this cycle._"
        return "\n".join([f"- `{item}`" for item in items])

    def _generate_pdf_file(self, pdf_path: Path, title: str, content: str):
        """Generate PDF using fpdf2 or fallback text representation."""
        try:
            from fpdf import FPDF
            pdf = FPDF()
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 16)
            pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT", align="C")
            pdf.ln(5)
            pdf.set_font("Helvetica", "", 10)
            
            # Simple line by line print
            for line in content.split("\n"):
                clean_line = line.replace("#", "").replace("**", "").replace("`", "").strip()
                if clean_line:
                    pdf.multi_cell(0, 6, clean_line)
            pdf.output(str(pdf_path))
        except Exception as e:
            # Fallback text representation if FPDF encounters formatting issues
            with open(str(pdf_path) + ".txt", "w", encoding="utf-8") as f:
                f.write(content)

report_generator = ReportGenerator()
