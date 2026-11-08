package portfolio;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Builds the Work section's project cards from GitHub.
 *
 * Every public repo on the account that isn't a fork or archived gets a card,
 * newest first. The cards go between these two comments in index.html,
 * replacing whatever was there before:
 *
 *     <!-- GITHUB-PROJECTS -->
 *     <!-- /GITHUB-PROJECTS -->
 *
 * The web server (Server.java) does this while it runs, so the live site is
 * always current. Whatever cards are saved in index.html are the backup it
 * shows if GitHub can't be reached. Refresh.java updates that backup.
 */
final class Projects {
    private Projects() {}

    static final String USER = "codingsqurl";
    // Repos that never get a card, even when public.
    static final Set<String> SKIP = Set.of("portfolio");

    static final String START = "<!-- GITHUB-PROJECTS -->";
    static final String END = "<!-- /GITHUB-PROJECTS -->";
    static final Pattern PATTERN = Pattern.compile(Pattern.quote(START) + ".*?" + Pattern.quote(END), Pattern.DOTALL);

    static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> fetchRepos() throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(
                        URI.create("https://api.github.com/users/" + USER + "/repos?type=owner&per_page=100"))
                .timeout(Duration.ofSeconds(10))
                .header("Accept", "application/vnd.github+json")
                .header("User-Agent", USER + "-portfolio");
        // A token is optional, but without one GitHub allows only 60 requests an hour.
        String token = System.getenv("GITHUB_TOKEN");
        if (token != null && !token.isEmpty()) {
            request.header("Authorization", "Bearer " + token);
        }
        HttpResponse<String> response = HTTP.send(request.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("GitHub answered " + response.statusCode());
        }
        return parseRepos(response.body());
    }

    /** Picks the repos that get a card out of GitHub's JSON, newest first. Separate from
     *  fetchRepos so the tests can feed it sample JSON without calling GitHub. */
    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> parseRepos(String json) {
        List<Map<String, Object>> repos = new ArrayList<>();
        for (Object item : (List<Object>) Json.parse(json)) {
            Map<String, Object> repo = (Map<String, Object>) item;
            if (!isTrue(repo.get("private")) && !isTrue(repo.get("fork")) && !isTrue(repo.get("archived"))
                    && !SKIP.contains(repo.get("name"))) {
                repos.add(repo);
            }
        }
        repos.sort((a, b) -> text(b, "pushed_at").compareTo(text(a, "pushed_at")));
        return repos;
    }

    static String card(Map<String, Object> repo) {
        // Everything from GitHub is escaped, so a description can't inject HTML into the page.
        String rawLanguage = text(repo, "language");
        String name = Html.escape(text(repo, "name"));
        String language = Html.escape(rawLanguage.isEmpty() ? "Code" : rawLanguage);
        String updated = LocalDate.parse(text(repo, "pushed_at").substring(0, 10))
                .format(DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH));
        String rawDescription = text(repo, "description");
        String description = Html.escape(rawDescription.isEmpty()
                ? "A " + (rawLanguage.isEmpty() ? "code" : rawLanguage) + " project."
                : rawDescription);

        String links = "<a href=\"" + Html.escape(text(repo, "html_url")) + "\">View code →</a>";
        String homepage = text(repo, "homepage");
        if (!homepage.isEmpty()) {
            links = "<a href=\"" + Html.escape(homepage) + "\">Visit site →</a> " + links;
        }

        return "            <article class=\"card reveal\">\n"
                + "              <p class=\"card-label\">" + language + " · Updated " + updated + "</p>\n"
                + "              <h3>" + name + "</h3>\n"
                + "              <p>" + description + "</p>\n"
                + "              <p class=\"card-links\">" + links + "</p>\n"
                + "            </article>\n";
    }

    static boolean hasMarkers(String page) {
        return PATTERN.matcher(page).find();
    }

    /** Returns the page with the cards between the markers swapped for fresh ones. */
    static String insertCards(String page, List<Map<String, Object>> repos) {
        StringBuilder cards = new StringBuilder("\n");
        for (Map<String, Object> repo : repos) {
            cards.append(card(repo));
        }
        // Line up the closing marker with the opening one.
        cards.append("            ");
        return PATTERN.matcher(page).replaceAll(Matcher.quoteReplacement(START + cards + END));
    }

    private static boolean isTrue(Object value) {
        return Boolean.TRUE.equals(value);
    }

    /** A field as text, with a missing or null field as "". */
    private static String text(Map<String, Object> repo, String field) {
        Object value = repo.get(field);
        return value == null ? "" : value.toString();
    }
}
