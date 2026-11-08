# portfolio

My web dev portfolio: hand-written HTML and CSS, served by a small Python
(FastAPI) server on Fly.io. GitHub only stores the code. Nothing runs here.

Live at https://codingsqurl.fly.dev

## What the server does

- Serves the page, plus an explicit list of public files. Nothing else in the repo is reachable.
- Fills the Work section with cards for my public GitHub repos and refreshes them every hour.
- Draws my GitHub contribution graph for the past year, refreshed every hour.
- Runs every request through a firewall (`app/firewall.py`) that blocks floods, scanners and anything that isn't a plain page visit.
- Sends the security headers and caching rules with every response.

## Security

- `CHECKLIST.md`: going live
- `SECURITY-CHECKLIST.md`: accounts, devices, phishing and what to do if something goes wrong
- `HARDENING-CHECKLIST.md`: the server, container, firewall and Fly.io setup

## Work on the design

Run `live-server` in this folder. The browser reloads every time you save.

## Run the real server locally

```
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Then open http://127.0.0.1:8000

## Deploy

```
fly deploy
```

Fly builds the container on its own servers, so Docker doesn't need to be running.
