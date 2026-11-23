package portfolio;

import static portfolio.Check.equal;
import static portfolio.Check.section;
import static portfolio.Check.test;

/** Escaping: the thing that stops text from GitHub becoming HTML on the page. */
final class HtmlTest {
    private HtmlTest() {}

    static void run() {
        section("Html");

        test("escapes all five special characters", () -> {
            equal("&amp; &lt; &gt; &quot; &#x27;", Html.escape("& < > \" '"));
        });

        test("leaves plain text alone", () -> {
            equal("A Rust project · 2026 →", Html.escape("A Rust project · 2026 →"));
        });

        test("turns a script tag into harmless text", () -> {
            equal("&lt;script&gt;alert(1)&lt;/script&gt;", Html.escape("<script>alert(1)</script>"));
        });

        test("can't break out of an attribute", () -> {
            equal("x&quot; onmouseover=&quot;steal()", Html.escape("x\" onmouseover=\"steal()"));
        });
    }
}
