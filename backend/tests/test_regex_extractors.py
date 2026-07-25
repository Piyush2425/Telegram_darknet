import pytest
from app.llm.regex_extractors import extract_indicators_with_regex

def test_extract_cves():
    text = "We have a zero-day exploit for CVE-2024-38063 and a payload targeting CVE-2021-44228 (Log4j)."
    results = extract_indicators_with_regex(text)
    
    assert "CVE-2024-38063" in results["cves"]
    assert "CVE-2021-44228" in results["cves"]
    assert len(results["cves"]) == 2

def test_extract_onion_links_and_domains():
    text = "Check the leaks on http://breach2425leak.onion/index.html or mirror site torproject.org."
    results = extract_indicators_with_regex(text)
    
    assert "breach2425leak.onion" in results["domains_ips"]
    assert "torproject.org" in results["domains_ips"]

def test_extract_crypto_wallets():
    text = "Send 0.05 BTC to 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa or ETH to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F."
    results = extract_indicators_with_regex(text)
    
    assert "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" in results["crypto_wallets"]
    assert "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" in results["crypto_wallets"]

def test_extract_leaked_credentials():
    text = "Combo list leak found! admin@domain.com:P@ssword123 and database_user@gmail.com:qwerty88."
    results = extract_indicators_with_regex(text)
    
    assert "admin@domain.com:P@ssword123" in results["leaked_credentials"]
    assert "database_user@gmail.com:qwerty88" in results["leaked_credentials"]

def test_extract_threat_actors_and_malware():
    text = "LockBit ransomware group is using Redline Stealer and Lumma to exfiltrate database records."
    results = extract_indicators_with_regex(text)
    
    assert "Lockbit" in results["threat_actors"]
    assert "Redline" in results["malware_references"]
    assert "Lumma" in results["malware_references"]
    assert "Ransomware" in results["suspicious_activities"]
