# Hardening checklist

Hardening means shrinking what an attacker can reach and what they can do if they get in. This covers the server, the container and the Fly.io setup. For accounts and devices, see `SECURITY-CHECKLIST.md`.

## 1. Network and firewall
- [x] Only web traffic reaches the server. Fly opens ports 80 and 443 and nothing else, so there's no SSH or database port to attack
- [x] Plain `http://` is redirected to `https://` (`force_https` in `fly.toml`)
- [x] An application firewall checks every request before the server does (`app/firewall.py`):
  - [x] Only `GET` and `HEAD` are allowed. Everything else gets `405`
  - [x] Requests for any other site name get `421`. This stops bots that scan raw IP addresses
  - [x] Addresses longer than 2,048 characters get `414`
  - [x] Requests that carry a body get `413`
  - [x] Each IP gets 60 requests straight away, then 2 a second. Past that, `429`
  - [x] Probes for things like `/wp-login.php`, `/.env`, `/.git` or `../` get `403`, and that IP is banned for an hour
  - [x] The firewall reads the visitor's IP from `Fly-Client-IP`, which Fly sets itself, so it can't be faked to dodge a ban
- [ ] When you add a custom domain, add it to `ALLOWED_HOSTS` under `[env]` in `fly.toml`, or the firewall will turn its visitors away
- [ ] Consider putting Cloudflare (free plan) in front of the site once it has a domain. It absorbs big floods that would overwhelm one small machine

## 2. What the server will serve
- [x] Only an explicit list of files can be served. The README, checklists and server code can't be reached, even by guessing
- [x] Only the public site files are copied into the container (`Dockerfile`), so notes never reach the live server
- [x] FastAPI's automatic `/docs`, `/redoc` and `/openapi.json` pages are turned off
- [x] Missing pages get the plain `404.html`, never an error message showing code or file paths
- [x] Everything from GitHub (repo names, descriptions, contribution counts) is HTML-escaped before it goes on the page

## 3. Browser protections
- [x] Content-Security-Policy: only this site's files load, scripts never run, and no other site can frame it
- [x] Strict-Transport-Security, so browsers never fall back to plain http
- [x] X-Content-Type-Options, Referrer-Policy, Permissions-Policy and Cross-Origin-Opener-Policy
- [x] Refusals from the firewall carry the same headers
- [ ] Once the site has been on https for a few weeks with no problems, add `; includeSubDomains` to Strict-Transport-Security, and later consider `; preload`
- [ ] Re-scan at securityheaders.com and observatory.mozilla.org after any change to the headers

## 4. The container
- [x] Built on the small `python:3.12-slim` image, so there are fewer programs inside to exploit
- [x] The server runs as a regular user (`web`), not root
- [x] Responses don't announce the server software (`--no-server-header`)
- [x] No secrets are stored in the image
- [ ] Pin the base image to an exact version (for example `python:3.12.8-slim`) so a deploy can't silently pull a changed image, and bump it on purpose every month or two

## 5. Dependencies
- [x] Python packages are pinned to exact versions in `requirements.txt`
- [x] The GitHub cards and contribution graph use only Python's built-in libraries, so there are fewer packages to trust
- [ ] Turn on Dependabot alerts, and update FastAPI, Starlette and Uvicorn when a security fix comes out
- [ ] Every few months, run `.venv/bin/pip install pip-audit && .venv/bin/pip-audit -r requirements.txt` to check for known holes

## 6. Fly.io
- [x] One small machine that stops when idle, which also limits how much a flood can cost you
- [x] Fly checks `/healthz` every 30 seconds and restarts the server if it stops answering
- [ ] Add a spending limit or billing alert in the Fly dashboard
- [ ] Two-factor login on the Fly account (see `SECURITY-CHECKLIST.md`)
- [ ] Deploy only from your own machine with `fly deploy`. No CI keys, no GitHub Actions, nothing else holding a Fly token

## 7. Keep it hard
- [ ] After every change to the server, re-run the firewall tests: a normal visit works, and a POST, a wrong host and `/wp-login.php` are refused
- [ ] Re-read this list every few months. Anything new you add, like a form, a script or a database, needs its own row here
