package portfolio;

import static portfolio.Check.contains;
import static portfolio.Check.equal;
import static portfolio.Check.isTrue;
import static portfolio.Check.lacks;
import static portfolio.Check.section;
import static portfolio.Check.test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** The project cards built from GitHub's list of repos. */
final class ProjectsTest {
    private ProjectsTest() {}

    // A cut-down copy of what GitHub sends, with one repo of each kind that should be skipped.
    static final String REPOS = """
            [
              {"name": "older", "private": false, "fork": false, "archived": false,
               "pushed_at": "2026-03-01T10:00:00Z", "language": "Go", "description": "Old one",
               "html_url": "https://github.com/codingsqurl/older", "homepage": ""},
              {"name": "newer", "private": false, "fork": false, "archived": false,
               "pushed_at": "2026-07-04T10:00:00Z", "language": "Rust", "description": "New one",
               "html_url": "https://github.com/codingsqurl/newer", "homepage": "https://newer.example"},
              {"name": "secret", "private": true, "fork": false, "archived": false,
               "pushed_at": "2026-08-01T10:00:00Z"},
              {"name": "someone-elses", "private": false, "fork": true, "archived": false,
               "pushed_at": "2026-08-01T10:00:00Z"},
              {"name": "retired", "private": false, "fork": false, "archived": true,
               "pushed_at": "2026-08-01T10:00:00Z"},
              {"name": "portfolio", "private": false, "fork": false, "archived": false,
               "pushed_at": "2026-11-01T10:00:00Z"}
            ]
            """;

    static Map<String, Object> repo(String description, String language, String homepage) {
        Map<String, Object> repo = new HashMap<>();
        repo.put("name", "demo");
        repo.put("pushed_at", "2026-07-04T10:00:00Z");
        repo.put("html_url", "https://github.com/codingsqurl/demo");
        repo.put("description", description);
        repo.put("language", language);
        repo.put("homepage", homepage);
        return repo;
    }

    static void run() {
        section("Projects");

        test("only public repos of mine get cards: no private, forks, archived or the portfolio", () -> {
            List<String> names = Projects.parseRepos(REPOS).stream().map(r -> (String) r.get("name")).toList();
            equal(List.of("newer", "older"), names);
        });

        test("cards are sorted newest first", () -> {
            equal("newer", Projects.parseRepos(REPOS).get(0).get("name"));
        });

        test("a card shows the language, month, name, description and code link", () -> {
            String card = Projects.card(repo("Does things.", "Rust", null));
            contains(card, "Rust · Updated Jul 2026");
            contains(card, "<h3>demo</h3>");
            contains(card, "<p>Does things.</p>");
            contains(card, "<a href=\"https://github.com/codingsqurl/demo\">View code →</a>");
        });

        test("a repo with a homepage also gets a Visit site link, first", () -> {
            String card = Projects.card(repo("x", "Go", "https://demo.example"));
            isTrue(card.indexOf("Visit site") < card.indexOf("View code"), "Visit site comes first");
            contains(card, "href=\"https://demo.example\"");
        });

        test("no homepage means no Visit site link", () -> {
            lacks(Projects.card(repo("x", "Go", "")), "Visit site");
            lacks(Projects.card(repo("x", "Go", null)), "Visit site");
        });

        test("a missing description gets a sensible default", () -> {
            contains(Projects.card(repo(null, "Rust", null)), "<p>A Rust project.</p>");
            contains(Projects.card(repo("", null, null)), "<p>A code project.</p>");
        });

        test("a missing language shows as Code", () -> {
            contains(Projects.card(repo("x", null, null)), "Code · Updated");
        });

        test("HTML in a description is escaped, so it can't run on the page", () -> {
            String card = Projects.card(repo("<img src=x onerror=alert(1)>", "Go", null));
            lacks(card, "<img");
            contains(card, "&lt;img src=x onerror=alert(1)&gt;");
        });

        test("a homepage can't break out of its link", () -> {
            String card = Projects.card(repo("x", "Go", "https://a.example\" onclick=\"steal()"));
            lacks(card, "\" onclick=\"");
        });

        test("cards replace only what's between the markers", () -> {
            String page = "<main>before " + Projects.START + "OLD CARDS" + Projects.END + " after</main>";
            String result = Projects.insertCards(page, Projects.parseRepos(REPOS));
            lacks(result, "OLD CARDS");
            contains(result, "<h3>newer</h3>");
            isTrue(result.startsWith("<main>before " + Projects.START), "text before is kept");
            isTrue(result.endsWith(Projects.END + " after</main>"), "text after is kept");
        });

        test("refreshing twice gives the same page", () -> {
            String page = Projects.START + Projects.END;
            String once = Projects.insertCards(page, Projects.parseRepos(REPOS));
            equal(once, Projects.insertCards(once, Projects.parseRepos(REPOS)));
        });

        test("a page without markers is left alone", () -> {
            isTrue(!Projects.hasMarkers("<p>no markers</p>"), "no markers found");
            equal("<p>no markers</p>", Projects.insertCards("<p>no markers</p>", Projects.parseRepos(REPOS)));
        });
    }
}
