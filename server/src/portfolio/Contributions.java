package portfolio;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Builds the GitHub contribution graph: a year of squares, one per day,
 * darker on the days with more commits.
 *
 * It shows the current calendar year, January to December, the same as picking
 * this year with the year buttons next to the graph on my GitHub profile. Days
 * still to come show as empty squares, just like on GitHub.
 *
 * With a GITHUB_TOKEN that has the read:user permission, it asks GitHub's API for
 * the graph as I see it when logged in: private work included, as plain counts
 * with no repo names. That's the graph that matches my profile exactly.
 *
 * Without a token it falls back to the public graph GitHub publishes as a small
 * HTML page, which leaves private work out.
 *
 * Either way it draws its own SVG, which needs no script and so passes the
 * site's security policy.
 * The graph goes between these two comments in index.html:
 *
 *     <!-- GITHUB-CONTRIBUTIONS -->
 *     <!-- /GITHUB-CONTRIBUTIONS -->
 *
 * Like the project cards, the server refreshes it while it runs, and whatever
 * is saved in index.html is the backup. Refresh.java updates that backup.
 */
final class Contributions {
    private Contributions() {}

    static final String START = "<!-- GITHUB-CONTRIBUTIONS -->";
    static final String END = "<!-- /GITHUB-CONTRIBUTIONS -->";
    static final Pattern PATTERN = Pattern.compile(Pattern.quote(START) + ".*?" + Pattern.quote(END), Pattern.DOTALL);

    // Each day's square and the gap between squares, in SVG units.
    static final int CELL = 10;
    static final int GAP = 3;
    static final int STEP = CELL + GAP;
    // Room above the squares for the month names, and to their left for the day names.
    static final int TOP = 16;
    static final int LEFT = 28;

    static final Pattern DAY = Pattern.compile("<td\\b[^>]*\\bContributionCalendar-day\\b[^>]*>");
    static final Pattern TOOLTIP = Pattern.compile("<tool-tip\\b[^>]*\\bfor=\"([^\"]+)\"[^>]*>([^<]*)</tool-tip>");
    // GitHub's caption: "112 contributions in 2026", or "in the last year" without a year picked.
    static final Pattern TOTAL = Pattern.compile("([\\d,]+)\\s+contributions?\\s+in\\s+(the last year|\\d{4})");

    record Day(LocalDate date, int level, String label) {}

    /** The total, the stretch of time it covers ("2026" or "the last year"), the days, and the
     *  activity overview (null when there's no token, since only GitHub's API has it). */
    record Calendar(int count, String period, List<Day> days, Overview overview) {
        Calendar(int count, String period, List<Day> days) {
            this(count, period, days, null);
        }
    }

    /** What the year's work was made of, like "Activity overview" on my GitHub profile.
     *  publicRepos holds only public repo names, busiest first; repoCount counts private ones too. */
    record Overview(int commits, int issues, int pullRequests, int reviews, List<String> publicRepos, int repoCount) {}

    static String attr(String tag, String name) {
        Matcher found = Pattern.compile("\\b" + name + "=\"([^\"]*)\"").matcher(tag);
        return found.find() ? found.group(1) : null;
    }

