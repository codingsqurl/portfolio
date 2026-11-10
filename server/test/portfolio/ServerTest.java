package portfolio;

import static portfolio.Check.contains;
import static portfolio.Check.equal;
import static portfolio.Check.isTrue;
import static portfolio.Check.section;
import static portfolio.Check.test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.zip.GZIPInputStream;

/** The server: which addresses give which pages, and the headers that come with them. */
final class ServerTest {
    private ServerTest() {}

    static void run() {
        section("Server");

        test("the home page loads, with the stylesheet's fingerprint filled in", () -> {
            Client.Reply home = Client.get("/");
            equal(200, home.status());
            equal("text/html; charset=utf-8", home.header("Content-Type"));
            contains(home.text(), "Hi, I'm coding_squrl.");
            isTrue(home.text().matches("(?s).*href=\"style\\.css\\?v=[0-9a-f]{8}\".*"), "style.css?v=<8 hex>");
        });

        test("the Discord button opens the app on computers, with a web link for phones and as a fallback", () -> {
            String page = Client.get("/").text();
            contains(page, "href=\"discord://-/users/557407919063433217\"");
            contains(page, "class=\"button button-discord discord-web\" href=\"https://discord.com/users/557407919063433217\"");
            contains(page, "No Discord app? <a href=\"https://discord.com/users/557407919063433217\">");
        });

        test("every page carries the security headers", () -> {
            for (String path : new String[] {"/", "/style.css", "/favicon.svg", "/nope"}) {
                Client.Reply reply = Client.get(path);
                for (Map.Entry<String, String> header : Server.SECURITY_HEADERS.entrySet()) {
                    if (path.equals("/nope") && header.getKey().equals("Content-Security-Policy")) {
                        continue; // checked separately: the 404 page has its own
                    }
                    equal(header.getValue(), reply.header(header.getKey()));
                }
            }
        });

        test("responses don't say what server software runs the site", () -> {
            equal(null, Client.get("/").header("Server"));
        });

        test("the home page is checked for changes on every visit", () -> {
            equal("no-cache", Client.get("/").header("Cache-Control"));
        });

        test("a repeat visit with an unchanged page gets 304 and no body", () -> {
            String etag = Client.get("/").header("ETag");
            Client.Reply again = Client.get("/", "If-None-Match: " + etag);
            equal(304, again.status());
            equal(0, again.body().length);
        });

        test("a different ETag gets the full page", () -> {
            equal(200, Client.get("/", "If-None-Match: \"stale\"").status());
        });

        test("HEAD gets the headers and length but no body", () -> {
            Client.Reply head = Client.send("HEAD", "/", Client.freshIp());
            equal(200, head.status());
            isTrue(Integer.parseInt(head.header("Content-Length")) > 1000, "a real length");
            equal(0, head.body().length);
        });

        test("text is squashed with gzip when the browser accepts it", () -> {
            Client.Reply plain = Client.get("/");
            Client.Reply zipped = Client.get("/", "Accept-Encoding: gzip, br");
            equal("gzip", zipped.header("Content-Encoding"));
            isTrue(zipped.body().length < plain.body().length / 2, "much smaller");
            byte[] unzipped = new GZIPInputStream(new ByteArrayInputStream(zipped.body())).readAllBytes();
            equal(plain.text(), new String(unzipped, StandardCharsets.UTF_8));
        });

        test("images aren't gzipped, since they're already compressed", () -> {
            equal(null, Client.get("/og-image.png", "Accept-Encoding: gzip").header("Content-Encoding"));
        });

        test("the fingerprinted stylesheet is kept for a year, a plain one for 10 minutes", () -> {
            equal("public, max-age=31536000, immutable",
                    Client.get("/style.css?v=" + Server.STYLE_VERSION).header("Cache-Control"));
            equal("public, max-age=600", Client.get("/style.css").header("Cache-Control"));
            equal("public, max-age=600", Client.get("/style.css?v=old").header("Cache-Control"));
            equal("text/css; charset=utf-8", Client.get("/style.css").header("Content-Type"));
        });

        test("the public files load with the right types", () -> {
            equal("image/svg+xml", Client.get("/favicon.svg").header("Content-Type"));
            equal("image/png", Client.get("/og-image.png").header("Content-Type"));
            equal("text/plain; charset=utf-8", Client.get("/robots.txt").header("Content-Type"));
            equal("public, max-age=86400", Client.get("/robots.txt").header("Cache-Control"));
        });

        test("nothing else in the repo can be reached, even by name", () -> {
            for (String path : new String[] {"/README.md", "/index.html", "/404.html", "/Dockerfile",
                    "/fly.toml", "/run.sh", "/CHECKLIST.md", "/server/src/portfolio/Server.java", "/a/b/c"}) {
                equal(404, Client.get(path).status());
            }
        });

        test("missing pages get the 404 page, with inline styles allowed for it alone", () -> {
            Client.Reply missing = Client.get("/nope");
            equal(404, missing.status());
            contains(missing.text(), "<title>Page not found");
            equal(Server.CSP_404, missing.header("Content-Security-Policy"));
            contains(Server.CSP_404, "style-src 'self' 'unsafe-inline'");
        });

        test("the health check answers ok, whatever site name Fly asks for", () -> {
            Client.Reply health = Client.send("GET", "/healthz", null, "Host: 10.0.0.5:8080");
            equal(200, health.status());
            equal("ok", health.text());
            equal("no-store", health.header("Cache-Control"));
        });

        test("the health check still only allows reading", () -> {
            Client.Reply post = Client.send("POST", "/healthz", null, "Content-Length: 0");
            equal(405, post.status());
            equal("GET, HEAD", post.header("Allow"));
        });
    }
}
