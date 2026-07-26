import re
from typing import List, Dict, Any
from urlextract import URLExtract
import tldextract

# Precision regex patterns for edge cases
ONION_REGEX = r"\b[a-z2-7]{16,56}\.onion(?:\/[^\s<>\"']*)?\b"
EMAIL_REGEX = r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
IP_REGEX = r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b"

# Matches bare domains with paths or custom TLDs (like df.sh, darkforum.sh, domain.com/path)
# avoiding double-matching standard emails
BARE_DOMAIN_REGEX = r"\b(?!mailto:)(?<!@)(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|ru|to|xyz|cc|top|sh|info|biz|co|us|uk|de|cn|in|onion)(?:\/[^\s<>\"']*)?\b"

# Instantiate urlextract extractor
extractor = URLExtract()

def extract_indicators_hybrid(text: str) -> List[Dict[str, Any]]:
    """
    Extracts all URLs, Onion links, Emails, IP addresses, and Bare Domains
    from a text using a hybrid pipeline (urlextract + tldextract + custom regexes).
    """
    if not text:
        return []
        
    extracted_items = []
    seen_values = set()
    
    # Helper to check and append unique findings
    def add_item(val: str, type_str: str, normalized_val: str):
        val_clean = val.strip().strip(".,;:?!()[]{}'\"")
        if not val_clean:
            return
        if val_clean.lower() not in seen_values:
            seen_values.add(val_clean.lower())
            extracted_items.append({
                "value": val_clean,
                "normalized": normalized_val,
                "type": type_str
            })

    # 1. Extract standard URLs using urlextract and fallback regex
    urls = []
    try:
        urls = extractor.find_urls(text, only_valid=False)
    except Exception:
        pass
        
    # If urlextract failed or returned nothing (e.g. offline testing context), run fallback regex
    if not urls:
        URL_FALLBACK_REGEX = r"\bhttps?://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:/[^\s<>\"']*)?\b|\bwww\.[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:/[^\s<>\"']*)?\b"
        urls = re.findall(URL_FALLBACK_REGEX, text, re.IGNORECASE)
        
    for url in urls:
        # Skip if it is an email
        if "@" in url:
            continue
        ext = tldextract.extract(url)
        # Normalize to domain.suffix (e.g. mail.google.com -> google.com)
        if ext.domain and ext.suffix:
            normalized = f"{ext.domain}.{ext.suffix}"
        else:
            normalized = ext.ipv4 if ext.ipv4 else url
        
        # Categorize type
        type_lbl = "Web URL"
        if ".onion" in url.lower():
            type_lbl = "Onion"
        add_item(url, type_lbl, normalized)

    # 2. Extract Onion Links using Custom Regex
    onions = re.findall(ONION_REGEX, text, re.IGNORECASE)
    for onion in onions:
        ext = tldextract.extract(onion)
        normalized = f"{ext.domain}.{ext.suffix}" if (ext.domain and ext.suffix) else "onion"
        add_item(onion, "Onion", normalized)

    # 3. Extract Emails using Custom Regex
    emails = re.findall(EMAIL_REGEX, text, re.IGNORECASE)
    for email in emails:
        ext = tldextract.extract(email)
        normalized = f"{ext.domain}.{ext.suffix}" if (ext.domain and ext.suffix) else email.split("@")[-1]
        add_item(email, "Email", normalized)

    # 4. Extract IP Addresses using Custom Regex
    ips = re.findall(IP_REGEX, text)
    for ip in ips:
        add_item(ip, "IP", ip)

    # 5. Extract Bare Domains (e.g. df.sh, darkforum.sh) using Custom Regex
    bare_domains = re.findall(BARE_DOMAIN_REGEX, text, re.IGNORECASE)
    for domain in bare_domains:
        # Normalize
        ext = tldextract.extract(domain)
        if ext.domain and ext.suffix:
            normalized = f"{ext.domain}.{ext.suffix}"
        else:
            normalized = domain
            
        type_lbl = "Onion" if ".onion" in domain.lower() else "Bare Domain"
        add_item(domain, type_lbl, normalized)

    return extracted_items