    static Calendar fetchCalendar() throws Exception {
        int year = LocalDate.now(ZoneOffset.UTC).getYear();
        String token = System.getenv("GITHUB_TOKEN");
        if (token != null && !token.isEmpty()) {
            return fetchFromApi(token, year);
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://github.com/users/" + Projects.USER
                        + "/contributions?from=" + year + "-01-01&to=" + year + "-12-31"))
                .timeout(Duration.ofSeconds(10))
                .header("User-Agent", Projects.USER + "-portfolio")
                .build();
        HttpResponse<String> response = Projects.HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("GitHub answered " + response.statusCode());
        }
        return parseCalendar(response.body());
    }

    // Asks for one calendar year of my contribution graph. Private work counts too, as long
    // as the token is mine and has the read:user permission.
    static final String QUERY = "query($login: String!, $from: DateTime!, $to: DateTime!) {"
            + " user(login: $login) { contributionsCollection(from: $from, to: $to) {"
            + " contributionCalendar { totalContributions"
            + " weeks { contributionDays { date contributionCount contributionLevel } } }"
            + " totalCommitContributions totalIssueContributions totalPullRequestContributions"
            + " totalPullRequestReviewContributions"
            + " commitContributionsByRepository(maxRepositories: 100) {"
            + " repository { nameWithOwner isPrivate } contributions { totalCount } } } } }";

    static Calendar fetchFromApi(String token, int year) throws Exception {
        String variables = "{\"login\": \"" + Projects.USER + "\", \"from\": \"" + year
                + "-01-01T00:00:00Z\", \"to\": \"" + year + "-12-31T23:59:59Z\"}";
        String body = "{\"query\": \"" + QUERY.replace("\"", "\\\"") + "\", \"variables\": " + variables + "}";
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.github.com/graphql"))
                .timeout(Duration.ofSeconds(10))
                .header("Authorization", "Bearer " + token)
                .header("User-Agent", Projects.USER + "-portfolio")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response = Projects.HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("GitHub's API answered " + response.statusCode());
        }
        return parseApi(response.body(), year);
    }

    // The API names the five shades; the page uses 0 to 4.
    static final Map<String, Integer> LEVELS = Map.of(
            "NONE", 0, "FIRST_QUARTILE", 1, "SECOND_QUARTILE", 2, "THIRD_QUARTILE", 3, "FOURTH_QUARTILE", 4);

    /** Reads GitHub's API reply into a calendar, writing each day's tooltip the way GitHub does. */
    @SuppressWarnings("unchecked")
    static Calendar parseApi(String json, int year) {
        Map<String, Object> reply = (Map<String, Object>) Json.parse(json);
        if (reply.get("errors") != null || reply.get("data") == null) {
            throw new IllegalStateException("GitHub's API refused the request: " + reply.get("errors"));
        }
        Map<String, Object> calendar = (Map<String, Object>) dig(reply, "data", "user", "contributionsCollection",
                "contributionCalendar");
        List<Day> days = new ArrayList<>();
        for (Object week : (List<Object>) calendar.get("weeks")) {
            for (Object item : (List<Object>) ((Map<String, Object>) week).get("contributionDays")) {
                Map<String, Object> day = (Map<String, Object>) item;
                LocalDate date = LocalDate.parse((String) day.get("date"));
                int count = ((Double) day.get("contributionCount")).intValue();
                days.add(new Day(date, LEVELS.getOrDefault(day.get("contributionLevel"), 0), tooltip(count, date)));
            }
        }
        if (days.isEmpty()) {
            throw new IllegalStateException("no days in GitHub's API reply");
        }
        days.sort(Comparator.comparing(Day::date));
        int total = ((Double) calendar.get("totalContributions")).intValue();
        Map<String, Object> collection = (Map<String, Object>) dig(reply, "data", "user", "contributionsCollection");
        return new Calendar(total, String.valueOf(year), days, parseOverview(collection));
    }

    /** The activity overview from the API reply, or null if the reply doesn't have it. */
    @SuppressWarnings("unchecked")
    static Overview parseOverview(Map<String, Object> collection) {
        if (!(collection.get("totalCommitContributions") instanceof Double commits)
                || !(collection.get("commitContributionsByRepository") instanceof List<?> byRepo)) {
            return null;
        }
        List<String> publicRepos = new ArrayList<>();
        for (Object item : byRepo) {
            Map<String, Object> repo = (Map<String, Object>) ((Map<String, Object>) item).get("repository");
            // Private repo names never go on the page; they only add to the "other repositories" count.
            if (repo != null && Boolean.FALSE.equals(repo.get("isPrivate")) && repo.get("nameWithOwner") instanceof String name) {
                publicRepos.add(name);
            }
        }
        return new Overview(commits.intValue(), number(collection, "totalIssueContributions"),
                number(collection, "totalPullRequestContributions"),
                number(collection, "totalPullRequestReviewContributions"), publicRepos, byRepo.size());
    }

    private static int number(Map<String, Object> map, String key) {
        return map.get(key) instanceof Double value ? value.intValue() : 0;
    }

    /** "No contributions on January 1st." or "7 contributions on November 3rd.", like GitHub's tooltips. */
    static String tooltip(int count, LocalDate date) {
        String when = date.format(DateTimeFormatter.ofPattern("MMMM", Locale.ENGLISH)) + " " + ordinal(date.getDayOfMonth());
        if (count == 0) {
            return "No contributions on " + when + ".";
        }
        return count + (count == 1 ? " contribution" : " contributions") + " on " + when + ".";
    }

    static String ordinal(int day) {
        if (day >= 11 && day <= 13) {
            return day + "th";
        }
        switch (day % 10) {
            case 1: return day + "st";
            case 2: return day + "nd";
            case 3: return day + "rd";
            default: return day + "th";
        }
    }

    @SuppressWarnings("unchecked")
    private static Object dig(Map<String, Object> map, String... keys) {
        Object here = map;
        for (String key : keys) {
            if (!(here instanceof Map)) {
                throw new IllegalStateException("GitHub's API reply is missing " + key);
            }
            here = ((Map<String, Object>) here).get(key);
        }
        if (here == null) {
            throw new IllegalStateException("GitHub's API reply is missing " + keys[keys.length - 1]);
        }
        return here;
    }

    /** Reads each day's date, shade and tooltip out of GitHub's contribution page. Separate
     *  from fetchCalendar so the tests can feed it a sample page without calling GitHub. */
    static Calendar parseCalendar(String page) {
        Map<String, String> tooltips = new HashMap<>();
        Matcher tip = TOOLTIP.matcher(page);
        while (tip.find()) {
            tooltips.put(tip.group(1), tip.group(2).strip());
        }

        List<Day> days = new ArrayList<>();
        Matcher tag = DAY.matcher(page);
        while (tag.find()) {
            String td = tag.group();
            String level = attr(td, "data-level");
            days.add(new Day(
                    LocalDate.parse(attr(td, "data-date")),
                    level == null || level.isEmpty() ? 0 : Integer.parseInt(level),
                    tooltips.getOrDefault(attr(td, "id"), "")));
        }
        if (days.isEmpty()) {
            throw new IllegalStateException("no days found in GitHub's contribution page");
        }
        days.sort(Comparator.comparing(Day::date));

        Matcher total = TOTAL.matcher(page);
        boolean found = total.find();
        int count = found ? Integer.parseInt(total.group(1).replace(",", "")) : 0;
        String period = found ? total.group(2) : String.valueOf(days.get(days.size() - 1).date().getYear());
        return new Calendar(count, period, days);
    }

    static String graph(Calendar calendar) {
        List<Day> days = calendar.days();
        // Columns are weeks starting on Sunday, like GitHub's own graph.
        LocalDate first = days.get(0).date();
        int offset = first.getDayOfWeek().getValue() % 7; // Sunday = 0

        StringBuilder squares = new StringBuilder();
        List<Integer> monthWeeks = new ArrayList<>();
        List<String> monthNames = new ArrayList<>();
        DateTimeFormatter month = DateTimeFormatter.ofPattern("MMM", Locale.ENGLISH);
        for (Day day : days) {
            int index = (int) ChronoUnit.DAYS.between(first, day.date()) + offset;
            int week = index / 7;
            int weekday = index % 7;
            int x = LEFT + week * STEP;
            int y = TOP + weekday * STEP;
            // A native tooltip from <title>, so hovering a square shows its count without a script.
            squares.append("<rect class=\"contrib-l").append(day.level()).append("\" x=\"").append(x)
                    .append("\" y=\"").append(y).append("\" width=\"").append(CELL).append("\" height=\"")
                    .append(CELL).append("\" rx=\"2\"><title>").append(Html.escape(day.label()))
                    .append("</title></rect>");
            // Label a month above the first week it starts in, unless it's too close to the last label.
            // The very first column counts too when the graph starts on the 1st, like January 1st.
            boolean farEnough = monthWeeks.isEmpty() || week - monthWeeks.get(monthWeeks.size() - 1) >= 3;
            boolean startsMonth = (day.date().getDayOfMonth() <= 7 && weekday == 0)
                    || (week == 0 && day.date().getDayOfMonth() == 1);
            if (startsMonth && farEnough) {
                monthWeeks.add(week);
                monthNames.add(day.date().format(month));
            }
        }

        int weeks = (days.size() + offset + 6) / 7;
        int width = LEFT + weeks * STEP - GAP;
        int height = TOP + 7 * STEP - GAP;
        StringBuilder labels = new StringBuilder();
        for (int i = 0; i < monthWeeks.size(); i++) {
            labels.append("<text x=\"").append(LEFT + monthWeeks.get(i) * STEP).append("\" y=\"10\">")
                    .append(monthNames.get(i)).append("</text>");
        }
        // GitHub labels every other row: Mon, Wed and Fri.
        String[] rowNames = {"", "Mon", "", "Wed", "", "Fri"};
        for (int row = 1; row <= 5; row += 2) {
            labels.append("<text x=\"0\" y=\"").append(TOP + row * STEP + CELL - 1).append("\">")
                    .append(rowNames[row]).append("</text>");
        }
        String noun = calendar.count() == 1 ? "contribution" : "contributions";
        String count = String.format(Locale.US, "%,d", calendar.count());

        return "\n"
                + "            <figure class=\"contrib\">\n"
                + "              <figcaption>" + count + " " + noun + " in " + calendar.period() + "</figcaption>\n"
                // On a phone the graph is wider than the screen, so it scrolls sideways inside its card.
                // tabindex lets keyboard users scroll it too.
                + "              <div class=\"contrib-scroll\" tabindex=\"0\" role=\"region\" aria-label=\"Contribution graph, scrolls sideways\">"
                + "<svg viewBox=\"0 0 " + width + " " + height + "\" role=\"img\" aria-label=\"GitHub contribution graph: "
                + count + " " + noun + " in " + calendar.period() + "\">" + labels + squares + "</svg></div>\n"
                + "              <p class=\"contrib-legend\" aria-hidden=\"true\">Less <span class=\"contrib-l0\"></span><span class=\"contrib-l1\"></span><span class=\"contrib-l2\"></span><span class=\"contrib-l3\"></span><span class=\"contrib-l4\"></span> More</p>\n"
                + "            </figure>\n"
                + overview(calendar.overview())
                + activity(days, LocalDate.now(ZoneOffset.UTC))
                + "          ";
    }

    // The activity graph: a line of how many contributions each of the last 31 days had.
    static final int ACTIVITY_DAYS = 31;
    static final int A_WIDTH = 714;
    static final int A_HEIGHT = 200;
    static final int A_LEFT = 28;
    static final int A_RIGHT = 8;
    static final int A_TOP = 10;
    static final int A_BOTTOM = 22;
    static final Pattern LEADING_NUMBER = Pattern.compile("^([\\d,]+)\\s+contribution");

    /** A day's count, read from its tooltip: "7 contributions on ..." is 7, anything else is 0. */
    static int count(Day day) {
        Matcher found = LEADING_NUMBER.matcher(day.label());
        return found.find() ? Integer.parseInt(found.group(1).replace(",", "")) : 0;
    }

    /** The line graph under the squares: the last 31 days up to today, one point per day. */
    static String activity(List<Day> all, LocalDate today) {
        List<Day> days = new ArrayList<>();
        for (Day day : all) {
            if (!day.date().isAfter(today)) {
                days.add(day);
            }
        }
        if (days.size() > ACTIVITY_DAYS) {
            days = days.subList(days.size() - ACTIVITY_DAYS, days.size());
        }
        if (days.size() < 2) {
            return "";
        }

        int max = 0;
        int total = 0;
        for (Day day : days) {
            max = Math.max(max, count(day));
            total += count(day);
        }
        // Round the top of the scale up to a multiple of 4, so the four gridlines land on whole numbers.
        int top = Math.max(4, (max + 3) / 4 * 4);
        double plotWidth = A_WIDTH - A_LEFT - A_RIGHT;
        double plotHeight = A_HEIGHT - A_TOP - A_BOTTOM;
        double base = A_TOP + plotHeight;

        StringBuilder grid = new StringBuilder();
        for (int i = 0; i <= 4; i++) {
            int value = top * i / 4;
            String y = num(base - plotHeight * i / 4);
            grid.append("<line class=\"activity-grid\" x1=\"").append(A_LEFT).append("\" y1=\"").append(y)
                    .append("\" x2=\"").append(A_WIDTH - A_RIGHT).append("\" y2=\"").append(y).append("\"/>")
                    .append("<text x=\"").append(A_LEFT - 6).append("\" y=\"").append(num(base - plotHeight * i / 4 + 3))
                    .append("\" text-anchor=\"end\">").append(value).append("</text>");
        }

        StringBuilder line = new StringBuilder();
        StringBuilder dots = new StringBuilder();
        StringBuilder labels = new StringBuilder();
        DateTimeFormatter label = DateTimeFormatter.ofPattern("MMM d", Locale.ENGLISH);
        for (int i = 0; i < days.size(); i++) {
            Day day = days.get(i);
            String x = num(A_LEFT + plotWidth * i / (days.size() - 1));
            String y = num(base - plotHeight * count(day) / top);
            line.append(i == 0 ? "M" : " L").append(x).append(' ').append(y);
            dots.append("<circle class=\"activity-dot\" cx=\"").append(x).append("\" cy=\"").append(y)
                    .append("\" r=\"3\"><title>").append(Html.escape(day.label())).append("</title></circle>");
            // Label every fifth day, counting back from today so the newest day always has a label.
            if ((days.size() - 1 - i) % 5 == 0) {
                // Today's label sits at the right edge, so it ends there instead of being
                // centred on it, or its second half falls outside the graph and gets cut off.
                String anchor = i == days.size() - 1 ? "end" : "middle";
                labels.append("<text x=\"").append(x).append("\" y=\"").append(A_HEIGHT - 6)
                        .append("\" text-anchor=\"").append(anchor).append("\">").append(day.date().format(label)).append("</text>");
            }
        }
        String area = line + " L" + num(A_LEFT + plotWidth) + ' ' + num(base) + " L" + A_LEFT + ' ' + num(base) + " Z";
        String noun = total == 1 ? "contribution" : "contributions";

        return "\n"
                + "            <figure class=\"contrib activity\">\n"
                + "              <figcaption>Activity: " + total + " " + noun + " in the last " + days.size() + " days</figcaption>\n"
                + "              <div class=\"contrib-scroll\" tabindex=\"0\" role=\"region\" aria-label=\"Activity graph, scrolls sideways\">"
                + "<svg viewBox=\"0 0 " + A_WIDTH + " " + A_HEIGHT + "\" role=\"img\" aria-label=\"Activity graph: "
                + total + " " + noun + " in the last " + days.size() + " days\">"
                + grid + "<path class=\"activity-area\" d=\"" + area + "\"/>"
                + "<path class=\"activity-line\" d=\"" + line + "\"/>" + dots + labels + "</svg></div>\n"
                + "            </figure>\n";
    }

    // The overview's cross: four arms from the middle, one per kind of work. The canvas has
    // room round the arms for the labels: two lines (percentage and name) above and below,
    // so the bottom label's descenders stay inside it.
    static final int O_WIDTH = 360;
    static final int O_HEIGHT = 250;
    static final int O_ARM = 76;

    /** "Activity overview": the repos I worked in, and a cross whose arms show how my work splits
     *  between commits, issues, pull requests and code review. Empty without data. */
    static String overview(Overview data) {
        if (data == null) {
            return "";
        }
        int total = data.commits() + data.issues() + data.pullRequests() + data.reviews();
        if (total == 0) {
            return "";
        }

        // Up to three public repos by name, like GitHub, linked to their pages.
        List<String> shown = data.publicRepos().subList(0, Math.min(3, data.publicRepos().size()));
        StringBuilder repos = new StringBuilder();
        for (int i = 0; i < shown.size(); i++) {
            repos.append(i == 0 ? "" : ", ").append("<a href=\"https://github.com/").append(Html.escape(shown.get(i)))
                    .append("\">").append(Html.escape(shown.get(i))).append("</a>");
        }
        int others = data.repoCount() - shown.size();
        String othersText = others + " other " + (others == 1 ? "repository" : "repositories");
        String contributed = shown.isEmpty() ? "Contributed to " + othersText
                : "Contributed to " + repos + (others > 0 ? " and " + othersText : "");

        int cx = O_WIDTH / 2;
        int cy = O_HEIGHT / 2;
        // Clockwise from the top: code review, issues, pull requests, commits. Same as GitHub.
        String[] names = {"Code review", "Issues", "Pull requests", "Commits"};
        int[] counts = {data.reviews(), data.issues(), data.pullRequests(), data.commits()};
        int[][] directions = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};

        StringBuilder arms = new StringBuilder();
        StringBuilder shape = new StringBuilder();
        StringBuilder dots = new StringBuilder();
        StringBuilder labels = new StringBuilder();
        StringBuilder spoken = new StringBuilder();
        for (int i = 0; i < 4; i++) {
            int dx = directions[i][0];
            int dy = directions[i][1];
            int percent = (int) Math.round(100.0 * counts[i] / total);
            arms.append("<line class=\"overview-arm\" x1=\"").append(cx).append("\" y1=\"").append(cy)
                    .append("\" x2=\"").append(cx + dx * O_ARM).append("\" y2=\"").append(cy + dy * O_ARM).append("\"/>");
            String x = num(cx + dx * O_ARM * counts[i] / (double) total);
            String y = num(cy + dy * O_ARM * counts[i] / (double) total);
            shape.append(i == 0 ? "M" : " L").append(x).append(' ').append(y);
            if (counts[i] > 0) {
                dots.append("<circle class=\"overview-dot\" cx=\"").append(x).append("\" cy=\"").append(y)
                        .append("\" r=\"3\"><title>").append(counts[i]).append(' ').append(names[i].toLowerCase(Locale.ENGLISH))
                        .append("</title></circle>");
            }
            // The percentage sits above the name, but only when it isn't 0%, like on GitHub.
            String name = names[i];
            String lead = percent > 0 ? percent + "%" : "";
            int gap = 12;
            if (dy != 0) {
                int ly = dy < 0 ? cy - O_ARM - gap : cy + O_ARM + gap + 9;
                if (!lead.isEmpty()) {
                    labels.append(text(cx, dy < 0 ? ly - 14 : ly, "middle", lead));
                    ly = dy < 0 ? ly : ly + 14;
                }
                labels.append(text(cx, ly, "middle", name));
            } else {
                int lx = cx + dx * (O_ARM + gap);
                String anchor = dx < 0 ? "end" : "start";
                if (lead.isEmpty()) {
                    labels.append(text(lx, cy + 4, anchor, name));
                } else {
                    labels.append(text(lx, cy - 3, anchor, lead)).append(text(lx, cy + 11, anchor, name));
                }
            }
            spoken.append(i == 0 ? "" : ", ").append(percent).append("% ").append(name.toLowerCase(Locale.ENGLISH));
        }

        return "\n"
                + "            <figure class=\"contrib overview\">\n"
                + "              <figcaption>Activity overview</figcaption>\n"
                + "              <p class=\"overview-repos\">" + contributed + "</p>\n"
                + "              <svg viewBox=\"0 0 " + O_WIDTH + " " + O_HEIGHT + "\" role=\"img\" aria-label=\"How my work splits up: "
                + spoken + "\">" + arms + "<path class=\"overview-shape\" d=\"" + shape + " Z\"/>" + dots + labels + "</svg>\n"
                + "            </figure>\n";
    }

    private static String text(int x, int y, String anchor, String words) {
        return "<text x=\"" + x + "\" y=\"" + y + "\" text-anchor=\"" + anchor + "\">" + Html.escape(words) + "</text>";
    }

    // SVG coordinates with at most one decimal place, so the page stays small.
    static String num(double value) {
        double rounded = Math.round(value * 10) / 10.0;
        return rounded == Math.rint(rounded) ? String.valueOf((long) rounded) : String.valueOf(rounded);
    }

    static boolean hasMarkers(String page) {
        return PATTERN.matcher(page).find();
    }

    /** Returns the page with the graph between the markers swapped for a fresh one. */
    static String insertGraph(String page, Calendar calendar) {
        return PATTERN.matcher(page).replaceAll(Matcher.quoteReplacement(START + graph(calendar) + END));
    }
}
