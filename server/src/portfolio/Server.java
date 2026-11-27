package portfolio;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.zip.GZIPOutputStream;

/**
 * The portfolio's web server.
 *
 * It serves the site's files, fills in the GitHub project cards and contribution
 * graph, and adds the security and caching rules to every response. It's built
 * only from what comes with Java, with no framework or libraries.
 *
 * Run it locally from the repo folder with:
 *
 *     ./run.sh
 *
 * then open http://127.0.0.1:8000
 */
public final class Server {
    private Server() {}

    // The folder holding index.html, style.css and the rest. It's the folder the
    // server is started from, unless SITE_DIR says otherwise.
    static final Path SITE = Path.of(envOr("SITE_DIR", System.getProperty("user.dir")));

    // Only these files are ever served. Everything else in the repo (README, notes,
    // the server's own code) stays private, even if someone guesses its name.
    // The number is how many seconds a browser may keep its copy.
    static final Map<String, Integer> PUBLIC_FILES = Map.of(
            "consent.js", 60 * 60,          // 1 hour, so fixes reach visitors quickly
            "motion.js", 60 * 60,           // 1 hour
            "gsap.min.js", 60 * 60 * 24,    // 1 day (the GSAP animation library)
            "ScrollTrigger.min.js", 60 * 60 * 24,
            "favicon.svg", 60 * 60 * 24,    // 1 day
            "og-image.png", 60 * 60 * 24,   // 1 day
            "robots.txt", 60 * 60 * 24,     // 1 day
            "sitemap.xml", 60 * 60 * 24);   // 1 day

    static final Map<String, String> CONTENT_TYPES = Map.of(
            "svg", "image/svg+xml",
            "png", "image/png",
            "txt", "text/plain; charset=utf-8",
            "xml", "application/xml; charset=utf-8",
            "css", "text/css; charset=utf-8",
            "js", "text/javascript; charset=utf-8",
            "html", "text/html; charset=utf-8");

    // How often to ask GitHub for the latest repos and contribution graph, and how soon to
    // try again if it fails. Every 10 minutes keeps the graph close to GitHub's own, and is
    // 6 requests an hour, well inside GitHub's limit of 60 without a token.
    static final long REFRESH = 60 * 10;        // 10 minutes
    static final long RETRY = 60 * 2;           // 2 minutes

    // The browser's safety rules: only load files from this site, run only this site's own
    // script (consent.js) plus Google Analytics, and never let another site show this one
    // inside a frame. Google's script only loads after a visitor accepts the cookie banner;
    // the Google domains below are the ones GA4 needs to load and send page views.
    static final String GA_SCRIPT = "https://www.googletagmanager.com";
    static final String GA_HOSTS = "https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com";
    static final String CSP = "default-src 'self'; img-src 'self' data: " + GA_HOSTS + "; style-src 'self'; "
            + "script-src 'self' " + GA_SCRIPT + "; connect-src 'self' " + GA_HOSTS + "; "
            + "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    // The 404 page keeps its styles inside itself, so it also needs inline styles allowed.
    static final String CSP_404 = CSP.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");

