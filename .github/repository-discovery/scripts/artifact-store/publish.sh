#!/usr/bin/env bash
# Contract: publish.sh <app-id> <version> <app-directory>
#
# Called once an RC build has passed, to persist the build output somewhere
# that survives until a human promotes it to a final version later — which
# may be days or weeks after this runs, well past GitHub Actions' own
# artifact retention. <app-directory> is the application's working
# directory after building; this script decides what subset of it to
# package (dist/, bin/Release, a wheel, whatever your ecosystem produces)
# and where it goes.
#
# Replace the body below with a call to whatever registry or storage you
# use: npm publish, dotnet nuget push, gh release upload, aws s3 cp, curl to
# an internal artifact server, etc. This is intentionally a thin,
# swappable seam — nothing in src/version*.ts depends on how this is
# implemented, only that fetch.sh can later retrieve whatever this stores,
# keyed by the same (app-id, version) pair.
set -euo pipefail
app_id="$1"
version="$2"
app_directory="$3"

echo "artifact-store/publish.sh is a placeholder and has not been configured." >&2
echo "Would publish: app_id=${app_id} version=${version} app_directory=${app_directory}" >&2
echo "Edit scripts/artifact-store/publish.sh to call your actual registry or storage." >&2
exit 1
