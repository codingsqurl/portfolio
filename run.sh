#!/bin/sh
# Builds and runs the Java server on this computer.
#
#   ./run.sh           start the server at http://127.0.0.1:8000
#   ./run.sh refresh   update the backup cards and graph saved in index.html
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

if [ "$1" = "refresh" ]; then
  exec java -cp build portfolio.Refresh index.html
fi
HOST="${HOST:-127.0.0.1}" PORT="${PORT:-8000}" exec java -cp build portfolio.Server
