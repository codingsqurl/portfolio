package portfolio;

/**
 * Runs every test. From the repo folder:
 *
 *     ./run.sh test
 *
 * It exits with an error code if any test fails, so it can gate a deploy.
 */
public final class AllTests {
    private AllTests() {}

    public static void main(String[] args) throws Exception {
        // Must be set before the server code loads: never call GitHub during tests.
        System.setProperty("portfolio.offline", "true");
        System.setProperty("portfolio.quiet", "true");

        JsonTest.run();
        HtmlTest.run();
        ProjectsTest.run();
        ContributionsTest.run();
        ServerTest.run();
        FirewallTest.run();

        System.out.println();
        System.out.println(Check.passed + " passed, " + Check.failed + " failed");
        System.exit(Check.failed == 0 ? 0 : 1);
    }
}
