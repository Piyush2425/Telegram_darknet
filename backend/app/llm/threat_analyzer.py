import os
import json
import logging
import requests
from typing import Dict, Any, List
from datetime import datetime
from ..config import settings
from .regex_extractors import extract_indicators_with_regex

logger = logging.getLogger("darknet_monitor.llm")

class LLMThreatAnalyzer:
    """
    Automated Local LLM & Regex Cyber Threat Intelligence (CTI) Analysis Module.
    Queries local LLM instances (Ollama / LM Studio / LocalAI) to extract context,
    attributions, threat levels, and intelligence summaries.
    """

    def __init__(self):
        self.use_local = settings.USE_LOCAL_LLM
        self.local_url = settings.LOCAL_LLM_URL
        self.local_model = settings.LOCAL_LLM_MODEL

    def analyze_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze a darknet message using Local LLM + Deterministic Regex."""
        text = message.get("text", "")
        msg_id = message.get("id", "unknown")
        channel = message.get("channel_username", "unknown")
        
        # 1. Deterministic Regex Extractions (CVEs, IPs, Hashes, Wallets, Credentials)
        indicators = extract_indicators_with_regex(text)

        # 2. Query Local LLM if enabled
        local_llm_response = None
        if self.use_local:
            local_llm_response = self._query_local_llm(text)

        # Calculate risk score
        risk_score = 10
        if indicators.get("cves"): risk_score += 25
        if indicators.get("malware_references"): risk_score += 20
        if indicators.get("leaked_credentials"): risk_score += 20
        if indicators.get("iocs"): risk_score += 15
        if indicators.get("crypto_wallets"): risk_score += 10
        if indicators.get("suspicious_activities"): risk_score += 10

        if local_llm_response and "risk_score" in local_llm_response:
            try:
                risk_score = max(risk_score, int(local_llm_response["risk_score"]))
            except ValueError:
                pass

        risk_score = min(risk_score, 100)

        # Threat Level
        if risk_score >= 75:
            threat_level = "CRITICAL"
        elif risk_score >= 50:
            threat_level = "HIGH"
        elif risk_score >= 30:
            threat_level = "MEDIUM"
        else:
            threat_level = "LOW"

        # Summary
        if local_llm_response and local_llm_response.get("summary"):
            summary = f"[Local LLM Analysis - Score {risk_score}/100] " + local_llm_response["summary"]
        else:
            summary = self._generate_fallback_summary(text, indicators, risk_score)

        # Combine threat actors & malware if Local LLM detected extra
        if local_llm_response:
            if "malware_references" in local_llm_response:
                indicators["malware_references"] = sorted(list(set(indicators["malware_references"] + local_llm_response["malware_references"])))
            if "threat_actors" in local_llm_response:
                indicators["threat_actors"] = sorted(list(set(indicators["threat_actors"] + local_llm_response["threat_actors"])))

        intel = {
            "id": f"intel_{msg_id}",
            "message_id": msg_id,
            "channel_username": channel,
            "timestamp": message.get("date", datetime.utcnow().isoformat()),
            "urls": indicators.get("urls", []),
            "suspicious_activities": indicators.get("suspicious_activities", []),
            "threat_actors": indicators.get("threat_actors", []),
            "malware_references": indicators.get("malware_references", []),
            "cves": indicators.get("cves", []),
            "iocs": indicators.get("iocs", []),
            "crypto_wallets": indicators.get("crypto_wallets", []),
            "emails": indicators.get("emails", []),
            "domains_ips": indicators.get("domains_ips", []),
            "leaked_credentials": indicators.get("leaked_credentials", []),
            "summary": summary,
            "risk_score": risk_score,
            "threat_level": threat_level,
            "llm_engine": "Ollama/LocalLLM" if local_llm_response else "RegexFallback"
        }

        return intel

    def _query_local_llm(self, text: str) -> Dict[str, Any]:
        """Query local Ollama / LM Studio endpoint with JSON formatting prompt."""
        prompt = f"""You are a Cyber Threat Intelligence (CTI) analyst. Analyze the following Telegram darknet message and return JSON strictly in this format:
{{
  "summary": "Brief 1-2 sentence threat analysis",
  "risk_score": 75,
  "threat_level": "HIGH",
  "malware_references": ["LummaStealer"],
  "threat_actors": ["LockBit"]
}}

