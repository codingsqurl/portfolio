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

    /** The total, the stretch of time it covers ("2026" or "the last year"), and the days. */
    record Calendar(int count, String period, List<Day> days) {}

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
            + " weeks { contributionDays { date contributionCount contributionLevel } } } } } }";

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
        return new Calendar(total, String.valueOf(year), days);
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
                + "          ";
    }

    static boolean hasMarkers(String page) {
        return PATTERN.matcher(page).find();
    }

    /** Returns the page with the graph between the markers swapped for a fresh one. */
    static String insertGraph(String page, Calendar calendar) {
        return PATTERN.matcher(page).replaceAll(Matcher.quoteReplacement(START + graph(calendar) + END));
    }
}
