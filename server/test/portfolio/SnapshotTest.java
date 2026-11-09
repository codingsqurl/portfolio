package portfolio;

import static portfolio.Check.contains;
import static portfolio.Check.lacks;
import static portfolio.Check.section;
import static portfolio.Check.test;

import java.nio.file.Files;
import java.nio.file.Path;

/** The GitHub Pages copy: the security policy, link previews and 404 links. */
final class SnapshotTest {
    private SnapshotTest() {}

    static final String BASE = "https://codingsqurl.github.io/portfolio/";

    static void run() {
        section("Snapshot");

        test("the home page carries the no-scripts policy in a meta tag", () -> {
            String page = Snapshot.forPages(Files.readString(Path.of("index.html")), BASE);
            contains(page, "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self';");
            contains(page, "script-src 'none'");
        });

        test("the meta tag leaves out frame-ancestors, which browsers ignore there", () -> {
            lacks(Snapshot.cspMeta(Server.CSP), "frame-ancestors");
        });

        test("link previews point at the Pages address, not fly.dev", () -> {
            String page = Snapshot.forPages(Files.readString(Path.of("index.html")), BASE);
            contains(page, "property=\"og:url\" content=\"" + BASE + "\"");
            contains(page, "property=\"og:image\" content=\"" + BASE + "og-image.png\"");
            lacks(page, "codingsqurl.fly.dev");
        });

        test("the 404 page's links include /portfolio/", () -> {
            String page = Snapshot.notFoundForPages(Files.readString(Path.of("404.html")), BASE);
            contains(page, "href=\"/portfolio/favicon.svg\"");
            contains(page, "href=\"/portfolio/\"");
            lacks(page, "href=\"/\"");
            contains(page, "style-src 'self' 'unsafe-inline'");
        });
    }
}
