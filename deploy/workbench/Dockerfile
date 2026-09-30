# Build from the company fork root. HTML is generated from source in this stage.
# Explicit inputs keep local credentials and development dependencies out.
FROM node:24-alpine AS build
RUN apk add --no-cache python3
WORKDIR /build
COPY src/ src/
COPY tools/*.py tools/*.cjs tools/*.js tools/
COPY tools/canon/ tools/canon/
COPY contract/ contract/
COPY cookbook/ cookbook/
COPY docs/ docs/
COPY .claude/skills/hld-to-page/ .claude/skills/hld-to-page/
COPY examples/canon/ examples/canon/
COPY canon.json canon.json
COPY diagrams/ diagrams/
COPY workbench/ workbench/
RUN python3 tools/build.py

FROM nginx:stable-alpine
COPY deploy/workbench/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/workbench/ /usr/share/nginx/html/workbench/
COPY --from=build /build/template/ /usr/share/nginx/html/template/
COPY --from=build /build/src/starters/ /usr/share/nginx/html/src/starters/
COPY --from=build /build/canon.json /usr/share/nginx/html/canon.json
COPY --from=build /build/diagrams/ /usr/share/nginx/html/diagrams/
