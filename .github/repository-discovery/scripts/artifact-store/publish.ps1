<#
.SYNOPSIS
Contract: publish.ps1 -AppId <id> -Version <version> -AppDirectory <path>

Called once an RC build has passed, to persist the build output somewhere
that survives until a human promotes it to a final version later — which
may be days or weeks after this runs, well past GitHub Actions' own
artifact retention. -AppDirectory is the application's working directory
after building; this script decides what subset of it to package (a
dist/ folder, bin/Release, a wheel, whatever your ecosystem produces) and
where it goes.

Replace the body below with a call to whatever registry or storage you
use: npm publish, dotnet nuget push, gh release upload, aws s3 cp, curl to
an internal artifact server, etc. This is intentionally a thin, swappable
seam — nothing in src/version*.ts depends on how this is implemented,
only that fetch.ps1 can later retrieve whatever this stores, keyed by the
same (AppId, Version) pair.
#>
param(
    [Parameter(Mandatory = $true)][string]$AppId,
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$AppDirectory
)

Write-Error "artifact-store/publish.ps1 is a placeholder and has not been configured."
Write-Host "Would publish: AppId=$AppId Version=$Version AppDirectory=$AppDirectory"
Write-Host "Edit scripts/artifact-store/publish.ps1 to call your actual registry or storage."
exit 1
