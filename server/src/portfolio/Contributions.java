package portfolio;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
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
 * GitHub publishes the graph for every account as a small HTML page, so no
 * token is needed. We read the date and shade of each day from it and draw our
 * own SVG, which needs no script and so passes the site's security policy.
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
    static final Pattern TOTAL = Pattern.compile("([\\d,]+)\\s+contributions?\\s+in the last year");

    record Day(LocalDate date, int level, String label) {}

    record Calendar(int count, List<Day> days) {}

    static String attr(String tag, String name) {
        Matcher found = Pattern.compile("\\b" + name + "=\"([^\"]*)\"").matcher(tag);
        return found.find() ? found.group(1) : null;
    }

    static Calendar fetchCalendar() throws Exception {
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create("https://github.com/users/" + Projects.USER + "/contributions"))
                .timeout(Duration.ofSeconds(10))
                .header("User-Agent", Projects.USER + "-portfolio")
                .build();
        HttpResponse<String> response = Projects.HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("GitHub answered " + response.statusCode());
        }
        String page = response.body();

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
        int count = total.find() ? Integer.parseInt(total.group(1).replace(",", "")) : 0;
        return new Calendar(count, days);
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
            boolean farEnough = monthWeeks.isEmpty() || week - monthWeeks.get(monthWeeks.size() - 1) >= 3;
            if (day.date().getDayOfMonth() <= 7 && weekday == 0 && farEnough) {
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
                + "              <figcaption>" + count + " " + noun + " in the last year</figcaption>\n"
                + "              <svg viewBox=\"0 0 " + width + " " + height + "\" role=\"img\" aria-label=\"GitHub contribution graph: "
                + count + " " + noun + " in the last year\">" + labels + squares + "</svg>\n"
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
