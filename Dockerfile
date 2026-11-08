# The recipe Fly.io follows to package the site and its server into a container.

FROM python:3.12-slim

# Print logs straight away, and don't litter the container with .pyc files.
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

WORKDIR /srv

# Install packages first, so Docker can reuse this step when only the site changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Only the server and the public site files go in. Notes like README.md and
# CHECKLIST.md never reach the live server.
COPY app/ app/
COPY index.html 404.html style.css favicon.svg og-image.png robots.txt ./

# Run as a regular user rather than root, so a bug in the server can't take over the container.
RUN useradd --system --no-create-home web
USER web

# Most hosts tell the server which port to use through $PORT. If none is given, use 8080.
ENV PORT=8080
EXPOSE 8080
# "exec" lets the host stop the server cleanly. --proxy-headers trusts the host's front door to say whether the visitor used https.
# --no-server-header stops every response announcing "uvicorn", which tells attackers what to aim at.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --proxy-headers --forwarded-allow-ips "*" --no-server-header
