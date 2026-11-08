package portfolio;

import static portfolio.Check.contains;
import static portfolio.Check.equal;
import static portfolio.Check.fails;
import static portfolio.Check.isTrue;
import static portfolio.Check.lacks;
import static portfolio.Check.section;
import static portfolio.Check.test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;

/** The contribution graph: reading GitHub's page and drawing the squares. */
final class ContributionsTest {
    private ContributionsTest() {}

    /** A cut-down copy of GitHub's contribution page: three days, out of order, plus their tooltips. */
    static final String PAGE = """
            <h2 id="js-contribution-activity-description" class="f4 text-normal mb-2">
              1,234
              contributions
                in the last year
            </h2>
            <td tabindex="0" data-ix="1" style="width: 11px" data-date="2026-11-03" id="day-b" data-level="2" class="ContributionCalendar-day"></td>
            <td tabindex="0" data-ix="0" style="width: 11px" data-date="2026-11-01" id="day-a" data-level="0" class="ContributionCalendar-day"></td>
            <td tabindex="0" data-ix="2" style="width: 11px" data-date="2026-11-04" id="day-c" class="ContributionCalendar-day"></td>
            <tool-tip for="day-a" class="sr-only">No contributions on November 1st.</tool-tip>
            <tool-tip for="day-b" class="sr-only"> 7 contributions on November 3rd. </tool-tip>
            """;

    static Contributions.Calendar calendar(int count, LocalDate first, int days) {
        List<Contributions.Day> list = new java.util.ArrayList<>();
        for (int i = 0; i < days; i++) {
            list.add(new Contributions.Day(first.plusDays(i), i % 5, "day " + i));
        }
        return new Contributions.Calendar(count, list);
    }

    static void run() {
        section("Contributions");

        test("reads the year's total, commas and all", () -> {
            equal(1234, Contributions.parseCalendar(PAGE).count());
        });

        test("reads each day's date and shade, sorted by date", () -> {
            List<Contributions.Day> days = Contributions.parseCalendar(PAGE).days();
            equal(3, days.size());
            equal(LocalDate.of(2026, 11, 1), days.get(0).date());
            equal(0, days.get(0).level());
            equal(LocalDate.of(2026, 11, 3), days.get(1).date());
            equal(2, days.get(1).level());
        });

        test("matches each day to its tooltip, trimmed", () -> {
            equal("7 contributions on November 3rd.", Contributions.parseCalendar(PAGE).days().get(1).label());
        });

        test("a day with no shade or tooltip counts as empty", () -> {
            Contributions.Day last = Contributions.parseCalendar(PAGE).days().get(2);
            equal(0, last.level());
            equal("", last.label());
        });

        test("a page with no days is an error, so the saved graph is kept", () -> {
            fails(() -> Contributions.parseCalendar("<html>GitHub changed its page</html>"));
        });

        test("the first week starts on Sunday: a Wednesday sits in the fourth row", () -> {
            // 2026-11-04 is a Wednesday, so it's row 3 counting from 0.
            String svg = Contributions.graph(calendar(5, LocalDate.of(2026, 11, 4), 1));
            int y = Contributions.TOP + 3 * Contributions.STEP;
            contains(svg, "x=\"" + Contributions.LEFT + "\" y=\"" + y + "\"");
        });

        test("one square per day, with its shade as a class", () -> {
            String svg = Contributions.graph(calendar(5, LocalDate.of(2026, 1, 4), 10));
            equal(10, svg.split("<rect ", -1).length - 1);
            contains(svg, "class=\"contrib-l4\"");
        });

        test("a year of days makes 53 weeks of columns", () -> {
            // 2025-11-09 is a Sunday; 365 days from there fill 53 columns.
            String svg = Contributions.graph(calendar(5, LocalDate.of(2025, 11, 9), 365));
            int width = Contributions.LEFT + 53 * Contributions.STEP - Contributions.GAP;
            contains(svg, "viewBox=\"0 0 " + width + " ");
        });

        test("labels the months and the Mon, Wed and Fri rows", () -> {
            String svg = Contributions.graph(calendar(5, LocalDate.of(2026, 1, 4), 70));
            contains(svg, ">Feb</text>");
            contains(svg, ">Mar</text>");
            contains(svg, ">Mon</text>");
            contains(svg, ">Wed</text>");
            contains(svg, ">Fri</text>");
        });

        test("writes the total with commas, and says contribution for one", () -> {
            contains(Contributions.graph(calendar(1234, LocalDate.of(2026, 1, 4), 7)), "1,234 contributions in the last year");
            contains(Contributions.graph(calendar(1, LocalDate.of(2026, 1, 4), 7)), "1 contribution in the last year");
        });

        test("tooltips are escaped", () -> {
            List<Contributions.Day> days = List.of(new Contributions.Day(LocalDate.of(2026, 1, 4), 1, "<b>bold</b>"));
            String svg = Contributions.graph(new Contributions.Calendar(1, days));
            lacks(svg, "<b>");
            contains(svg, "<title>&lt;b&gt;bold&lt;/b&gt;</title>");
        });

        test("the graph is wrapped so it can scroll sideways on phones", () -> {
            String page = Contributions.START + "old" + Contributions.END;
            String result = Contributions.insertGraph(page, calendar(5, LocalDate.of(2026, 1, 4), 7));
            lacks(result, "old");
            contains(result, "class=\"contrib-scroll\" tabindex=\"0\"");
        });

        test("index.html still has both sets of markers, so refreshes have somewhere to go", () -> {
            String page = Files.readString(Path.of("index.html"));
            isTrue(Contributions.hasMarkers(page), "contribution graph markers");
            isTrue(Projects.hasMarkers(page), "project card markers");
        });
    }
}
