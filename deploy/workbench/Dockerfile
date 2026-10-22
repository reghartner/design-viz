# Build from the company fork root. HTML is generated from source in this stage.
# Explicit inputs keep local credentials and development dependencies out.
FROM node:24.22.1-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 && apt-get clean
WORKDIR /build
COPY tools/browser-tests/package*.json tools/browser-tests/
RUN npm ci --prefix tools/browser-tests && cd tools/browser-tests && npx playwright install --with-deps chromium
COPY LICENSE LICENSE
COPY src/ src/
COPY tools/*.py tools/*.cjs tools/*.js tools/
COPY tools/canon/ tools/canon/
COPY tools/arrange/*.cjs tools/arrange/
COPY contract/ contract/
COPY cookbook/ cookbook/
COPY docs/ docs/
COPY .claude/skills/hld-to-page/ .claude/skills/hld-to-page/
# Examples marked with .agent-kit join the offline folder-agent kit.
COPY examples/ examples/
# Fork-owned overlay: company panels, contract fragments and examples.
COPY company/ company/
COPY canon.json canon.json
COPY diagrams/ diagrams/
COPY workbench/ workbench/
RUN python3 tools/build.py && node tools/canon/library.mjs --thumbnails

FROM nginx:1.30.6-alpine
COPY --from=build /build/LICENSE /usr/share/nginx/html/LICENSE
COPY deploy/workbench/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/workbench/ /usr/share/nginx/html/workbench/
COPY --from=build /build/template/ /usr/share/nginx/html/template/
COPY --from=build /build/src/starters/ /usr/share/nginx/html/src/starters/
COPY --from=build /build/canon.json /usr/share/nginx/html/canon.json
COPY --from=build /build/diagrams/ /usr/share/nginx/html/diagrams/
