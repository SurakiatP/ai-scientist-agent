#!/bin/sh
# Copy the built web manual into the frontend so /docs serves it: manual-kit build web && manual/publish-web.sh
set -e
cd "$(dirname "$0")/.."
rm -rf frontend/public/manual && cp -R manual/dist/web frontend/public/manual
