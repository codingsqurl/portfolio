"""Fills the Work section with project cards from GitHub.

Every public repo on the account that isn't a fork or archived gets a card,
newest first. The cards are written into the HTML file between these two
comments, replacing whatever was there before:

    <!-- GITHUB-PROJECTS -->
    <!-- /GITHUB-PROJECTS -->

The deploy runs this on the copy it publishes, so the live site is always
current. To preview the cards locally, run it on index.html:

    python3 scripts/sync_projects.py index.html

Only the Python standard library is used, so there is nothing to install.
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


def fetch_repos():
    url = f"https://api.github.com/users/{USER}/repos?type=owner&per_page=100"
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    # A token is optional, but without one GitHub allows only 60 requests an hour.
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


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


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python3 scripts/sync_projects.py <file.html>")
    path = sys.argv[1]

    try:
        repos = fetch_repos()
    except Exception as error:
        # Don't block the deploy if GitHub is having a bad day: keep the cards already in the file.
        print(f"warning: couldn't reach GitHub ({error}), keeping the existing cards")
        return

    repos = [
        r for r in repos
        if not r["private"] and not r["fork"] and not r["archived"] and r["name"] not in SKIP
    ]
    repos.sort(key=lambda r: r["pushed_at"], reverse=True)

    with open(path, encoding="utf-8") as f:
        page = f.read()

    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
    if not pattern.search(page):
        sys.exit(f"error: {START} and {END} markers not found in {path}")

    # Line up the closing marker with the opening one.
    cards = "\n" + "".join(card(r) for r in repos) + "            "
    page = pattern.sub(lambda _: START + cards + END, page)

    with open(path, "w", encoding="utf-8") as f:
        f.write(page)
    print(f"wrote {len(repos)} project cards: {', '.join(r['name'] for r in repos)}")


if __name__ == "__main__":
    main()
