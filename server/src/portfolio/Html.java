package portfolio;

/** Helpers for putting text from outside (like GitHub) safely into the page. */
final class Html {
    private Html() {}

    /**
     * Escapes text so it shows up as plain words and can never become HTML.
     * A repo description like {@code <script>} turns into {@code &lt;script&gt;}.
     */
    static String escape(String text) {
        StringBuilder out = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '&': out.append("&amp;"); break;
                case '<': out.append("&lt;"); break;
                case '>': out.append("&gt;"); break;
                case '"': out.append("&quot;"); break;
                case '\'': out.append("&#x27;"); break;
                default: out.append(c);
            }
        }
        return out.toString();
    }
}
