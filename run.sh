#!/bin/sh
# Builds and runs the Java server on this computer.
#
#   ./run.sh           start the server at http://127.0.0.1:8000
#   ./run.sh refresh   update the backup cards and graph saved in index.html
#   ./run.sh test      run the tests (they never call GitHub)
#   ./run.sh pages     rebuild the GitHub Pages copy with fresh GitHub data and publish it
#
# It needs Java 21: brew install openjdk@21
set -e
cd "$(dirname "$0")"

# Use Homebrew's Java if it isn't already on the PATH.
if [ -x /opt/homebrew/opt/openjdk@21/bin/javac ]; then
  PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
fi

# Compile every .java file into build/. It takes a second or two.
rm -rf build
javac -d build --release 21 $(find server/src -name '*.java')

if [ "$1" = "test" ]; then
  # The tests sit beside the server code but never go in the container.
  rm -rf build-test
  javac -d build-test --release 21 $(find server/src server/test -name '*.java')
  exec java -cp build-test portfolio.AllTests
fi

if [ "$1" = "pages" ]; then
  # Build the static copy, then commit it to the gh-pages branch and push.
  # GitHub Pages publishes that branch within a minute or so.
  rm -rf build-pages .pages-worktree
  java -cp build portfolio.Snapshot build-pages "https://codingsqurl.github.io/portfolio/"
  git fetch -q origin gh-pages
  git worktree add -q .pages-worktree origin/gh-pages --detach
  cp -R build-pages/. .pages-worktree/
  cd .pages-worktree
  git add -A
  if git diff --cached --quiet; then
    echo "GitHub Pages is already up to date."
  else
    git commit -q -m "Refresh the GitHub Pages copy with the latest GitHub data"
    git push -q origin HEAD:gh-pages
    echo "Published. It'll be live at https://codingsqurl.github.io/portfolio/ in a minute or so."
  fi
  cd ..
  git worktree remove .pages-worktree
  rm -rf build-pages
  exit 0
fi

if [ "$1" = "refresh" ]; then
  exec java -cp build portfolio.Refresh index.html
fi
HOST="${HOST:-127.0.0.1}" PORT="${PORT:-8000}" exec java -cp build portfolio.Server
