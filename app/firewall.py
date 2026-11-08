"""The site's firewall: it looks at every request before the server does and
turns away the ones no real visitor would send.

It blocks:

- Anything other than reading pages (GET and HEAD). The site has no forms,
  so nobody needs to send it data.
- Requests for a site name that isn't this one, which is how bots that scan
  every IP address on the internet find servers.
- Absurdly long addresses and requests that carry a body.
- Visitors asking for too many pages too fast (rate limiting).
- Bots probing for things this site doesn't have, like /wp-login.php or /.env.
  One probe and that IP address is banned for an hour.

Fly.io already only lets web traffic in (ports 80 and 443), so this covers the
part a network firewall can't: what's inside the requests.

Only the Python standard library is used here.
"""

import os
import re
import time

from fastapi import Request
from fastapi.responses import PlainTextResponse

# The site names this server answers to. When you add your own domain, list it
# in fly.toml under [env], e.g. ALLOWED_HOSTS = "example.com,www.example.com",
# or visitors to that domain will be turned away.
ALLOWED_HOSTS = {"codingsqurl.fly.dev", "localhost", "127.0.0.1"} | {
    host.strip().lower() for host in os.environ.get("ALLOWED_HOSTS", "").split(",") if host.strip()
}

ALLOWED_METHODS = {"GET", "HEAD"}
MAX_URL_LENGTH = 2048

# Each visitor gets RATE_BURST requests straight away, then RATE_PER_SECOND more
# every second. A person reading the page uses a handful; a flood uses thousands.
RATE_BURST = 60
RATE_PER_SECOND = 2

BAN_SECONDS = 60 * 60  # 1 hour

# Addresses only an attack bot asks for: WordPress and PHP admin pages, leaked
# secrets and git folders, and paths that try to climb out of the site folder.
PROBE = re.compile(
    r"(\.php|\.aspx?|\.cgi|\.env|\.git|\.svn|\.htaccess|\.htpasswd|wp-|wordpress|phpmyadmin"
    r"|xmlrpc|/admin|/cgi-bin|/vendor/|/actuator|\.\.|%2e%2e)",
    re.I,
)

# Fly.io's health check comes from inside Fly, without the site's name.
EXEMPT_PATHS = {"/healthz"}

# Visitor IP -> [tokens left, when they were last topped up].
buckets = {}
# Visitor IP -> when their ban ends.
banned = {}
next_cleanup = 0.0


def client_ip(request: Request):
    # Fly.io's front door puts the visitor's real address in Fly-Client-IP and
    # replaces any copy the visitor sends, so it can't be faked. Running locally,
    # there's no front door, so use the direct connection's address.
    return request.headers.get("fly-client-ip") or (request.client.host if request.client else "unknown")


def deny(status, message, headers=None):
    return PlainTextResponse(message, status_code=status, headers={"Cache-Control": "no-store", **(headers or {})})


def rate_limited(ip, now):
    tokens, last = buckets.get(ip, (RATE_BURST, now))
    tokens = min(RATE_BURST, tokens + (now - last) * RATE_PER_SECOND)
    if tokens < 1:
        buckets[ip] = (tokens, now)
        return True
    buckets[ip] = (tokens - 1, now)
    return False


def cleanup(now):
    """Forgets visitors who've gone quiet and bans that have run out, so memory can't fill up."""
    global next_cleanup
    if now < next_cleanup:
        return
    next_cleanup = now + 60
    full = RATE_BURST / RATE_PER_SECOND  # after this long, a visitor's bucket is full again
    for ip in [ip for ip, (_, last) in buckets.items() if now - last > full]:
        del buckets[ip]
    for ip in [ip for ip, until in banned.items() if until <= now]:
        del banned[ip]


def check(request: Request):
    """Returns a response turning the request away, or None to let it through."""
    path = request.url.path
    if path in EXEMPT_PATHS:
        return None

    now = time.monotonic()
    cleanup(now)
    ip = client_ip(request)

    if banned.get(ip, 0) > now:
        return deny(403, "Forbidden")

    if PROBE.search(request.url.path + "?" + request.url.query):
        banned[ip] = now + BAN_SECONDS
        return deny(403, "Forbidden")

    if request.method not in ALLOWED_METHODS:
        return deny(405, "Method Not Allowed", {"Allow": "GET, HEAD"})

    host = request.headers.get("host", "").rsplit(":", 1)[0].lower()
    if host not in ALLOWED_HOSTS:
        return deny(421, "Misdirected Request")

    if len(str(request.url)) > MAX_URL_LENGTH:
        return deny(414, "URI Too Long")

    if request.headers.get("content-length", "0") != "0" or "transfer-encoding" in request.headers:
        return deny(413, "Content Too Large")

    if rate_limited(ip, now):
        return deny(429, "Too Many Requests", {"Retry-After": "30"})

    return None
