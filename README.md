# portfolio

My web dev portfolio: hand-written HTML and CSS, with a small Java server that
uses only what comes with Java 21, with no framework or libraries.

Live at https://codingsqurl.github.io/portfolio/ (a static copy on GitHub Pages;
see "Deploy" below). The terminal page is at https://codingsqurl.github.io/portfolio/terminal.

## What the server does

- Serves the page, plus an explicit list of public files. Nothing else in the repo is reachable.
- Fills the Work section with cards for my public GitHub repos, refreshed every 10 minutes.
- Draws my GitHub contribution graph for the current year (January to December, like picking the year on my GitHub profile) in GitHub's own colours, refreshed every 10 minutes. With a `GITHUB_TOKEN` that has the `read:user` permission it includes private work, so it matches my profile exactly. `./run.sh` uses my `gh` login for that automatically; on Fly.io, set it with `fly secrets set GITHUB_TOKEN=...` (a classic token with only `read:user`).
- Runs every request through a firewall (`server/src/portfolio/Firewall.java`) that blocks floods, scanners and anything that isn't a plain page visit.
- Sends the security headers and caching rules with every response.

## Security

- `CHECKLIST.md`: going live
- `SECURITY-CHECKLIST.md`: accounts, devices, phishing and what to do if something goes wrong
- `HARDENING-CHECKLIST.md`: the server, container, firewall and Fly.io setup

## Work on the design

Run `live-server` in this folder. The browser reloads every time you save.

## Run the real server locally

You need Java 21 (`brew install openjdk@21`). Then:

```
./run.sh
```

Then open http://127.0.0.1:8000. After changing a `.java` file, stop it with
Ctrl-C and run it again.

To update the backup project cards and contribution graph saved in `index.html`
(what the site shows if GitHub can't be reached):

```
./run.sh refresh
```

## The code

All in `server/src/portfolio/`:

- `Server.java`: starts the server, picks the page for each address, adds the headers
- `Firewall.java`: turns away bad requests before they reach the site
- `Projects.java`: the project cards, from GitHub's list of repos
- `Contributions.java`: the contribution graph
- `Json.java`: reads GitHub's repo list (Java has no JSON reader built in)
- `Html.java`: makes text from GitHub safe to put in the page
- `Refresh.java`: what `./run.sh refresh` runs

## Deploy (GitHub Pages)

The live site is a static copy on GitHub Pages at
https://codingsqurl.github.io/portfolio/, published from the `gh-pages` branch
(no GitHub Actions). To publish changes, and to update its cards and
contribution graph with the latest from GitHub:

```
./run.sh pages
```

It's live a minute or so later. It can't refresh itself, so the GitHub data is
as fresh as the last time this ran. My `gh` login is used only while it builds,
so the graph includes private work; the token never goes in the published files.

## Tests

```
./run.sh test
```

96 tests in `server/test/portfolio/`, using a small runner (`Check.java`) instead
of a test library. They start a real copy of the server and send it real
requests, so they cover:

- The firewall: every kind of request it refuses, bans, rate limits, and that
  real visitors still get through
- The security headers, caching, gzip, HEAD and 304 replies
- That nothing outside the public files can be reached
- That text from GitHub is escaped before it reaches the page
- The JSON reader, the project cards and the contribution graph

They never call GitHub, so they work offline. Run them before every deploy.

## Running the server on Fly.io (not in use)

The Java server can also run on Fly.io, with its firewall and a refresh every
10 minutes. It isn't deployed right now. To use it later:

```
fly apps create codingsqurl
fly deploy
```

Fly builds the container on its own servers, so Docker doesn't need to be running.
