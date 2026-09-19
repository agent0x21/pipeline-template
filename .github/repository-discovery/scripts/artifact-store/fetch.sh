#!/usr/bin/env bash
# Contract: fetch.sh <app-id> <version> <destination-directory>
#
# Called during promotion to retrieve the exact artifact that was published
# for this (app-id, version) by publish.sh, so promotion can re-publish it
# under the final version WITHOUT rebuilding from source. <version> here is
# the rc version that was tested (e.g. "1.5.0-rc.2"), matching what
# publish.sh was called with when that rc was created. <destination-directory>
# already exists; place whatever was stored into it.
#
# Replace the body below with the matching retrieval call for whatever
# publish.sh writes to.
set -euo pipefail
app_id="$1"
version="$2"
destination_directory="$3"

echo "artifact-store/fetch.sh is a placeholder and has not been configured." >&2
echo "Would fetch: app_id=${app_id} version=${version} destination_directory=${destination_directory}" >&2
echo "Edit scripts/artifact-store/fetch.sh to call your actual registry or storage." >&2
exit 1
