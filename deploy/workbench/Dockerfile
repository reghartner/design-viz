# Build from the company fork root. Specs stay under docs/diagrams; a page.canon
# block opts a document into the published library. No credentials are inputs.
FROM node:24-alpine AS library
WORKDIR /build
COPY tools/canon/ tools/canon/
COPY docs/diagrams/ docs/diagrams/
RUN node tools/canon/library.mjs --out /build/diagrams.json

FROM nginx:stable-alpine
COPY deploy/workbench/nginx.conf /etc/nginx/conf.d/default.conf
COPY workbench/ /usr/share/nginx/html/workbench/
COPY --from=library /build/diagrams.json /usr/share/nginx/html/workbench/diagrams.json
COPY template/ /usr/share/nginx/html/template/
COPY src/starters/ /usr/share/nginx/html/src/starters/
