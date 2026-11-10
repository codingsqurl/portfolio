# The recipe Fly.io follows to package the site and its server into a container.
# It has two steps: compile the Java code with the full JDK, then copy just the
# result into a much smaller image that can only run Java, not build it.

# ---------- Step 1: compile ----------
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /build
COPY server/src/ src/
RUN javac -d classes --release 21 $(find src -name '*.java')

# ---------- Step 2: the image that actually runs ----------
# The JRE ("Java runtime") has no compiler, so there are fewer programs inside to exploit.
FROM eclipse-temurin:21-jre-alpine

WORKDIR /srv

# Only the compiled server and the public site files go in. Notes like README.md
# and the checklists never reach the live server, and neither does the source code.
COPY --from=build /build/classes/ classes/
COPY index.html 404.html style.css favicon.svg og-image.png robots.txt sitemap.xml ./

# Run as a regular user rather than root, so a bug in the server can't take over the container.
RUN adduser -S -H web
USER web

# Most hosts tell the server which port to use through $PORT. If none is given, use 8080.
ENV PORT=8080
EXPOSE 8080
# "exec" lets the host stop the server cleanly.
# The memory settings keep Java well inside Fly's smallest (256 MB) machine:
# a 96 MB cap for the site's data, the simplest garbage collector, and small thread stacks.
CMD exec java -Xmx96m -Xss512k -XX:+UseSerialGC -XX:MaxMetaspaceSize=48m -XX:+ExitOnOutOfMemoryError \
    -cp classes portfolio.Server
