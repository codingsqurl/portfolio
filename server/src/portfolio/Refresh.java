package portfolio;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Refreshes the backup copies of the project cards and contribution graph saved
 * in index.html. The live server keeps its own copies fresh; these are what it
 * shows if GitHub can't be reached. Run it from the repo folder with:
 *
 *     ./run.sh refresh
 */
public final class Refresh {
    private Refresh() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: Refresh <file.html>");
            System.exit(2);
        }
        Path path = Path.of(args[0]);
        String page = Files.readString(path, StandardCharsets.UTF_8);
        if (!Projects.hasMarkers(page) || !Contributions.hasMarkers(page)) {
            System.err.println("error: the GITHUB-PROJECTS and GITHUB-CONTRIBUTIONS markers must both be in " + path);
            System.exit(1);
        }

        var repos = Projects.fetchRepos();
        var calendar = Contributions.fetchCalendar();
        page = Projects.insertCards(page, repos);
        page = Contributions.insertGraph(page, calendar);
        Files.writeString(path, page, StandardCharsets.UTF_8);

        System.out.println("wrote " + repos.size() + " project cards: "
                + String.join(", ", repos.stream().map(r -> String.valueOf(r.get("name"))).toList()));
        System.out.println("wrote the contribution graph: " + calendar.count() + " contributions over "
                + calendar.days().size() + " days");
    }
}
