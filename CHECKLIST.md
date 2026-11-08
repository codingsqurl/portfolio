# Going live checklist

Your site is plain HTML and CSS with no forms, no JavaScript and no server code, so there is very little to hack on the page itself. The real risks are the accounts around it: GitHub, your domain and your host. If someone gets into one of those, they can replace the whole site.

## 1. Lock down your accounts first
- [ ] Turn on two-factor login for GitHub, using an authenticator app or a passkey rather than SMS
      (GitHub → Settings → Password and authentication)
- [ ] Save the GitHub recovery codes somewhere safe, like a password manager
- [ ] Use a password manager with a unique password for each account (GitHub, domain, host, email)
- [ ] Turn on two-factor login for the email account these logins use. Whoever controls that email can reset everything else
- [x] Set your commit email to your GitHub noreply address so your real email isn't public in the commit history
      `git config --global user.email "254838988+codingsqurl@users.noreply.github.com"`
      (the exact address is under GitHub → Settings → Emails)
- [ ] Turn on GitHub → Settings → Emails → "Block command line pushes that expose my email"

## 2. Clean up the repo before it goes public
- [x] Decide whether the repo stays private. Cloudflare Pages and Netlify can deploy a private repo for free. GitHub Pages needs a public repo unless you pay for GitHub Pro
- [x] Remove `.claude/launch.json` from git, or ignore it. It's harmless, but it's local tooling that shouldn't be published
      `git rm --cached -r .claude` then add `.claude/` to a new `.gitignore`
- [x] Add a `.gitignore` covering `.DS_Store`, `.claude/`, `.env` and `node_modules/`
- [x] Check that no secrets, keys or private notes are anywhere in the git history
- [x] Protect the `main` branch so it can't be force-pushed or deleted
      (repo → Settings → Rules → add a ruleset for `main`)

## 3. Host: Fly.io
The site runs as a small Java server on Fly.io. GitHub only stores the code: no GitHub Pages, no GitHub Actions.
- [x] Choose a host: **Fly.io**, with the Java server in `server/`
- [ ] Log in with `fly auth login` and deploy with `fly deploy`
- [ ] Open https://codingsqurl.fly.dev and confirm the site loads
- [ ] Turn off GitHub Pages once Fly is live, so the old copy stops being served
- [ ] Add a spending limit or billing alert in the Fly dashboard so a surprise bill can't happen

## 4. Domain
- [ ] Buy a domain from a registrar that doesn't charge a markup, such as Cloudflare Registrar or Porkbun
- [ ] Turn on two-factor login at the registrar
- [ ] Turn on registrar lock (transfer lock) so nobody can move the domain away from you
- [ ] Turn on WHOIS privacy so your name, address and phone number aren't public
- [ ] Turn on auto-renew. An expired domain can be bought by someone else, who then serves whatever they want on it
- [ ] Point the domain at your host and add it as a custom domain there
- [ ] Decide between `www` and the bare domain, and redirect the other one to it

## 5. HTTPS
- [ ] Confirm Fly issued a certificate and the site loads over `https://`
- [x] Force all `http://` traffic to redirect to `https://` (`force_https` in `fly.toml`)
- [x] Turn on HSTS so browsers never try plain http again (the server sends it, see step 6)

## 6. Security headers
The server sends these with every response. They're listed in `SECURITY_HEADERS` in `server/src/portfolio/Server.java`.
- [x] Send the Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy and Strict-Transport-Security headers. Loosen the Content-Security-Policy if you later add Google Fonts, scripts or embeds, or they'll be blocked
- [ ] Check that the page still looks right with the headers on (open the browser console and look for blocked resources)
- [ ] Scan the live site at securityheaders.com and aim for an A
- [ ] Scan it at observatory.mozilla.org as well

## 7. Things that make it feel like a real site
- [x] Favicon (`favicon.ico` or an SVG icon) linked in `<head>`
- [x] Open Graph tags (`og:title`, `og:description`, `og:image`) so links look good when shared
- [x] A `404.html` page
- [x] `robots.txt`, plus a `sitemap.xml` if you add more pages
- [x] Add `rel="noopener"` to any link that opens in a new tab (`target="_blank"`)
- [ ] A real way to contact you. A `mailto:` link is the simplest and needs no server. If you add a contact form later, use a form service with spam protection rather than building your own backend
- [ ] Test on your phone, plus at least Safari and Chrome
- [ ] Run Lighthouse in Chrome DevTools and fix anything flagged under accessibility or performance
- [ ] Compress images and set `width` and `height` on them

## 8. After launch
- [ ] Set up a free uptime check, such as UptimeRobot, that emails you if the site goes down
- [ ] Turn on GitHub Dependabot alerts (repo → Settings → Advanced Security). They only send alerts, and no code runs. The server has no libraries, so they matter less now, but they also cover the Docker base image
- [ ] Look over your GitHub, registrar and host accounts every few months: active sessions, connected apps and access tokens
- [ ] Re-scan the security headers whenever you add a script, font or embed
