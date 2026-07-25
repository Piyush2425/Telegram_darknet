import re
from typing import Dict, List

# Regex Patterns for Threat Indicators
REGEX_PATTERNS = {
    "cves": r"\bCVE-\d{4}-\d{4,7}\b",
    "urls": r"https?://[^\s<>\"']+|www\.[^\s<>\"']+",
    "domains_ips": r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b|\b[a-zA-Z0-9.-]+\.(?:onion|com|net|org|ru|to|xyz|cc|top)\b",
    "emails": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    "crypto_wallets": r"\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b|\b0x[a-fA-F0-9]{40}\b|\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b",
    "iocs": r"\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b",
    "leaked_credentials": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}:[^\s]{4,}\b",
}

# Known Threat Keywords for Categorization
THREAT_KEYWORDS = {
    "malware_references": ["stealer", "redline", "lumma", "asyncrat", "njrat", "cobalt strike", "metasploit", "agent tesla", "vidar", "racoon", "quasar"],
    "threat_actors": ["lockbit", "blackcat", "alphv", "revil", "clop", "scattered spider", "fancy bear", "cozy bear", "lazarus", "killnet", "anonymous sudam"],
    "suspicious_activities": ["zero-day", "rce", "database leak", "combo list", "access sale", "sql injection", "privilege escalation", "botnet", "ransomware", "initial access", "bypass mfa", "ddos"]
}

def extract_indicators_with_regex(text: str) -> Dict[str, List[str]]:
    """Extract cyber threat indicators using precision regex and key terms."""
    result: Dict[str, List[str]] = {}

    for key, pattern in REGEX_PATTERNS.items():
        matches = set(re.findall(pattern, text, re.IGNORECASE))
        result[key] = sorted(list(matches))

    # Keyword categorization
    text_lower = text.lower()
    for cat, keywords in THREAT_KEYWORDS.items():
        found = [kw.title() for kw in keywords if kw in text_lower]
        result[cat] = sorted(list(set(found)))

    return result
