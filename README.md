# portfolio

My web dev portfolio: hand-written HTML and CSS, served by a small Java server
on Fly.io. The server uses only what comes with Java 21, with no framework or
libraries. GitHub only stores the code. Nothing runs here.

Live at https://codingsqurl.fly.dev

## What the server does

- Serves the page, plus an explicit list of public files. Nothing else in the repo is reachable.
- Fills the Work section with cards for my public GitHub repos, refreshed every 10 minutes.
- Draws my GitHub contribution graph for the past year in GitHub's own colours, refreshed every 10 minutes.
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

## GitHub Pages copy

While the Fly.io server isn't live, a static copy runs on GitHub Pages at
https://codingsqurl.github.io/portfolio/, published from the `gh-pages` branch
(no GitHub Actions). It can't refresh itself, so to update its cards and
contribution graph with the latest from GitHub:

```
./run.sh pages
```

## Tests

```
./run.sh test
```

67 tests in `server/test/portfolio/`, using a small runner (`Check.java`) instead
of a test library. They start a real copy of the server and send it real
requests, so they cover:

- The firewall: every kind of request it refuses, bans, rate limits, and that
  real visitors still get through
- The security headers, caching, gzip, HEAD and 304 replies
- That nothing outside the public files can be reached
- That text from GitHub is escaped before it reaches the page
- The JSON reader, the project cards and the contribution graph

They never call GitHub, so they work offline. Run them before every deploy.

## Deploy

```
fly deploy
```

Fly builds the container on its own servers, so Docker doesn't need to be running.
