# portfolio

My web dev portfolio: hand-written HTML and CSS, served by a small Java server
on Fly.io. The server uses only what comes with Java 21, with no framework or
libraries. GitHub only stores the code. Nothing runs here.

Live at https://codingsqurl.fly.dev

## What the server does

- Serves the page, plus an explicit list of public files. Nothing else in the repo is reachable.
- Fills the Work section with cards for my public GitHub repos and refreshes them every hour.
- Draws my GitHub contribution graph for the past year, refreshed every hour.
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

## Deploy

```
fly deploy
```

Fly builds the container on its own servers, so Docker doesn't need to be running.
