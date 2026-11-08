package portfolio;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A small JSON reader, just enough for GitHub's list of repos.
 *
 * Java has no JSON reader built in, and this is the only JSON the server ever
 * reads, so a few dozen lines here beat adding a whole library to trust and patch.
 *
 * Objects become Maps, arrays become Lists, strings become Strings, numbers
 * become Doubles, and true/false/null become Boolean or null.
 */
final class Json {
    private final String text;
    private int at = 0;

    private Json(String text) {
        this.text = text;
    }

    static Object parse(String text) {
        Json reader = new Json(text);
        Object value = reader.value();
        reader.skipSpace();
        if (reader.at != text.length()) {
            throw reader.error("extra text after the end");
        }
        return value;
    }

    private Object value() {
        skipSpace();
        if (at >= text.length()) {
            throw error("unexpected end");
        }
        char c = text.charAt(at);
        switch (c) {
            case '{': return object();
            case '[': return array();
            case '"': return string();
            case 't': return word("true", Boolean.TRUE);
            case 'f': return word("false", Boolean.FALSE);
            case 'n': return word("null", null);
            default:
                if (c == '-' || (c >= '0' && c <= '9')) {
                    return number();
                }
                throw error("unexpected '" + c + "'");
        }
    }

    private Map<String, Object> object() {
        Map<String, Object> map = new LinkedHashMap<>();
        at++; // {
        skipSpace();
        if (peek() == '}') {
            at++;
            return map;
        }
        while (true) {
            skipSpace();
            if (peek() != '"') {
                throw error("expected a name in quotes");
            }
            String name = string();
            skipSpace();
            expect(':');
            map.put(name, value());
            skipSpace();
            if (peek() == ',') {
                at++;
            } else {
                expect('}');
                return map;
            }
        }
    }

    private List<Object> array() {
        List<Object> list = new ArrayList<>();
        at++; // [
        skipSpace();
        if (peek() == ']') {
            at++;
            return list;
        }
        while (true) {
            list.add(value());
            skipSpace();
            if (peek() == ',') {
                at++;
            } else {
                expect(']');
                return list;
            }
        }
    }

    private String string() {
        at++; // opening quote
        StringBuilder out = new StringBuilder();
        while (true) {
            if (at >= text.length()) {
                throw error("unfinished string");
            }
            char c = text.charAt(at++);
            if (c == '"') {
                return out.toString();
            }
            if (c != '\\') {
                out.append(c);
                continue;
            }
            if (at >= text.length()) {
                throw error("unfinished string");
            }
            char escaped = text.charAt(at++);
            switch (escaped) {
                case '"': out.append('"'); break;
                case '\\': out.append('\\'); break;
                case '/': out.append('/'); break;
                case 'b': out.append('\b'); break;
                case 'f': out.append('\f'); break;
                case 'n': out.append('\n'); break;
                case 'r': out.append('\r'); break;
                case 't': out.append('\t'); break;
                case 'u':
                    if (at + 4 > text.length()) {
                        throw error("bad \\u escape");
                    }
                    out.append((char) Integer.parseInt(text.substring(at, at + 4), 16));
                    at += 4;
                    break;
                default:
                    throw error("bad escape \\" + escaped);
            }
        }
    }

    private Double number() {
        int start = at;
        while (at < text.length() && "+-0123456789.eE".indexOf(text.charAt(at)) >= 0) {
            at++;
        }
        return Double.valueOf(text.substring(start, at));
    }

    private Object word(String word, Object value) {
        if (!text.startsWith(word, at)) {
            throw error("expected " + word);
        }
        at += word.length();
        return value;
    }

    private void skipSpace() {
        while (at < text.length() && Character.isWhitespace(text.charAt(at))) {
            at++;
        }
    }

    private char peek() {
        return at < text.length() ? text.charAt(at) : '\0';
    }

    private void expect(char c) {
        if (peek() != c) {
            throw error("expected '" + c + "'");
        }
        at++;
    }

    private IllegalArgumentException error(String message) {
        return new IllegalArgumentException("bad JSON at character " + at + ": " + message);
    }
}
