# Cybersecurity checklist

This covers the people, accounts and devices around the site: the things an attacker would actually go after. A plain HTML page is hard to break into; your GitHub login, your email and your laptop are not. For the server itself, see `HARDENING-CHECKLIST.md`. For launch steps, see `CHECKLIST.md`.

## 1. Accounts
- [ ] Two-factor login on GitHub, using an authenticator app or a passkey, not SMS
- [ ] Two-factor login on Fly.io (Account → Settings)
- [ ] Two-factor login on the email account that receives password resets. Whoever controls that inbox can reset everything else
- [ ] Two-factor login on Discord and Buy Me a Coffee, since the site links to them and people trust those links
- [ ] Two-factor login at the domain registrar, once you buy a domain
- [ ] Recovery codes for each of these saved in a password manager
- [ ] A password manager with a unique password for every account
- [x] Commit email set to the GitHub noreply address, so your real email isn't in the public history

## 2. Your computer
The laptop holds your logged-in GitHub, Fly and email sessions. If it's stolen or infected, so are they.
- [ ] Turn on the macOS firewall: System Settings → Network → Firewall. Claude can't change system security settings, so this one is yours
- [ ] In Firewall → Options, turn on "Enable stealth mode", so the Mac doesn't answer pings or port scans from strangers on the same Wi-Fi
- [ ] Turn on FileVault (System Settings → Privacy & Security), so a stolen laptop's disk can't be read
- [ ] Turn on automatic macOS and app updates
- [ ] A screen lock that kicks in after a few minutes, with a password to unlock
- [ ] Only install software from the App Store, Homebrew or the developer's own site

## 3. Access tokens and logins
- [ ] Review GitHub → Settings → Applications and remove any app you don't recognise or use
- [ ] Review GitHub → Settings → Developer settings → Personal access tokens. Delete old ones, and give new ones an expiry date and the smallest scope that works
- [ ] Review GitHub → Settings → SSH and GPG keys. Remove keys for machines you no longer use
- [ ] Run `fly tokens list` and revoke any you don't need
- [ ] Never paste a token into a chat, issue, commit or screenshot. If one leaks, revoke it first, then work out what happened

## 4. The code
- [x] No secrets, keys or private notes in the repo or its history
- [x] `.env` is in `.gitignore`, so a secrets file can't be committed by accident
- [x] `main` is protected from force-pushes and deletion
- [ ] Turn on GitHub secret scanning and push protection (repo → Settings → Advanced Security), so GitHub blocks a push that contains a key
- [ ] Turn on Dependabot alerts for the Python packages in `requirements.txt`
- [ ] Read any pull request from someone else line by line before merging. The deploy runs whatever is in `main`

## 5. Phishing and scams
Most break-ins start with a fake message, not a clever exploit.
- [ ] Never log in through a link in an email or DM. Type the address yourself, or use a bookmark
- [ ] Treat "your site has a security problem, click here" or "your Fly account will be suspended" messages as fake until you check them on the real site
- [ ] Be careful with Discord friend requests and DMs that link to files or "game tests". Account theft on Discord usually starts there
- [ ] Your password manager won't autofill on a fake site. If it doesn't fill in, stop and check the address

## 6. Watching for trouble
- [ ] A free uptime check, such as UptimeRobot, that emails you if the site goes down or its content changes
- [ ] Turn on GitHub's security alert emails (Settings → Notifications)
- [ ] Check `fly logs` now and then. Lots of `403` lines are bots hitting the firewall, which is normal. A sudden flood of `429` lines means someone is hammering the site
- [ ] Every few months, look at your active sessions on GitHub, Fly and your email account, and sign out anything you don't recognise

## 7. If something goes wrong
Write these steps down now, so you're not working them out in a panic.
1. **Take the site down if it's showing something it shouldn't:** `fly scale count 0`
2. **Lock the account the attacker used:** change its password, sign out every session, and revoke its tokens and SSH keys
3. **Check what changed:** `git log` on GitHub, `fly releases` for deploys you didn't make, and the account's security log (GitHub → Settings → Security log)
4. **Put back a known-good version:** reset `main` to the last good commit and `fly deploy` from your own machine
5. **Bring it back:** `fly scale count 1`, then check the site and its headers
6. **Write down what happened** and which checklist item would have stopped it
