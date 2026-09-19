# Build from the designs-repository root after copying a pinned Flowview release
# into workbench/, template/, and src/starters/. No credentials are image inputs.
FROM nginx:stable-alpine
COPY deploy/workbench/nginx.conf /etc/nginx/conf.d/default.conf
COPY workbench/ /usr/share/nginx/html/workbench/
COPY template/ /usr/share/nginx/html/template/
COPY src/starters/ /usr/share/nginx/html/src/starters/
