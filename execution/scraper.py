import httpx
import logging
import ipaddress
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

def validate_url(url: str) -> str:
    """
    Validates the URL to prevent SSRF attacks.
    Ensures the URL is HTTP/HTTPS and does not resolve to a private/loopback IP.
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            raise ValueError("Invalid URL scheme")
        
        hostname = parsed.hostname
        if not hostname:
             raise ValueError("Invalid hostname")

        # Resolve hostname to IP
        try:
            ip_str = socket.gethostbyname(hostname)
            ip = ipaddress.ip_address(ip_str)
        except socket.gaierror:
             # Could not resolve, might be okay if we trust the DNS, but for SSRF usually we assume internal DNS is risky too
             # If we can't resolve, httpx won't be able to either, so it's fine.
             # However, to be strict, we might want to fail. 
             # Let's assume if it doesn't resolve here, it's invalid.
             raise ValueError("Could not resolve hostname")

        if ip.is_private or ip.is_loopback:
            raise ValueError(f"Access to private IP {ip_str} is forbidden")
            
        return url
    except Exception as e:
        logger.warning(f"SSRF Attempt prevented: {url} - {e}")
        raise ValueError("Invalid URL")


async def fetch_website_content(url: str) -> str:
    """
    Fetches the raw HTML content of the given URL using httpx.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    
    try:
        validate_url(url)
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0, headers=headers) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text

    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error occurred while fetching {url}: {e}")
        return f"Error fetching details from {url}: {e}"
    except Exception as e:
        logger.error(f"An error occurred while fetching {url}: {e}")
        return f"Error fetching details from {url}: {e}"
