package portfolio;

import static portfolio.Check.equal;
import static portfolio.Check.isTrue;
import static portfolio.Check.section;
import static portfolio.Check.test;

/** The firewall: what it turns away, and that it doesn't turn away real visitors. */
final class FirewallTest {
    private FirewallTest() {}

    static void run() {
        section("Firewall");

        test("anything but reading is refused with 405", () -> {
            for (String method : new String[] {"POST", "PUT", "DELETE", "PATCH", "OPTIONS"}) {
                Client.Reply reply = Client.send(method, "/", Client.freshIp(), "Content-Length: 0");
                equal(405, reply.status());
                equal("GET, HEAD", reply.header("Allow"));
            }
        });

        test("refusals still carry the security headers and aren't cached", () -> {
            Client.Reply reply = Client.send("POST", "/", Client.freshIp(), "Content-Length: 0");
            equal(Server.CSP, reply.header("Content-Security-Policy"));
            equal("max-age=31536000", reply.header("Strict-Transport-Security"));
            equal("no-store", reply.header("Cache-Control"));
        });

        test("another site's name is refused with 421", () -> {
            equal(421, Client.send("GET", "/", Client.freshIp(), "Host: evil.example").status());
            equal(421, Client.send("GET", "/", Client.freshIp(), "Host: 203.0.113.9").status());
        });

        test("this site's own names are allowed, with or without a port", () -> {
            equal(200, Client.send("GET", "/", Client.freshIp(), "Host: codingsqurl.fly.dev").status());
            equal(200, Client.send("GET", "/", Client.freshIp(), "Host: localhost:8000").status());
            equal(200, Client.send("GET", "/", Client.freshIp(), "Host: CodingSqurl.Fly.Dev").status());
        });

        test("absurdly long addresses are refused with 414", () -> {
            equal(414, Client.get("/?q=" + "a".repeat(3000)).status());
        });

        test("a normal-length address with a query is fine", () -> {
            equal(200, Client.get("/?utm_source=linkedin").status());
        });

        test("requests carrying data are refused with 413", () -> {
            equal(413, Client.send("GET", "/", Client.freshIp(), "Content-Length: 1", "BODY:x").status());
            equal(413, Client.send("GET", "/", Client.freshIp(), "Transfer-Encoding: chunked", "BODY:0\r\n\r\n").status());
        });

        test("probes for things this site doesn't have are refused with 403", () -> {
            for (String probe : new String[] {"/wp-login.php", "/.env", "/.git/config", "/admin",
                    "/phpmyadmin/", "/cgi-bin/test", "/x?file=../../etc/passwd", "/%2e%2e/etc/passwd",
                    "/%2Eenv", "/WP-ADMIN/"}) {
                equal(403, Client.get(probe).status());
            }
        });

        test("one probe bans that visitor from the whole site", () -> {
            String bot = Client.freshIp();
            equal(403, Client.send("GET", "/.env", bot).status());
            equal(403, Client.send("GET", "/", bot).status());
            equal(403, Client.send("GET", "/style.css", bot).status());
        });

        test("a ban doesn't touch anyone else", () -> {
            String bot = Client.freshIp();
            equal(403, Client.send("GET", "/wp-login.php", bot).status());
            equal(200, Client.get("/").status());
        });

        test("ordinary addresses that only look a bit like probes are let through", () -> {
            // ".html" mustn't match ".htaccess", and "environment" isn't ".env".
            isTrue(!Firewall.PROBE.matcher("/about.html").find(), "/about.html");
            isTrue(!Firewall.PROBE.matcher("/?topic=environment").find(), "environment");
            equal(200, Client.get("/?ref=github").status());
        });

        test("a flood from one visitor is slowed down with 429", () -> {
            String flood = Client.freshIp();
            int allowed = 0;
            Client.Reply last = null;
            for (int i = 0; i < 70; i++) {
                last = Client.send("GET", "/robots.txt", flood);
                if (last.status() == 200) {
                    allowed++;
                }
            }
            // The first 60 get straight in (a few more trickle in while the loop runs).
            isTrue(allowed >= 60 && allowed < 70, "60 to 69 allowed, got " + allowed);
            equal(429, last.status());
            equal("30", last.header("Retry-After"));
        });

        test("a flood from one visitor doesn't slow down anyone else", () -> {
            equal(200, Client.get("/robots.txt").status());
        });

        test("the visitor is identified by Fly's header, which Fly sets itself", () -> {
            String ip = Client.freshIp();
            equal(403, Client.send("GET", "/xmlrpc.php", ip).status());
            equal(403, Client.send("GET", "/", ip).status());
            // The same machine without Fly's header is a different visitor.
            equal(200, Client.send("GET", "/", null).status());
        });
    }
}
