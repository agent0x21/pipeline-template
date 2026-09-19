<#
.SYNOPSIS
Contract: fetch.ps1 -AppId <id> -Version <version> -DestinationDirectory <path>

Called during promotion to retrieve the exact artifact that was published
for this (AppId, Version) by publish.ps1, so promotion can re-publish it
under the final version WITHOUT rebuilding from source. -Version here is
the rc version that was tested (e.g. "1.5.0-rc.2"), matching what
publish.ps1 was called with when that rc was created. -DestinationDirectory
already exists; place whatever was stored into it.

Replace the body below with the matching retrieval call for whatever
publish.ps1 writes to.
#>
param(
    [Parameter(Mandatory = $true)][string]$AppId,
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$DestinationDirectory
)

Write-Error "artifact-store/fetch.ps1 is a placeholder and has not been configured."
Write-Host "Would fetch: AppId=$AppId Version=$Version DestinationDirectory=$DestinationDirectory"
Write-Host "Edit scripts/artifact-store/fetch.ps1 to call your actual registry or storage."
exit 1
