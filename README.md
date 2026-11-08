# portfolio

My web dev portfolio: hand-written HTML and CSS, served by a small Python
(FastAPI) server on Fly.io. GitHub only stores the code. Nothing runs here.

Live at https://codingsqurl.fly.dev

## What the server does

- Serves the page, plus an explicit list of public files. Nothing else in the repo is reachable.
- Fills the Work section with cards for my public GitHub repos and refreshes them every hour.
- Sends the security headers and caching rules with every response.

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