    static final Map<String, String> SECURITY_HEADERS = orderedMap(
            "Content-Security-Policy", CSP,
            "X-Content-Type-Options", "nosniff",
            "Referrer-Policy", "strict-origin-when-cross-origin",
            "Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
            "Cross-Origin-Opener-Policy", "same-origin",
            // Stop other sites embedding this site's files (images, CSS) from their pages.
            "Cross-Origin-Resource-Policy", "same-origin",
            // includeSubDomains covers any sub.codingsqurl.fly.dev too. Add "; preload" only once
            // a custom apex domain (codingsqurl.com) is live and you submit it to hstspreload.org.
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains");

    // Text responses at least this big are squashed before sending, so pages download faster.
    static final int GZIP_MIN_SIZE = 500;

    // ---------- The stylesheet ----------
    // Its address includes a fingerprint of its contents (style.css?v=1a2b3c4d), so
    // browsers can keep it for a year. When the file changes, so does the address.
    static final Path STYLE_CSS = SITE.resolve("style.css");
    // The fingerprint is worked out from the file as it is now, not once at startup, so
    // editing style.css while the server runs can't pair a new page with a stale stylesheet.
    static String styleVersion() {
        return sha256(read(STYLE_CSS)).substring(0, 8);
    }

    // With -Dportfolio.offline=true the server never calls GitHub and shows the cards and
    // graph saved in index.html. The tests use it so they don't depend on the internet.
    static final boolean OFFLINE = Boolean.getBoolean("portfolio.offline");
    // With -Dportfolio.quiet=true the server doesn't log each request, so test output stays readable.
    static final boolean QUIET = Boolean.getBoolean("portfolio.quiet");
    // DEV=1 (./run.sh dev) is for working on the site: the home page is rebuilt from
    // index.html on every request (with the saved cards and graph, so no GitHub calls), and
    // browsers are told to check for a newer copy of every file, so a refresh shows your
    // latest save. The security headers stay the same, so you test what goes live.
    static final boolean DEV = "1".equals(System.getenv("DEV"));

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(envOr("PORT", "8080"));
        String host = envOr("HOST", "0.0.0.0");

        HttpServer server = start(host, port);
        // When the host stops the server, let requests in progress finish (up to a second).
        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(1)));
        System.out.println("serving " + SITE + " on http://" + host + ":" + port
                + (DEV ? " (dev mode: edits show on refresh)" : ""));
    }

    /**
     * Closes a slow-request (slowloris) attack. Java's built-in HttpServer otherwise lets a
     * connection send its request, or read its reply, forever — so a bot can open many
     * connections and dribble a byte at a time to tie the server up. These caps give each
     * request 20 seconds to arrive and each reply 30 to be read, and limit how many and how
     * large the headers can be. They're system properties the server reads as it starts, so
     * this must run before the first HttpServer call. Set here rather than on the command line
     * so there's one place to keep them and the tests can check them.
     */
    static void harden() {
        setIfUnset("sun.net.httpserver.maxReqTime", "20");        // seconds to send the request
        setIfUnset("sun.net.httpserver.maxRspTime", "30");        // seconds to read the reply
        setIfUnset("sun.net.httpserver.maxReqHeaders", "50");     // a browser sends ~15
        setIfUnset("sun.net.httpserver.maxReqHeaderSize", "16384"); // 16 KB of headers is plenty
    }

    private static void setIfUnset(String name, String value) {
        if (System.getProperty(name) == null) {
            System.setProperty(name, value);
        }
    }

    /** Starts the server. Port 0 picks any free port, which the tests use. */
    static HttpServer start(String host, int port) throws IOException {
        harden();
        HttpServer server = HttpServer.create(new InetSocketAddress(host, port), 0);
        server.createContext("/", Server::handle);
        // A lightweight thread for each request, so one slow visitor can't hold up the rest.
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        return server;
    }

    static void handle(HttpExchange exchange) {
        int status = 500;
        try {
            Firewall.Refusal refusal = Firewall.check(exchange);
            if (refusal != null) {
                status = refusal.status();
                send(exchange, status, plain(refusal.message()), CONTENT_TYPES.get("txt"),
                        withNoStore(refusal.headers()));
            } else {
                status = route(exchange);
            }
        } catch (Exception error) {
            System.err.println("error handling " + exchange.getRequestURI() + ": " + error);
            try {
                send(exchange, 500, plain("Internal Server Error"), CONTENT_TYPES.get("txt"), Map.of());
            } catch (IOException ignored) {
                // The visitor has already gone.
            }
        } finally {
            exchange.close();
            if (!QUIET) {
                System.out.println(Firewall.clientIp(exchange) + " \"" + exchange.getRequestMethod() + " "
                        + exchange.getRequestURI().getRawPath() + "\" " + status);
            }
        }
    }

    /** Sends the right page for the address, and returns the status code it sent. */
    static int route(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        String method = exchange.getRequestMethod();

        if (path.equals("/healthz")) {
            // Fly.io calls this to check the server is up. It skips the firewall, so check the method here.
            if (!method.equals("GET") && !method.equals("HEAD")) {
                send(exchange, 405, plain("Method Not Allowed"), CONTENT_TYPES.get("txt"), Map.of("Allow", "GET, HEAD"));
                return 405;
            }
            send(exchange, 200, plain("ok"), CONTENT_TYPES.get("txt"), Map.of("Cache-Control", "no-store"));
            return 200;
        }
        if (path.equals("/")) {
            return home(exchange);
        }
        if (path.equals("/terminal")) {
            return terminal(exchange);
        }
        if (path.equals("/style.css")) {
            String cache = DEV ? "no-cache"
                    : styleVersion().equals(queryValue(exchange, "v"))
                    ? "public, max-age=31536000, immutable"
                    : "public, max-age=600";
            send(exchange, 200, read(STYLE_CSS), CONTENT_TYPES.get("css"), Map.of("Cache-Control", cache));
            return 200;
        }

        String name = path.substring(1);
        if (PUBLIC_FILES.containsKey(name)) {
            send(exchange, 200, read(SITE.resolve(name)), contentType(name),
                    Map.of("Cache-Control", DEV ? "no-cache" : "public, max-age=" + PUBLIC_FILES.get(name)));
            return 200;
        }

        send(exchange, 404, read(SITE.resolve("404.html")), CONTENT_TYPES.get("html"),
                Map.of("Content-Security-Policy", CSP_404, "Cache-Control", "no-cache"));
        return 404;
    }

    // ---------- The home page ----------

    /**
     * Keeps a ready-made copy of index.html, with fresh project cards, the
     * contribution graph and the stylesheet fingerprint filled in, and rebuilds
     * it when they get stale.
     */
    static final class HomePage {
        private String html = "";
        private String etag = "";
        private long nextRefresh = 0;

        synchronized String[] get() {
            if (DEV || System.nanoTime() >= nextRefresh) {
                rebuild();
            }
            return new String[] {html, etag};
        }

        private void rebuild() {
            String page = new String(read(SITE.resolve("index.html")), StandardCharsets.UTF_8);
            page = withStyleVersion(page);

            if (OFFLINE || DEV) {
                html = page;
                etag = "\"" + sha256(page.getBytes(StandardCharsets.UTF_8)).substring(0, 16) + "\"";
                nextRefresh = System.nanoTime() + REFRESH * 1_000_000_000L;
                return;
            }

            try {
                page = Projects.insertCards(page, Projects.fetchRepos());
                nextRefresh = System.nanoTime() + REFRESH * 1_000_000_000L;
            } catch (Exception error) {
                // Keep the cards saved in index.html and try GitHub again soon.
                System.err.println("couldn't reach GitHub (" + error + "), using the saved project cards");
                nextRefresh = System.nanoTime() + RETRY * 1_000_000_000L;
            }

            try {
                page = Contributions.insertGraph(page, Contributions.fetchCalendar());
            } catch (Exception error) {
                // Keep the graph saved in index.html and try again soon.
                System.err.println("couldn't load the contribution graph (" + error + "), using the saved one");
                nextRefresh = System.nanoTime() + RETRY * 1_000_000_000L;
            }

            html = page;
            etag = "\"" + sha256(page.getBytes(StandardCharsets.UTF_8)).substring(0, 16) + "\"";
        }
    }

    static final HomePage HOME_PAGE = new HomePage();

    static int home(HttpExchange exchange) throws IOException {
        String[] pageAndEtag = HOME_PAGE.get();
        String etag = pageAndEtag[1];
        // "no-cache" means the browser keeps a copy but checks with us before using it.
        // If nothing changed, we answer "304 Not Modified" and it reuses its copy.
        Map<String, String> headers = Map.of("Cache-Control", "no-cache", "ETag", etag);
        if (etag.equals(exchange.getRequestHeaders().getFirst("If-None-Match"))) {
            send(exchange, 304, null, null, headers);
            return 304;
        }
        send(exchange, 200, pageAndEtag[0].getBytes(StandardCharsets.UTF_8), CONTENT_TYPES.get("html"), headers);
        return 200;
    }

    // ---------- The terminal page ----------

    /**
     * Sends terminal.html, with the stylesheet fingerprint filled in like the home page.
     * It has no GitHub data in it, so there's nothing to keep fresh: it's read as it is.
     */
    static int terminal(HttpExchange exchange) throws IOException {
        byte[] page = withStyleVersion(new String(read(SITE.resolve("terminal.html")), StandardCharsets.UTF_8))
                .getBytes(StandardCharsets.UTF_8);
        String etag = "\"" + sha256(page).substring(0, 16) + "\"";
        Map<String, String> headers = Map.of("Cache-Control", "no-cache", "ETag", etag);
        if (etag.equals(exchange.getRequestHeaders().getFirst("If-None-Match"))) {
            send(exchange, 304, null, null, headers);
            return 304;
        }
        send(exchange, 200, page, CONTENT_TYPES.get("html"), headers);
        return 200;
    }

    /**
     * Points a page's stylesheet link at the fingerprinted address (style.css?v=...), and
     * its own scripts too (motion.js?v=...). Browsers keep scripts for an hour, so without
     * the fingerprint a fresh page could run with yesterday's motion.js.
     */
    static String withStyleVersion(String page) {
        page = page.replace("href=\"style.css\"", "href=\"style.css?v=" + styleVersion() + "\"");
        for (String script : new String[] {"motion.js", "consent.js"}) {
            String version = sha256(read(SITE.resolve(script))).substring(0, 8);
            page = page.replace("src=\"" + script + "\"", "src=\"" + script + "?v=" + version + "\"");
        }
        return page;
    }

    // ---------- Sending responses ----------

    /** Sends a response with the security headers, squashing text when the browser allows it. */
    static void send(HttpExchange exchange, int status, byte[] body, String contentType, Map<String, String> extra)
            throws IOException {
        Headers headers = exchange.getResponseHeaders();
        extra.forEach(headers::set);
        // The page's own headers win; the security headers fill in the rest.
        SECURITY_HEADERS.forEach((name, value) -> {
            if (!headers.containsKey(name)) {
                headers.set(name, value);
            }
        });
        if (contentType != null) {
            headers.set("Content-Type", contentType);
        }

        if (body == null) {
            exchange.sendResponseHeaders(status, -1);
            return;
        }

        boolean text = contentType != null && (contentType.startsWith("text/") || contentType.startsWith("image/svg"));
        if (text) {
            headers.set("Vary", "Accept-Encoding");
            String accepts = exchange.getRequestHeaders().getFirst("Accept-Encoding");
            if (body.length >= GZIP_MIN_SIZE && accepts != null && accepts.contains("gzip")) {
                body = gzip(body);
                headers.set("Content-Encoding", "gzip");
            }
        }

        if (exchange.getRequestMethod().equals("HEAD")) {
            // A HEAD request gets the headers it would have got, but no body.
            headers.set("Content-Length", String.valueOf(body.length));
            exchange.sendResponseHeaders(status, -1);
            return;
        }
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }

    // ---------- Small helpers ----------

    static byte[] plain(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    static Map<String, String> withNoStore(Map<String, String> headers) {
        Map<String, String> all = new LinkedHashMap<>(headers);
        all.put("Cache-Control", "no-store");
        return all;
    }

    static String contentType(String name) {
        return CONTENT_TYPES.getOrDefault(name.substring(name.lastIndexOf('.') + 1), "application/octet-stream");
    }

    static String queryValue(HttpExchange exchange, String key) {
        String query = exchange.getRequestURI().getQuery();
        if (query == null) {
            return "";
        }
        for (String pair : query.split("&")) {
            int equals = pair.indexOf('=');
            if (equals > 0 && pair.substring(0, equals).equals(key)) {
                return pair.substring(equals + 1);
            }
        }
        return "";
    }

    static byte[] read(Path path) {
        try {
            return Files.readAllBytes(path);
        } catch (IOException error) {
            throw new IllegalStateException("couldn't read " + path, error);
        }
    }

    static byte[] gzip(byte[] body) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(body.length / 3);
        try (GZIPOutputStream zip = new GZIPOutputStream(out)) {
            zip.write(body);
        }
        return out.toByteArray();
    }

    static String sha256(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    static String envOr(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isEmpty() ? fallback : value;
    }

    /** A map that keeps the order its entries were given in. */
    static Map<String, String> orderedMap(String... namesAndValues) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i < namesAndValues.length; i += 2) {
            map.put(namesAndValues[i], namesAndValues[i + 1]);
        }
        return map;
    }
}
