# SAM copies only production source and installs exactly the reviewed lockfile.
# Local mock, test identities, docs and account config never enter the package.
build-Service:
	cp handler.mjs service.mjs aws-adapters.mjs package.json package-lock.json "$(ARTIFACTS_DIR)/"
	cd "$(ARTIFACTS_DIR)" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund
