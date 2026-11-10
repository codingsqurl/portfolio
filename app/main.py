"""The portfolio's web server.

It serves the site's files, fills in the GitHub project cards, and adds the
security and caching rules to every response.

Run it locally with:

    .venv/bin/uvicorn app.main:app --reload --port 8000

then open http://127.0.0.1:8000
"""

import base64
import hashlib
import logging
import re
import threading
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import projects

log = logging.getLogger("uvicorn.error")

# The folder holding index.html, style.css and the rest (one level above this file).
SITE = Path(__file__).resolve().parent.parent

# Only these files are ever served. Everything else in the repo (README, notes,
# the app's own code) stays private, even if someone guesses its name.
# The number is how many seconds a browser may keep its copy.
PUBLIC_FILES = {
    "favicon.svg": 60 * 60 * 24,      # 1 day
    "og-image.png": 60 * 60 * 24,     # 1 day
    "robots.txt": 60 * 60 * 24,       # 1 day
}
# Files other sites are allowed to show, like the preview image in a shared link.
SHAREABLE_FILES = {"og-image.png"}

# How often to ask GitHub for the latest repos, and how soon to try again if it fails.
PROJECTS_REFRESH = 60 * 60   # 1 hour
PROJECTS_RETRY = 60 * 5      # 5 minutes

# The browser's safety rules: only load files from this site, never run scripts,
# and never let another site show this one inside a frame.
CSP = (
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'none'; "
    "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; "
    "upgrade-insecure-requests"
)


def inline_style_hash(path):
    """The SHA-256 fingerprint of the page's <style> block, in the form CSP wants.

    The browser hashes the exact text between <style> and </style> and only applies
    it if the hash matches. So the 404 page's own styles work, but any style an
    attacker manages to inject does not. It's recomputed at startup, so editing
    404.html never needs a matching edit here."""
    match = re.search(r"<style>(.*?)</style>", path.read_text(encoding="utf-8"), re.S)
    if match is None:
        return ""
    digest = hashlib.sha256(match.group(1).encode("utf-8")).digest()
    return "'sha256-" + base64.b64encode(digest).decode() + "'"


# The 404 page keeps its styles inside itself. Its CSP allows that one exact block
# by hash, instead of 'unsafe-inline', which would allow any inline style at all.
CSP_404 = CSP.replace("style-src 'self'", f"style-src 'self' {inline_style_hash(SITE / '404.html')}")

SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    # Other sites can't load this site's files into their pages. og-image.png opts
    # out below, so link previews on social sites still show it.
    "Cross-Origin-Resource-Policy": "same-origin",
    # Older browsers ignore CSP's frame-ancestors, so say "no framing" the old way too.
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}

# The site never sets cookies today. If one is ever added, these rules get forced onto
# it: never sent over plain http (Secure), invisible to page scripts (HttpOnly), and
# never sent along with requests that start on another site (SameSite=Strict).
COOKIE_RULES = {"secure": "Secure", "httponly": "HttpOnly", "samesite": "SameSite=Strict"}


def harden_cookie(cookie):
    present = {part.strip().split("=")[0].lower() for part in cookie.split(";")[1:]}
    missing = [rule for name, rule in COOKIE_RULES.items() if name not in present]
    return "; ".join([cookie, *missing]) if missing else cookie


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
# Squashes text files before sending them, so pages download faster.
app.add_middleware(GZipMiddleware, minimum_size=500)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)

    cookies = response.headers.getlist("set-cookie")
    if cookies:
        del response.headers["set-cookie"]
        for cookie in cookies:
            response.headers.append("set-cookie", harden_cookie(cookie))
    return response


# ---------- The stylesheet ----------
# Its address includes a fingerprint of its contents (style.css?v=1a2b3c4d), so
# browsers can keep it for a year. When the file changes, so does the address.
STYLE_CSS = SITE / "style.css"
STYLE_VERSION = hashlib.sha256(STYLE_CSS.read_bytes()).hexdigest()[:8]


@app.api_route("/style.css", methods=["GET", "HEAD"])
def style(v: str = ""):
    if v == STYLE_VERSION:
        cache = "public, max-age=31536000, immutable"
    else:
        cache = "public, max-age=600"
    return FileResponse(STYLE_CSS, media_type="text/css", headers={"Cache-Control": cache})


# ---------- The home page ----------

class HomePage:
    """Keeps a ready-made copy of index.html, with fresh project cards and the
    stylesheet fingerprint filled in, and rebuilds it when the cards get stale."""

    def __init__(self):
        self.lock = threading.Lock()
        self.html = ""
        self.etag = ""
        self.next_refresh = 0.0

    def get(self):
        with self.lock:
            if time.monotonic() >= self.next_refresh:
                self.rebuild()
            return self.html, self.etag

    def rebuild(self):
        page = (SITE / "index.html").read_text(encoding="utf-8")
        page = page.replace('href="style.css"', f'href="style.css?v={STYLE_VERSION}"')

        try:
            page = projects.insert_cards(page, projects.fetch_repos())
            self.next_refresh = time.monotonic() + PROJECTS_REFRESH
        except Exception as error:
            # Keep the cards saved in index.html and try GitHub again soon.
            log.warning("couldn't reach GitHub (%s), using the saved project cards", error)
            self.next_refresh = time.monotonic() + PROJECTS_RETRY

        self.html = page
        self.etag = '"' + hashlib.sha256(page.encode()).hexdigest()[:16] + '"'


home_page = HomePage()


@app.api_route("/", methods=["GET", "HEAD"])
def home(request: Request):
    page, etag = home_page.get()
    # "no-cache" means the browser keeps a copy but checks with us before using it.
    # If nothing changed, we answer "304 Not Modified" and it reuses its copy.
    headers = {"Cache-Control": "no-cache", "ETag": etag}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return HTMLResponse(page, headers=headers)


# ---------- Small files and checks ----------

@app.api_route("/healthz", methods=["GET", "HEAD"])
def healthz():
    # Fly.io calls this to check the server is up.
    return PlainTextResponse("ok", headers={"Cache-Control": "no-store"})


@app.api_route("/{name}", methods=["GET", "HEAD"])
def public_file(name: str):
    if name not in PUBLIC_FILES:
        raise StarletteHTTPException(status_code=404)
    headers = {"Cache-Control": f"public, max-age={PUBLIC_FILES[name]}"}
    if name in SHAREABLE_FILES:
        headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return FileResponse(SITE / name, headers=headers)


@app.exception_handler(StarletteHTTPException)
def not_found(request: Request, error: StarletteHTTPException):
    if error.status_code != 404:
        return PlainTextResponse(str(error.detail), status_code=error.status_code)
    return FileResponse(
        SITE / "404.html",
        status_code=404,
        headers={"Content-Security-Policy": CSP_404, "Cache-Control": "no-cache"},
    )
