# Lightweight, dependency-free checks for the SemVer parsing logic used by
# dotnet-version.ps1. Run with: pwsh .github/scripts/versioning/dotnet-version.tests.ps1
$ErrorActionPreference = 'Stop'

function Get-CoreParts {
    param([string] $Version)
    $match = [regex]::Match($Version, '^(\d+)\.(\d+)\.(\d+)')
    if (-not $match.Success) {
        throw "Unable to parse major.minor.patch from version '$Version'"
    }
    @($match.Groups[1].Value, $match.Groups[2].Value, $match.Groups[3].Value) | ForEach-Object { [int]$_ }
}

$cases = @(
    @{ Input = '0.1.0';        Expected = @(0, 1, 0) }
    @{ Input = '0.1.0-beta';   Expected = @(0, 1, 0) }
    @{ Input = '0.1.0-beta.1'; Expected = @(0, 1, 0) }
    @{ Input = '0.1.0-rc';     Expected = @(0, 1, 0) }
    @{ Input = '0.1.0-rc.2';   Expected = @(0, 1, 0) }
    @{ Input = '1.2.3+build5'; Expected = @(1, 2, 3) }
)

$failures = 0
foreach ($case in $cases) {
    $actual = Get-CoreParts -Version $case.Input
    if (($actual -join '.') -ne ($case.Expected -join '.')) {
        Write-Host "FAIL: '$($case.Input)' => $($actual -join '.') (expected $($case.Expected -join '.'))"
        $failures++
    } else {
        Write-Host "PASS: '$($case.Input)' => $($actual -join '.')"
    }
}

$invalidCases = @('not-a-version', '')
foreach ($bad in $invalidCases) {
    try {
        Get-CoreParts -Version $bad | Out-Null
        Write-Host "FAIL: '$bad' should have thrown"
        $failures++
    } catch {
        Write-Host "PASS: '$bad' threw as expected"
    }
}

if ($failures -gt 0) {
    Write-Error "$failures test case(s) failed"
    exit 1
}

Write-Host "All version-parsing tests passed."
