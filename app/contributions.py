"""Builds the GitHub contribution graph: a year of squares, one per day,
darker on the days with more commits.

GitHub publishes the graph for every account as a small HTML page, so no
token is needed. We read the date and shade of each day from it and draw our
own SVG, which needs no script and so passes the site's security policy.
The graph goes between these two comments in index.html:

    <!-- GITHUB-CONTRIBUTIONS -->
    <!-- /GITHUB-CONTRIBUTIONS -->

Like the project cards, the server (app/main.py) refreshes it while it runs,
and whatever is saved in index.html is the backup. To refresh that backup, run:

    python3 -m app.contributions index.html

Only the Python standard library is used here.
"""

import html
import re
import sys
import urllib.request
from datetime import date

USER = "codingsqurl"

START = "<!-- GITHUB-CONTRIBUTIONS -->"
END = "<!-- /GITHUB-CONTRIBUTIONS -->"
PATTERN = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)

# Each day's square and the gap between squares, in SVG units.
CELL = 10
GAP = 3
STEP = CELL + GAP
# Room above the squares for the month names, and to their left for the day names.
TOP = 16
LEFT = 28

DAY = re.compile(r"<td\b[^>]*\bContributionCalendar-day\b[^>]*>")
TOOLTIP = re.compile(r'<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</tool-tip>')
TOTAL = re.compile(r"([\d,]+)\s+contributions?\s+in the last year")


def attr(tag, name):
    found = re.search(rf'\b{name}="([^"]*)"', tag)
    return found.group(1) if found else None


def fetch_calendar():
    """Returns (total for the year, [(date, level 0-4, tooltip text), ...]) sorted by date."""
    url = f"https://github.com/users/{USER}/contributions"
    request = urllib.request.Request(url, headers={"User-Agent": f"{USER}-portfolio"})
    with urllib.request.urlopen(request, timeout=10) as response:
        page = response.read().decode("utf-8")

    tooltips = {target: text.strip() for target, text in TOOLTIP.findall(page)}
    days = []
    for tag in DAY.findall(page):
        day = date.fromisoformat(attr(tag, "data-date"))
        level = int(attr(tag, "data-level") or 0)
        days.append((day, level, tooltips.get(attr(tag, "id"), "")))
    if not days:
        raise ValueError("no days found in GitHub's contribution page")
    days.sort()

    total = TOTAL.search(page)
    count = int(total.group(1).replace(",", "")) if total else 0
    return count, days


def graph(count, days):
    # Columns are weeks starting on Sunday, like GitHub's own graph.
    first = days[0][0]
    offset = (first.weekday() + 1) % 7  # Sunday = 0

    squares = []
    months = []
    for day, level, label in days:
        index = (day - first).days + offset
        week, weekday = divmod(index, 7)
        x, y = LEFT + week * STEP, TOP + weekday * STEP
        # A native tooltip from <title>, so hovering a square shows its count without a script.
        squares.append(
            f'<rect class="contrib-l{level}" x="{x}" y="{y}" width="{CELL}" height="{CELL}" rx="2">'
            f"<title>{html.escape(label)}</title></rect>"
        )
        # Label a month above the first week it starts in, unless it's too close to the last label.
        if day.day <= 7 and weekday == 0 and (not months or week - months[-1][0] >= 3):
            months.append((week, day.strftime("%b")))

    weeks = (len(days) + offset + 6) // 7
    width = LEFT + weeks * STEP - GAP
    height = TOP + 7 * STEP - GAP
    labels = "".join(f'<text x="{LEFT + w * STEP}" y="10">{m}</text>' for w, m in months)
    # GitHub labels every other row: Mon, Wed and Fri.
    labels += "".join(
        f'<text x="0" y="{TOP + row * STEP + CELL - 1}">{name}</text>'
        for row, name in ((1, "Mon"), (3, "Wed"), (5, "Fri"))
    )
    noun = "contribution" if count == 1 else "contributions"

    return f"""
            <figure class="contrib">
              <figcaption>{count:,} {noun} in the last year</figcaption>
              <svg viewBox="0 0 {width} {height}" role="img" aria-label="GitHub contribution graph: {count:,} {noun} in the last year">{labels}{"".join(squares)}</svg>
              <p class="contrib-legend" aria-hidden="true">Less <span class="contrib-l0"></span><span class="contrib-l1"></span><span class="contrib-l2"></span><span class="contrib-l3"></span><span class="contrib-l4"></span> More</p>
            </figure>
          """


def has_markers(page):
    return PATTERN.search(page) is not None


def insert_graph(page, calendar):
    """Returns the page with the graph between the markers swapped for a fresh one."""
    return PATTERN.sub(lambda _: START + graph(*calendar) + END, page)


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python3 -m app.contributions <file.html>")
    path = sys.argv[1]

    with open(path, encoding="utf-8") as f:
        page = f.read()
    if not has_markers(page):
        sys.exit(f"error: {START} and {END} markers not found in {path}")

    calendar = fetch_calendar()
    with open(path, "w", encoding="utf-8") as f:
        f.write(insert_graph(page, calendar))
    print(f"wrote the contribution graph: {calendar[0]} contributions over {len(calendar[1])} days")


if __name__ == "__main__":
    main()
