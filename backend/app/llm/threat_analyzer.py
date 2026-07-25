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

analyzer = LLMThreatAnalyzer()