Message to analyze:
"{text}"
"""
        try:
            # Try Ollama /api/generate endpoint format
            payload = {
                "model": self.local_model,
                "prompt": prompt,
                 "stream": False,
                "format": "json"
            }
            resp = requests.post(self.local_url, json=payload, timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                raw_response = data.get("response", "")
                return json.loads(raw_response)
        except Exception as e:
            logger.debug(f"Local LLM query failed or timed out: {e}. Falling back to rules engine.")
        
        return None

    def generate_ai_threat_report(self, messages: List[Dict[str, Any]], start_date: str, end_date: str, channel_title: str) -> str:
        """Query local LLM to build a focused CTI report from the aggregated messages. Fallback if offline."""
        msg_contents = "\n".join([f"- [{msg.get('date', 'unknown')}] User {msg.get('sender', 'unknown')}: {msg.get('text', '')[:200]}" for msg in messages[:40]])
        
        prompt = f"""You are a Cyber Threat Intelligence (CTI) specialist. Analyze these darknet chat logs from "{channel_title}" ({start_date} to {end_date}) and synthesize a professional intelligence summary.

CRITICAL INSTRUCTIONS:
- Do NOT copy, repeat, or regurgitate the raw chat logs.
- Synthesize your findings. Group duplicate URLs, summarize topics, and attribute discussions.
- Be concise and analytical.

Logs to analyze:
{msg_contents}

Generate a markdown report with this exact structure:

## 1. Shared URLs
(List only unique, extracted domains, onion links, or URLs. For each URL, write a 1-sentence analysis of what is being shared or offered there based on the chat context. Do not list duplicates.)

## 2. Key Usernames & Topics
(Identify the most active usernames or posters. For each username, list the specific topics they are discussing, what they are selling/trading/offering, and summarize or quote at most one notable highlighted message.)

## 3. Summary of Discussion
(Provide a brief, high-level analysis explaining the main focus of the conversation, the overall threat posture, and key takeaways. Do not include generic security tips or advice.)
"""


        
        if self.use_local:
            try:
                payload = {
                    "model": self.local_model,
                    "prompt": prompt,
                    "stream": False
                }
                # Increase timeout to 120 seconds (2 minutes) for generating complex reports in low-VRAM/CPU environments
                resp = requests.post(self.local_url, json=payload, timeout=120.0)
                if resp.status_code == 200:
                    data = resp.json()
                    report_text = data.get("response", "")
                    if report_text.strip():
                        return report_text
            except Exception as e:
                logger.warning(f"Failed to generate LLM report: {e}. Using deterministic fallback.")
        
        # Fallback CTI Report Generation focused strictly on URLs, Usernames, and Discussion points
        from .regex_extractors import extract_indicators_with_regex
        all_onions = set()
        all_senders = set(msg.get("sender") for msg in messages if msg.get("sender"))
        
        for msg in messages:
            inds = extract_indicators_with_regex(msg.get("text", ""))
            all_onions.update(inds.get("urls", []))

        onion_bullets = "\n".join([f"* {url}" for url in sorted(all_onions)]) if all_onions else "_No URLs or onion domains extracted from messages._"
        sender_bullets = "\n".join([f"* {user}" for user in sorted(all_senders)]) if all_senders else "_No usernames detected._"

        fallback_report = f"""# 🛡️ AI Threat Intelligence Report: {channel_title}

**Analysis Period**: `{start_date}` to `{end_date}`
**Total Messages Evaluated**: `{len(messages)}`
**Engine**: `CTI Rules Engine (Local LLM Offline Fallback)`

---

## 1. Shared URLs
{onion_bullets}

## 2. Key Usernames
{sender_bullets}

## 3. Summary of Discussion
Active discussion of darknet telemetry, credential combos, or general chatter within the specified date range.
"""
        return fallback_report

    def _generate_fallback_summary(self, text: str, indicators: Dict[str, List[str]], risk_score: int) -> str:
        parts = []
        if indicators.get("cves"):
            parts.append(f"Vulnerability discussion regarding {', '.join(indicators['cves'])}.")
        if indicators.get("malware_references"):
            parts.append(f"Malware payload/sample references identified: {', '.join(indicators['malware_references'])}.")
        if indicators.get("leaked_credentials"):
            parts.append(f"Detected {len(indicators['leaked_credentials'])} compromised credentials/combo lines.")
        if indicators.get("crypto_wallets"):
            parts.append(f"Financial indicator/crypto address detected: {', '.join(indicators['crypto_wallets'])}.")
        if indicators.get("threat_actors"):
            parts.append(f"Threat actor attribution: {', '.join(indicators['threat_actors'])}.")
        
        if not parts:
            parts.append("General discussion monitored in darknet channel.")

        return f"[Risk Score {risk_score}/100] " + " ".join(parts)

    def extract_cycle_threats(self, messages: List[Dict[str, Any]], channel_title: str) -> Dict[str, Any]:
        """Query local LLM using JSON format to extract CTI indicators from a batch of messages."""
        msg_contents = "\n".join([f"- User {msg.get('sender', 'unknown')}: {msg.get('text', '')[:200]}" for msg in messages[:40]])
        
        prompt = f"""You are a Cyber Threat Intelligence (CTI) analyst.
