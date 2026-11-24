#!/usr/bin/env bash
# Helper service entry point: get the free A1 server, then deploy the app to it.
# retry-create.mjs exits 0 once the server exists (also when it already existed).
set -e
cd "$HOME/retry"
node retry-create.mjs
exec bash "$HOME/autodeploy/autodeploy.sh"
