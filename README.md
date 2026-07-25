# Telegram Darknet Monitor

**Telegram Darknet Monitor** is a full-stack Cyber Threat Intelligence (CTI) platform designed to monitor Telegram channels and groups for cybersecurity-related discussions. The application provides a **Telegram-like web interface** where analysts can browse all available channels and groups, select the channels to monitor, and initiate data collection directly from the dashboard.

The platform continuously scrapes messages from selected Telegram channels using the Telegram API and stores the collected data in a structured MongoDB database. Once scraping is complete, an integrated **Large Language Model (LLM)** automatically analyzes the collected conversations to identify suspicious activities and extract actionable cyber threat intelligence.

The LLM processes each message to detect and categorize:

* URLs and shared links
* Suspicious or malicious activities
* Threat actor mentions
* Malware and ransomware references
* CVEs and software vulnerabilities
* Indicators of Compromise (IOCs)
* Cryptocurrency wallet addresses
* Email addresses
* Domains and IP addresses
* Credentials or leaked data references
* Emerging attack techniques and discussions

The analysis results are organized into structured intelligence reports, allowing analysts to quickly understand the most important findings without manually reviewing thousands of messages. The platform generates both **Markdown** and **PDF** reports for archival, sharing, and further investigation.

## Key Features

* Telegram monitor web interface displaying all channels and groups
* Browse and search Telegram channels from a centralized dashboard
* Select one or multiple channels for scraping
* Manual and scheduled scraping of Telegram data
* Real-time scraping progress and monitoring status
* Structured storage of messages and metadata in MongoDB
* Automated LLM-powered message analysis
* Detection of suspicious discussions and cyber threat indicators
* Extraction of URLs, IOCs, CVEs, malware names, threat actors, domains, IP addresses, cryptocurrency wallets, and email addresses
* Automatic report generation in Markdown and PDF formats
* Historical report archive and search functionality
* Responsive dark-mode dashboard for cyber threat monitoring

## Technology Stack

* **Frontend:** HTML, CSS, JavaScript, Bootstrap / React
* **Backend:** Python, FastAPI / Flask
* **Database:** MongoDB
* **Telegram Integration:** Telethon / Telegram Bot API
* **AI Analysis:** Large Language Model (LLM)
* **Reporting:** Markdown and PDF Generation
* **Automation:** Background Scheduler

## Workflow

1. Load all available Telegram channels and groups into the web dashboard.
2. Allow the analyst to select one or more channels for monitoring.
3. Scrape messages from the selected Telegram channels.
4. Store all collected messages and metadata in MongoDB.
5. Process the scraped data using an LLM.
6. Detect URLs, suspicious activities, threat intelligence indicators, malware references, CVEs, IOCs, and other cybersecurity-relevant entities.
7. Generate structured Markdown and PDF intelligence reports.
8. Present reports, analytics, and findings through the web dashboard.

## Project Goal

The goal of **Telegram Darknet Monitor** is to provide security analysts and cyber threat intelligence teams with a centralized platform that combines Telegram data collection, AI-powered analysis, and automated reporting. By integrating continuous Telegram monitoring with LLM-based intelligence extraction, the platform significantly reduces manual analysis effort while enabling faster identification of emerging cyber threats and suspicious activities.
