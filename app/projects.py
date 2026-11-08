"""Builds the Work section's project cards from GitHub.

Every public repo on the account that isn't a fork or archived gets a card,
newest first. The cards go between these two comments in index.html,
replacing whatever was there before:

    <!-- GITHUB-PROJECTS -->
    <!-- /GITHUB-PROJECTS -->

The web server (app/main.py) does this while it runs, so the live site is
always current. Whatever cards are saved in index.html are the backup it
shows if GitHub can't be reached. To refresh that backup, run:

    python3 -m app.projects index.html

Only the Python standard library is used here.
"""

import html
import json
import os
import re
import sys
import urllib.request
from datetime import datetime

USER = "codingsqurl"
# Repos that never get a card, even when public.
SKIP = {"portfolio"}

START = "<!-- GITHUB-PROJECTS -->"
END = "<!-- /GITHUB-PROJECTS -->"
PATTERN = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)


def fetch_repos():
    url = f"https://api.github.com/users/{USER}/repos?type=owner&per_page=100"
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    # A token is optional, but without one GitHub allows only 60 requests an hour.
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=10) as response:
        repos = json.load(response)

    repos = [
        r for r in repos
        if not r["private"] and not r["fork"] and not r["archived"] and r["name"] not in SKIP
    ]
    repos.sort(key=lambda r: r["pushed_at"], reverse=True)
    return repos


def card(repo):
    # Everything from GitHub is escaped, so a description can't inject HTML into the page.
    name = html.escape(repo["name"])
    language = html.escape(repo["language"] or "Code")
    updated = datetime.strptime(repo["pushed_at"][:10], "%Y-%m-%d").strftime("%b %Y")
    description = html.escape(repo["description"] or f"A {repo['language'] or 'code'} project.")

    links = [f'<a href="{html.escape(repo["html_url"])}">View code →</a>']
    if repo.get("homepage"):
        links.insert(0, f'<a href="{html.escape(repo["homepage"])}">Visit site →</a>')

    return f"""            <article class="card reveal">
              <p class="card-label">{language} · Updated {updated}</p>
              <h3>{name}</h3>
              <p>{description}</p>
              <p class="card-links">{" ".join(links)}</p>
            </article>
"""


def has_markers(page):
    return PATTERN.search(page) is not None


def insert_cards(page, repos):
    """Returns the page with the cards between the markers swapped for fresh ones."""
    # Line up the closing marker with the opening one.
    cards = "\n" + "".join(card(r) for r in repos) + "            "
    return PATTERN.sub(lambda _: START + cards + END, page)


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python3 -m app.projects <file.html>")
    path = sys.argv[1]

    with open(path, encoding="utf-8") as f:
        page = f.read()
    if not has_markers(page):
        sys.exit(f"error: {START} and {END} markers not found in {path}")

    repos = fetch_repos()
    with open(path, "w", encoding="utf-8") as f:
        f.write(insert_cards(page, repos))
    print(f"wrote {len(repos)} project cards: {', '.join(r['name'] for r in repos)}")


if __name__ == "__main__":
    main()