Analyze the following batch of Telegram chat logs from channel "{channel_title}".
Extract any threat events, suspicious users, shared links, onion links, and indicators of compromise (IOCs).
Only extract usernames of users that are actively suspicious (e.g. threat actors, vendors of malware, sellers of database leaks, organizers of cyberattacks). Do not list normal users.

Return a JSON object STRICTLY matching this JSON schema:
{{
  "threat_alerts": [
    {{
      "title": "Alert title (e.g. PII leak)",
      "severity": "HIGH",
      "description": "Short explanation"
    }}
  ],
  "suspicious_users": [
    {{
      "username": "@actor_name",
      "malicious_context": "Selling credentials dump / advertising Lumma Stealer"
    }}
  ],
  "urls": [
    {{
      "url": "https://example.com/file",
      "purpose": "Link shared for hosting database dump"
    }}
  ],
  "onions": [
    {{
      "url": "http://example.onion",
      "purpose": "Darknet leak forum index link"
    }}
  ],
  "iocs": [
    {{
      "type": "IP",
      "value": "192.168.1.1",
      "context": "Server IP used for hosting payload"
    }}
  ],
  "topics": ["list of topic strings"],
  "executive_summary": "1-2 sentence high-level synthesis of this chat segment"
}}

Logs to analyze:
{msg_contents}
"""
        
        if self.use_local:
            try:
                payload = {
                    "model": self.local_model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json"
                }
                resp = requests.post(self.local_url, json=payload, timeout=120.0)
                if resp.status_code == 200:
                    data = resp.json()
                    raw_resp = data.get("response", "")
                    return json.loads(raw_resp)
            except Exception as e:
                logger.warning(f"JSON LLM extraction failed: {e}. Running fallback regex extraction.")
                
        # Regex Offline Fallback
        from .regex_extractors import extract_indicators_with_regex
        all_onions = []
        all_urls = []
        all_iocs = []
        suspicious_users = []
        import re
        
        for msg in messages:
            text = msg.get("text", "")
            sender = msg.get("sender", "unknown")
            inds = extract_indicators_with_regex(text)
            
            is_suspicious = False
            reasons = []
            
            for url in inds.get("urls", []):
                if ".onion" in url.lower():
                    all_onions.append({"url": url, "purpose": "Onion link shared in chat"})
                    is_suspicious = True
                    reasons.append("Shared onion link")
                else:
                    all_urls.append({"url": url, "purpose": "Web link shared in chat"})
                    
            for cve in inds.get("cves", []):
                all_iocs.append({"type": "CVE", "value": cve, "context": "Exploit mentioned in discussion"})
                is_suspicious = True
                reasons.append(f"Discussed {cve}")
                
            for wallet in inds.get("crypto_wallets", []):
                all_iocs.append({"type": "CryptoWallet", "value": wallet, "context": "Payment wallet"})
                is_suspicious = True
                reasons.append("Shared crypto wallet address")
                
            for ip in re.findall(r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b", text):
                all_iocs.append({"type": "IP", "value": ip, "context": "IP indicator"})
                is_suspicious = True
                reasons.append("Shared IP address")
                
            if is_suspicious:
                suspicious_users.append({
                    "username": sender,
                    "malicious_context": ", ".join(reasons) + f": {text[:100]}"
                })
                
        return {
            "threat_alerts": [{"title": "Suspicious Indicators Flagged", "severity": "MEDIUM", "description": "Deterministic rules engines matched darknet threat patterns."}] if suspicious_users else [],
            "suspicious_users": suspicious_users,
            "urls": all_urls[:10],
            "onions": all_onions[:10],
            "iocs": all_iocs[:10],
            "topics": ["Darknet Telemetry Logs"],
            "executive_summary": "System compiled threat metrics via local fallback engine."
        }

analyzer = LLMThreatAnalyzer()

