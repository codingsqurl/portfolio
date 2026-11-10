package portfolio;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Builds a static copy of the site for GitHub Pages, with fresh data from GitHub.
 *
 * GitHub Pages can only host files, not run this server, so this does once what
 * the server does on every refresh: fills in the project cards and contribution
 * graph. Then it adjusts the pages for their new home:
 *
 * - Pages can't send headers, so the no-scripts security policy goes in a
 *   meta tag instead. (frame-ancestors only works as a header, so it's left out.)
 * - Link previews point at the Pages address instead of fly.dev.
 * - The 404 page's links get the /portfolio/ prefix the Pages address has.
 *
 * Unlike the server, it stops with an error if GitHub can't be reached, so it
 * never publishes stale data by accident. Run it with:
 *
 *     ./run.sh pages
 */
public final class Snapshot {
    private Snapshot() {}

    static final String[] FILES = {"style.css", "favicon.svg", "og-image.png", "robots.txt"};

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("usage: Snapshot <output folder> <site address, e.g. https://codingsqurl.github.io/portfolio/>");
            System.exit(2);
        }
        Path out = Path.of(args[0]);
        String base = args[1].endsWith("/") ? args[1] : args[1] + "/";
        Files.createDirectories(out);

        var repos = Projects.fetchRepos();
        var calendar = Contributions.fetchCalendar();

        String page = Files.readString(Server.SITE.resolve("index.html"), StandardCharsets.UTF_8);
        page = page.replace("href=\"style.css\"", "href=\"style.css?v=" + Server.STYLE_VERSION + "\"");
        page = Projects.insertCards(page, repos);
        page = Contributions.insertGraph(page, calendar);
        Files.writeString(out.resolve("index.html"), forPages(page, base), StandardCharsets.UTF_8);

        String notFound = Files.readString(Server.SITE.resolve("404.html"), StandardCharsets.UTF_8);
        Files.writeString(out.resolve("404.html"), notFoundForPages(notFound, base), StandardCharsets.UTF_8);

        for (String name : FILES) {
            Files.copy(Server.SITE.resolve(name), out.resolve(name), StandardCopyOption.REPLACE_EXISTING);
        }
        // Tells GitHub Pages to serve the files as they are, without running Jekyll on them.
        Files.writeString(out.resolve(".nojekyll"), "");

        System.out.println("built " + out + ": " + repos.size() + " project cards, "
                + calendar.count() + " contributions in " + calendar.period());
    }

    /** The security policy as a meta tag. frame-ancestors is dropped: browsers ignore it there. */
    static String cspMeta(String policy) {
        String withoutFrames = policy.replace("; frame-ancestors 'none'", "");
        return "<meta http-equiv=\"Content-Security-Policy\" content=\"" + withoutFrames + "\">";
    }

    /** The home page, adjusted for GitHub Pages. */
    static String forPages(String page, String base) {
        return page
                .replace("<meta charset=\"UTF-8\">", "<meta charset=\"UTF-8\">\n    " + cspMeta(Server.CSP))
                .replace("content=\"https://codingsqurl.fly.dev/\"", "content=\"" + base + "\"")
                .replace("content=\"https://codingsqurl.fly.dev/og-image.png\"", "content=\"" + base + "og-image.png\"");
    }

    /** The 404 page, adjusted for GitHub Pages: its links need the site's folder, like /portfolio/. */
    static String notFoundForPages(String page, String base) {
        String folder = URI.create(base).getPath();
        return page
                .replace("<meta charset=\"UTF-8\">", "<meta charset=\"UTF-8\">\n    " + cspMeta(Server.CSP_404))
                .replace("href=\"/favicon.svg\"", "href=\"" + folder + "favicon.svg\"")
                .replace("href=\"/\"", "href=\"" + folder + "\"");
    }
}
