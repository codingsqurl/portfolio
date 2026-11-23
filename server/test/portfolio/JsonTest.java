package portfolio;

import static portfolio.Check.equal;
import static portfolio.Check.fails;
import static portfolio.Check.isTrue;
import static portfolio.Check.section;
import static portfolio.Check.test;

import java.util.List;
import java.util.Map;

/** The JSON reader: what GitHub's repo list gets turned into. */
final class JsonTest {
    private JsonTest() {}

    static void run() {
        section("Json");

        test("reads an object, keeping its fields", () -> {
            Map<?, ?> object = (Map<?, ?>) Json.parse("{\"name\": \"site\", \"stars\": 3}");
            equal("site", object.get("name"));
            equal(3.0, object.get("stars"));
        });

        test("reads arrays and nesting", () -> {
            List<?> list = (List<?>) Json.parse("[1, [2, 3], {\"a\": []}, \"x\"]");
            equal(4, list.size());
            equal(List.of(2.0, 3.0), list.get(1));
            equal(Map.of("a", List.of()), list.get(2));
        });

        test("reads true, false and null", () -> {
            equal(List.of(true, false), Json.parse("[true, false]"));
            isTrue(((Map<?, ?>) Json.parse("{\"homepage\": null}")).get("homepage") == null, "null field");
        });

        test("reads negative and decimal numbers", () -> {
            equal(List.of(-1.5, 250.0, 0.0), Json.parse("[-1.5, 2.5e2, 0]"));
        });

        test("decodes escapes in strings", () -> {
            equal("say \"hi\"\\ok\nnext\ttab", Json.parse("\"say \\\"hi\\\"\\\\ok\\nnext\\ttab\""));
        });

        test("decodes \\u escapes, like accents and arrows", () -> {
            equal("café →", Json.parse("\"caf\\u00e9 \\u2192\""));
        });

        test("ignores whitespace around values", () -> {
            equal(Map.of("a", 1.0), Json.parse("  \n {  \"a\" :\t1 }  \n"));
        });

        test("empty object and array", () -> {
            equal(Map.of(), Json.parse("{}"));
            equal(List.of(), Json.parse("[ ]"));
        });

        test("rejects broken JSON instead of guessing", () -> {
            fails(() -> Json.parse("{"));
            fails(() -> Json.parse("[1,]"));
            fails(() -> Json.parse("\"unfinished"));
            fails(() -> Json.parse("\"bad \\q escape\""));
            fails(() -> Json.parse("[1] extra"));
            fails(() -> Json.parse("{name: 1}"));
            fails(() -> Json.parse(""));
        });
    }
}
