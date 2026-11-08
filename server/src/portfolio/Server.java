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
            "favicon.svg", 60 * 60 * 24,    // 1 day
            "og-image.png", 60 * 60 * 24,   // 1 day
            "robots.txt", 60 * 60 * 24);    // 1 day

    static final Map<String, String> CONTENT_TYPES = Map.of(
            "svg", "image/svg+xml",
            "png", "image/png",
            "txt", "text/plain; charset=utf-8",
            "css", "text/css; charset=utf-8",
            "html", "text/html; charset=utf-8");

    // How often to ask GitHub for the latest repos, and how soon to try again if it fails.
    static final long PROJECTS_REFRESH = 60 * 60; // 1 hour
    static final long PROJECTS_RETRY = 60 * 5;    // 5 minutes

    // The browser's safety rules: only load files from this site, never run scripts,
    // and never let another site show this one inside a frame.
    static final String CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'none'; "
            + "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    // The 404 page keeps its styles inside itself, so it also needs inline styles allowed.
    static final String CSP_404 = CSP.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");

    static final Map<String, String> SECURITY_HEADERS = orderedMap(
            "Content-Security-Policy", CSP,
            "X-Content-Type-Options", "nosniff",
            "Referrer-Policy", "strict-origin-when-cross-origin",
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()",
            "Cross-Origin-Opener-Policy", "same-origin",
            "Strict-Transport-Security", "max-age=31536000");

    // Text responses at least this big are squashed before sending, so pages download faster.
    static final int GZIP_MIN_SIZE = 500;

    // ---------- The stylesheet ----------
    // Its address includes a fingerprint of its contents (style.css?v=1a2b3c4d), so
    // browsers can keep it for a year. When the file changes, so does the address.
    static final Path STYLE_CSS = SITE.resolve("style.css");
    static final String STYLE_VERSION = sha256(read(STYLE_CSS)).substring(0, 8);

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(envOr("PORT", "8080"));
        String host = envOr("HOST", "0.0.0.0");

        HttpServer server = HttpServer.create(new InetSocketAddress(host, port), 0);
        server.createContext("/", Server::handle);
        // A lightweight thread for each request, so one slow visitor can't hold up the rest.
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        // When the host stops the server, let requests in progress finish (up to a second).
        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(1)));
        System.out.println("serving " + SITE + " on http://" + host + ":" + port);
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
            System.out.println(Firewall.clientIp(exchange) + " \"" + exchange.getRequestMethod() + " "
                    + exchange.getRequestURI().getRawPath() + "\" " + status);
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
        if (path.equals("/style.css")) {
            String cache = STYLE_VERSION.equals(queryValue(exchange, "v"))
                    ? "public, max-age=31536000, immutable"
                    : "public, max-age=600";
            send(exchange, 200, read(STYLE_CSS), CONTENT_TYPES.get("css"), Map.of("Cache-Control", cache));
            return 200;
        }

        String name = path.substring(1);
        if (PUBLIC_FILES.containsKey(name)) {
            send(exchange, 200, read(SITE.resolve(name)), contentType(name),
                    Map.of("Cache-Control", "public, max-age=" + PUBLIC_FILES.get(name)));
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
            if (System.nanoTime() >= nextRefresh) {
                rebuild();
            }
            return new String[] {html, etag};
        }

        private void rebuild() {
            String page = new String(read(SITE.resolve("index.html")), StandardCharsets.UTF_8);
            page = page.replace("href=\"style.css\"", "href=\"style.css?v=" + STYLE_VERSION + "\"");

            try {
                page = Projects.insertCards(page, Projects.fetchRepos());
                nextRefresh = System.nanoTime() + PROJECTS_REFRESH * 1_000_000_000L;
            } catch (Exception error) {
                // Keep the cards saved in index.html and try GitHub again soon.
                System.err.println("couldn't reach GitHub (" + error + "), using the saved project cards");
                nextRefresh = System.nanoTime() + PROJECTS_RETRY * 1_000_000_000L;
            }

            try {
                page = Contributions.insertGraph(page, Contributions.fetchCalendar());
            } catch (Exception error) {
                // Keep the graph saved in index.html and try again soon.
                System.err.println("couldn't load the contribution graph (" + error + "), using the saved one");
                nextRefresh = System.nanoTime() + PROJECTS_RETRY * 1_000_000_000L;
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
