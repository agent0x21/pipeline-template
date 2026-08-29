#!/usr/bin/env pwsh

# Per-service SemVer engine for the TimeClock monorepo.
#
# Version model:
#   dev  -> M.N.P-beta+BUILD
#   qa   -> M.N.P-rc+BUILD
#   main -> M.N.P+BUILD
#
# The production build metadata is inherited from the matching QA release
# candidate so promotion preserves artifact/build identity:
#   1.4.0-beta+1042 -> 1.4.0-rc+1087 -> 1.4.0+1087
#
# Note: SemVer build metadata (the portion after '+') does not participate in
# version precedence. image_version is a Docker-safe encoding and is not SemVer.
#
# Requirements:
#   - PowerShell 7+
#   - git
#
# Commands:
#   ./version.ps1 matrix
#
#   ./version.ps1 plan \
#       --slug S \
#       --branch B \
#       --buildnum N \
#       [--bump Auto|Major|Minor|Patch] \
#       [--since SHA] \
#       [--force]

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Git {
    param(
        [Parameter(Mandatory)]
        [string[]] $Arguments,

        [switch] $AllowFailure
    )

    $output = & git @Arguments 2>$null
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "git $($Arguments -join ' ') failed with exit code $exitCode"
    }

    if ($null -eq $output) {
        return @()
    }

    return @($output)
}

$repoRootLines = @(Invoke-Git -Arguments @('rev-parse', '--show-toplevel'))
if ($repoRootLines.Count -eq 0) {
    throw 'Unable to determine repository root.'
}

$script:RepoRoot = [System.IO.Path]::GetFullPath([string]$repoRootLines[0])
Set-Location -LiteralPath $script:RepoRoot

function ConvertTo-ServiceSlug {
    param([Parameter(Mandatory)][string] $Name)

    $value = $Name
    if ($value.StartsWith('TimeClock.', [System.StringComparison]::Ordinal)) {
        $value = $value.Substring('TimeClock.'.Length)
    }

    $value = $value.Replace('.', ' ')
    $value = [regex]::Replace($value, '([A-Z]+)([A-Z][a-z])', '$1 $2')
    $value = [regex]::Replace($value, '([a-z0-9])([A-Z])', '$1 $2')
    $value = $value.ToLowerInvariant()
    $value = [regex]::Replace($value, '\s+', '-')
    $value = $value.Trim('-')

    return $value
}


function Get-ObjectPropertyValue {
    param(
        [Parameter(Mandatory)] $Object,
        [Parameter(Mandatory)][string] $Name,
        $Default = $null
    )

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $Default
    }

    return $property.Value
}

function Get-ServiceConfigFile {
    $config = if ([string]::IsNullOrWhiteSpace($env:SERVICE_CATALOG)) {
        '.github/service-catalog.json'
    }
    else {
        $env:SERVICE_CATALOG
    }

    if (Test-Path -LiteralPath $config -PathType Leaf) {
        return $config
    }

    return $null
}

function Get-DiscoveredServices {
    $dockerfiles = Get-ChildItem -LiteralPath 'src' -Filter 'Dockerfile' -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object -Property FullName

    foreach ($dockerfile in $dockerfiles) {
        $dirInfo = $dockerfile.Directory
        $csprojs = @(Get-ChildItem -LiteralPath $dirInfo.FullName -Filter '*.csproj' -File)

        if ($csprojs.Count -ne 1) {
            [Console]::Error.WriteLine(
                "::warning::skipping $($dockerfile.FullName): expected exactly one .csproj in $($dirInfo.FullName), found $($csprojs.Count)"
            )
            continue
        }

        $csproj = $csprojs[0]
        $name = [System.IO.Path]::GetFileNameWithoutExtension($csproj.Name)
        $slug = ConvertTo-ServiceSlug -Name $name

        $dir = [System.IO.Path]::GetRelativePath($script:RepoRoot, $dirInfo.FullName).Replace('\', '/')
        $project = [System.IO.Path]::GetRelativePath($script:RepoRoot, $csproj.FullName).Replace('\', '/')
        $docker = [System.IO.Path]::GetRelativePath($script:RepoRoot, $dockerfile.FullName).Replace('\', '/')

        [pscustomobject]@{
            slug            = $slug
            name            = $name
            type            = 'dotnet'
            path            = $dir
            dir             = $dir
            csproj          = $project
            project         = $project
            dockerfile      = $docker
            docker_context  = '.'
            dotnet_version  = ''
            node_version    = ''
            install_command = ''
            build_command   = ''
            test_command    = ''
            depends_on      = @()
        }
    }
}

function Get-ServiceMatrix {
    $config = Get-ServiceConfigFile

    if ($null -ne $config) {
        $catalog = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
        $catalogServices = Get-ObjectPropertyValue -Object $catalog -Name 'services' -Default @()

        $services = @($catalogServices | ForEach-Object {
            $slug = [string](Get-ObjectPropertyValue -Object $_ -Name 'slug' -Default '')
            $projectValue = Get-ObjectPropertyValue -Object $_ -Name 'project'
            if ([string]::IsNullOrWhiteSpace([string]$projectValue)) {
                $projectValue = Get-ObjectPropertyValue -Object $_ -Name 'csproj' -Default ''
            }

            $path = [string](Get-ObjectPropertyValue -Object $_ -Name 'path' -Default '')
            $nameValue = Get-ObjectPropertyValue -Object $_ -Name 'name'
            $typeValue = Get-ObjectPropertyValue -Object $_ -Name 'type'
            $dockerContextValue = Get-ObjectPropertyValue -Object $_ -Name 'docker_context'
            $dependsOnValue = Get-ObjectPropertyValue -Object $_ -Name 'depends_on' -Default @()

            [pscustomobject]@{
                slug            = $slug
                name            = if ($null -ne $nameValue -and -not [string]::IsNullOrWhiteSpace([string]$nameValue)) { [string]$nameValue } else { $slug }
                type            = if ($null -ne $typeValue -and -not [string]::IsNullOrWhiteSpace([string]$typeValue)) { [string]$typeValue } else { 'dotnet' }
                path            = $path
                dir             = $path
                csproj          = [string]$projectValue
                project         = [string]$projectValue
                dockerfile      = [string](Get-ObjectPropertyValue -Object $_ -Name 'dockerfile' -Default '')
                docker_context  = if ($null -ne $dockerContextValue -and -not [string]::IsNullOrWhiteSpace([string]$dockerContextValue)) { [string]$dockerContextValue } else { '.' }
                dotnet_version  = [string](Get-ObjectPropertyValue -Object $_ -Name 'dotnet_version' -Default '')
                node_version    = [string](Get-ObjectPropertyValue -Object $_ -Name 'node_version' -Default '')
                install_command = [string](Get-ObjectPropertyValue -Object $_ -Name 'install_command' -Default '')
                build_command   = [string](Get-ObjectPropertyValue -Object $_ -Name 'build_command' -Default '')
                test_command    = [string](Get-ObjectPropertyValue -Object $_ -Name 'test_command' -Default '')
                depends_on      = @($dependsOnValue)
            }
        })

        return $services
    }

    return @(Get-DiscoveredServices)
}

function Write-Matrix {
    $matrix = @(Get-ServiceMatrix)
    $json = ConvertTo-Json -InputObject $matrix -Depth 10 -Compress
    Write-Output $json
}

# ---------------------------------------------------------------------------
# Dependency graph
# ---------------------------------------------------------------------------

$script:SeenProjects = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$script:DepDirSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$script:DepDirs = [System.Collections.Generic.List[string]]::new()

function Reset-Dependencies {
    $script:SeenProjects.Clear()
    $script:DepDirSet.Clear()
    $script:DepDirs.Clear()
}

function Add-DependencyDirectory {
    param([Parameter(Mandatory)][string] $Directory)

    $normalized = $Directory.Replace('\', '/').TrimEnd('/')
    if ($script:DepDirSet.Add($normalized)) {
        $script:DepDirs.Add($normalized)
    }
}

function Get-ProjectReferences {
    param([Parameter(Mandatory)][string] $ProjectFile)

    # Keep the original script's lightweight ProjectReference parser behavior:
    # flatten the file and inspect ProjectReference tags rather than evaluating
    # MSBuild properties or loading the project through MSBuild.
    $text = (Get-Content -LiteralPath $ProjectFile -Raw) -replace "`r?`n", ' '
    $tags = [regex]::Matches($text, '<ProjectReference(?:\s+[^>]*)?>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

    foreach ($tagMatch in $tags) {
        $tag = $tagMatch.Value
        $include = [regex]::Match($tag, 'Include\s*=\s*"([^"]+)"', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if (-not $include.Success) {
            $include = [regex]::Match($tag, "Include\s*=\s*'([^']+)'", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        }

        if ($include.Success) {
            Write-Output $include.Groups[1].Value
        }
    }
}

function Test-IsInsideRepository {
    param([Parameter(Mandatory)][string] $Path)

    $repoWithSeparator = $script:RepoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $full = [System.IO.Path]::GetFullPath($Path)

    return $full.StartsWith($repoWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)
}

function Resolve-Dependencies {
    param([Parameter(Mandatory)][string] $Project)

    $absProject = if ([System.IO.Path]::IsPathRooted($Project)) {
        [System.IO.Path]::GetFullPath($Project)
    }
    else {
        [System.IO.Path]::GetFullPath((Join-Path $script:RepoRoot $Project))
    }

    if (-not (Test-IsInsideRepository -Path $absProject)) {
        return
    }

    if (-not (Test-Path -LiteralPath $absProject -PathType Leaf)) {
        return
    }

    $relProject = [System.IO.Path]::GetRelativePath($script:RepoRoot, $absProject).Replace('\', '/')
    if (-not $script:SeenProjects.Add($relProject)) {
        return
    }

    $dir = [System.IO.Path]::GetDirectoryName($relProject).Replace('\', '/')
    Add-DependencyDirectory -Directory $dir

    foreach ($includeRaw in @(Get-ProjectReferences -ProjectFile $absProject)) {
        $include = [string]$includeRaw
        if ([string]::IsNullOrWhiteSpace($include)) {
            continue
        }

        $include = $include.Replace('\', '/')

        if ($include.Contains('$(')) {
            [Console]::Error.WriteLine(
                "::warning::cannot resolve MSBuild property in ProjectReference '$include' from $relProject"
            )
            continue
        }

        $projectDir = Split-Path -Parent $absProject
        $refPath = [System.IO.Path]::GetFullPath((Join-Path $projectDir $include))

        if (-not (Test-IsInsideRepository -Path $refPath)) {
            [Console]::Error.WriteLine(
                "::warning::ignoring ProjectReference outside repository: $include from $relProject"
            )
            continue
        }

        if (-not (Test-Path -LiteralPath $refPath -PathType Leaf)) {
            [Console]::Error.WriteLine(
                "::warning::ProjectReference target not found: $include from $relProject"
            )
            continue
        }

        $relRef = [System.IO.Path]::GetRelativePath($script:RepoRoot, $refPath).Replace('\', '/')
        Resolve-Dependencies -Project $relRef
    }
}

# ---------------------------------------------------------------------------
# Versioning
# ---------------------------------------------------------------------------

function Get-LastReleaseTag {
    param([Parameter(Mandatory)][string] $Slug)

    $tags = Invoke-Git -Arguments @(
        'tag',
        '--list', "${Slug}/v[0-9]*.[0-9]*.[0-9]*",
        '--sort=-v:refname'
    ) -AllowFailure

    foreach ($tag in $tags) {
        if ([string]$tag -match "^$([regex]::Escape($Slug))/v[0-9]+\.[0-9]+\.[0-9]+$") {
            return [string]$tag
        }
    }

    return $null
}

function Get-LastEnvironmentTag {
    param(
        [Parameter(Mandatory)][string] $Slug,
        [Parameter(Mandatory)][string] $Branch
    )

    $escapedSlug = [regex]::Escape($Slug)

    switch ($Branch) {
        'dev' {
            $tags = Invoke-Git -Arguments @(
                'tag',
                '--list', "${Slug}/v*-beta+*",
                '--sort=-v:refname'
            ) -AllowFailure

            foreach ($tag in $tags) {
                if ([string]$tag -match "^${escapedSlug}/v[0-9]+\.[0-9]+\.[0-9]+-beta\+[0-9]+$") {
                    return [string]$tag
                }
            }

            return $null
        }

        'qa' {
            $tags = Invoke-Git -Arguments @(
                'tag',
                '--list', "${Slug}/v*-rc+*",
                '--sort=-v:refname'
            ) -AllowFailure

            foreach ($tag in $tags) {
                if ([string]$tag -match "^${escapedSlug}/v[0-9]+\.[0-9]+\.[0-9]+-rc\+[0-9]+$") {
                    return [string]$tag
                }
            }

            return $null
        }

        'main' {
            return Get-LastReleaseTag -Slug $Slug
        }

        default {
            return $null
        }
    }
}

function Get-BumpFromCommits {
    param([string[]] $CommitRecords)

    $sawFeat = $false
    $sawFix = $false

    foreach ($blob in $CommitRecords) {
        if ([string]::IsNullOrWhiteSpace($blob)) {
            continue
        }

        $subject = ($blob -split "`n", 2)[0]

        if ($subject -match '^[a-zA-Z0-9_-]+(\([^)]*\))?!:' -or $blob -match '(?im)BREAKING[ -]CHANGE:') {
            return 'major'
        }

        if ($subject -match '^feat(\([^)]*\))?:') {
            $sawFeat = $true
        }
        elseif ($subject -match '^fix(\([^)]*\))?:') {
            $sawFix = $true
        }
    }

    if ($sawFeat) { return 'minor' }
    if ($sawFix) { return 'patch' }
    return 'minor'
}

function Get-CommitRecords {
    param(
        [Parameter(Mandatory)][string] $Range,
        [Parameter(Mandatory)][string[]] $Paths
    )

    # Record separator (0x1e) avoids depending on Bash's NUL-delimited read.
    $gitArgs = @('log', $Range, '--pretty=format:%s%n%b%x1e', '--') + $Paths
    $lines = Invoke-Git -Arguments $gitArgs -AllowFailure
    $joined = $lines -join "`n"

    if ([string]::IsNullOrEmpty($joined)) {
        return @()
    }

    return @($joined -split [char]0x1e)
}

function Apply-VersionBump {
    param(
        [Parameter(Mandatory)][int] $Major,
        [Parameter(Mandatory)][int] $Minor,
        [Parameter(Mandatory)][int] $Patch,
        [Parameter(Mandatory)][string] $Bump
    )

    switch ($Bump) {
        'major' { return @(($Major + 1), 0, 0) }
        'minor' { return @($Major, ($Minor + 1), 0) }
        'patch' { return @($Major, $Minor, ($Patch + 1)) }
        default { throw "unsupported bump: $Bump" }
    }
}

function Format-Version {
    param(
        [Parameter(Mandatory)][int] $Major,
        [Parameter(Mandatory)][int] $Minor,
        [Parameter(Mandatory)][int] $Patch,
        [Parameter(Mandatory)][string] $Branch,
        [Parameter(Mandatory)][string] $BuildNumber
    )

    if ($BuildNumber -notmatch '^[0-9]+$') {
        throw "build number must contain digits only: $BuildNumber"
    }

    switch ($Branch) {
        'dev'  { return "$Major.$Minor.$Patch-beta+$BuildNumber" }
        'qa'   { return "$Major.$Minor.$Patch-rc+$BuildNumber" }
        'main' { return "$Major.$Minor.$Patch+$BuildNumber" }
        default { throw "unsupported branch: $Branch" }
    }
}

function Compare-CoreVersions {
    param(
        [Parameter(Mandatory)][string] $Left,
        [Parameter(Mandatory)][string] $Right
    )

    $l = @($Left.Split('.') | ForEach-Object { [int]$_ })
    $r = @($Right.Split('.') | ForEach-Object { [int]$_ })

    for ($i = 0; $i -lt 3; $i++) {
        if ($l[$i] -gt $r[$i]) { return 1 }
        if ($l[$i] -lt $r[$i]) { return -1 }
    }

    return 0
}

function Get-HighestCoreFromTags {
    param(
        [Parameter(Mandatory)][string] $Slug,
        [Parameter(Mandatory)][string] $Pattern
    )

    $cores = foreach ($tag in (Invoke-Git -Arguments @('tag', '--list', $Pattern) -AllowFailure)) {
        if ([string]$tag -match "^$([regex]::Escape($Slug))/v(?<core>[0-9]+\.[0-9]+\.[0-9]+)") {
            $matches['core']
        }
    }

    if ($null -eq $cores -or @($cores).Count -eq 0) {
        return $null
    }

    return @($cores | Sort-Object {
        $parts = $_.Split('.')
        ([long]$parts[0] * 1000000000000L) + ([long]$parts[1] * 1000000L) + [long]$parts[2]
    } -Descending)[0]
}

function Get-UpstreamFloorCoreVersion {
    param(
        [Parameter(Mandatory)][string] $Slug,
        [Parameter(Mandatory)][string] $Branch
    )

    switch ($Branch) {
        'qa'   { return Get-HighestCoreFromTags -Slug $Slug -Pattern "${Slug}/v*-beta+*" }
        'main' { return Get-HighestCoreFromTags -Slug $Slug -Pattern "${Slug}/v*-rc+*" }
        default { return $null }
    }
}

function Get-QaPromotionBuildNumber {
    param(
        [Parameter(Mandatory)][string] $Slug,
        [Parameter(Mandatory)][string] $CoreVersion
    )

    $pattern = "${Slug}/v${CoreVersion}-rc+*"
    $tags = Invoke-Git -Arguments @(
        'tag',
        '--list', $pattern,
        '--sort=-v:refname'
    ) -AllowFailure

    $escapedSlug = [regex]::Escape($Slug)
    $escapedCore = [regex]::Escape($CoreVersion)

    foreach ($tag in $tags) {
        if ([string]$tag -match "^${escapedSlug}/v${escapedCore}-rc\+(?<build>[0-9]+)$") {
            return [string]$matches['build']
        }
    }

    return $null
}


function ConvertTo-DockerImageVersion {
    param([Parameter(Mandatory)][string] $Version)

    # Docker tag names do not allow '+'. Use '_' as an explicit transport
    # encoding so the result is not mistaken for another SemVer prerelease.
    return $Version.Replace('+', '_')
}


function Test-GitObject {
    param([Parameter(Mandatory)][string] $Object)

    & git cat-file -e $Object 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Test-GitRevision {
    param([Parameter(Mandatory)][string] $Revision)

    & git rev-parse $Revision *> $null
    return ($LASTEXITCODE -eq 0)
}

function Get-PlanArguments {
    param([Parameter(Mandatory)][string[]] $Arguments)

    $result = [ordered]@{
        slug        = ''
        branch      = ''
        bump        = 'Auto'
        buildnum    = ''
        since       = ''
        force       = $false
    }

    $i = 0
    while ($i -lt $Arguments.Count) {
        $arg = $Arguments[$i]

        switch ($arg) {
            '--slug' {
                if ($i + 1 -ge $Arguments.Count) { throw '--slug requires a value' }
                $result.slug = $Arguments[$i + 1]
                $i += 2
            }
            '--branch' {
                if ($i + 1 -ge $Arguments.Count) { throw '--branch requires a value' }
                $result.branch = $Arguments[$i + 1]
                $i += 2
            }
            '--bump' {
                if ($i + 1 -ge $Arguments.Count) { throw '--bump requires a value' }
                $result.bump = $Arguments[$i + 1]
                $i += 2
            }
            '--buildnum' {
                if ($i + 1 -ge $Arguments.Count) { throw '--buildnum requires a value' }
                $result.buildnum = $Arguments[$i + 1]
                $i += 2
            }
            '--since' {
                if ($i + 1 -ge $Arguments.Count) { throw '--since requires a value' }
                $result.since = $Arguments[$i + 1]
                $i += 2
            }
            '--force' {
                $result.force = $true
                $i += 1
            }
            default {
                throw "unknown argument: $arg"
            }
        }
    }

    return [pscustomobject]$result
}

function Write-Plan {
    param([Parameter(Mandatory)][string[]] $Arguments)

    $options = Get-PlanArguments -Arguments $Arguments

    if ([string]::IsNullOrWhiteSpace($options.slug)) { throw '--slug is required' }
    if ([string]::IsNullOrWhiteSpace($options.branch)) { throw '--branch is required' }
    if ([string]::IsNullOrWhiteSpace($options.buildnum)) { throw '--buildnum is required' }
    if ($options.buildnum -notmatch '^[0-9]+$') { throw '--buildnum must contain digits only' }

    if ($options.branch -notin @('dev', 'qa', 'main')) {
        throw "unsupported branch: $($options.branch)"
    }

    if ($options.bump -notin @('Auto', 'Major', 'Minor', 'Patch', '')) {
        throw "unsupported bump type: $($options.bump)"
    }

    # Find service.
    $services = @(Get-ServiceMatrix)
    $service = $services | Where-Object { $_.slug -eq $options.slug } | Select-Object -First 1
    if ($null -eq $service) {
        throw "unknown service slug: $($options.slug)"
    }

    $csproj = if ($null -ne $service.csproj) { [string]$service.csproj } else { '' }
    $servicePath = if ($null -ne $service.path -and -not [string]::IsNullOrWhiteSpace([string]$service.path)) {
        [string]$service.path
    }
    elseif ($null -ne $service.dir) {
        [string]$service.dir
    }
    else {
        ''
    }
    $explicitDeps = if ($null -ne $service.depends_on) { @($service.depends_on) } else { @() }

    # Resolve complete transitive dependency graph.
    Reset-Dependencies

    if (-not [string]::IsNullOrWhiteSpace($csproj)) {
        Resolve-Dependencies -Project $csproj
    }
    elseif (-not [string]::IsNullOrWhiteSpace($servicePath)) {
        Add-DependencyDirectory -Directory $servicePath
    }

    foreach ($depPath in $explicitDeps) {
        if (-not [string]::IsNullOrWhiteSpace([string]$depPath)) {
            Add-DependencyDirectory -Directory ([string]$depPath)
        }
    }

    if ($script:DepDirs.Count -eq 0) {
        throw "no dependency paths resolved for service: $($options.slug)"
    }

    $depDirs = @($script:DepDirs | Sort-Object -Unique)

    # Establish canonical release baseline.
    $baseTag = Get-LastReleaseTag -Slug $options.slug
    $firstRelease = [string]::IsNullOrWhiteSpace($baseTag)

    if (-not $firstRelease) {
        $coreText = $baseTag.Substring("$($options.slug)/v".Length)
        $parts = $coreText.Split('.')
        $baseMajor = [int]$parts[0]
        $baseMinor = [int]$parts[1]
        $basePatch = [int]$parts[2]
    }
    else {
        $baseMajor = 0
        $baseMinor = 0
        $basePatch = 0
    }

    $baseCore = "$baseMajor.$baseMinor.$basePatch"
    $floorCore = $baseCore
    $upstreamFloor = Get-UpstreamFloorCoreVersion -Slug $options.slug -Branch $options.branch

    if (-not [string]::IsNullOrWhiteSpace($upstreamFloor) -and
        (Compare-CoreVersions -Left $upstreamFloor -Right $floorCore) -gt 0) {
        $floorCore = $upstreamFloor
    }

    # Detect whether the service is affected by this workflow run.
    $changeRange = ''
    $changedPaths = @()
    $pendingTag = "pending/$($options.branch)/$($options.slug)"
    $pendingBuild = if (Test-GitRevision -Revision $pendingTag) { 1 } else { 0 }

    if (-not $firstRelease) {
        $validSince = -not [string]::IsNullOrWhiteSpace($options.since) -and
            $options.since -ne '0000000000000000000000000000000000000000' -and
            (Test-GitObject -Object "$($options.since)^{commit}")

        if ($validSince) {
            $changeRange = "$($options.since)..HEAD"
        }
        else {
            $changeRange = "$baseTag..HEAD"
        }

        $diffArgs = @('diff', '--name-only', $changeRange, '--') + $depDirs
        $changedPaths = @(Invoke-Git -Arguments $diffArgs -AllowFailure | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    }
    else {
        $changeRange = 'initial-release'
    }

    # Protect main reruns.
    $alreadyReleasedAtHead = $false
    if (-not [string]::IsNullOrWhiteSpace($baseTag)) {
        $baseCommitLines = @(Invoke-Git -Arguments @('rev-parse', "${baseTag}^{commit}"))
        $headCommitLines = @(Invoke-Git -Arguments @('rev-parse', 'HEAD'))
        $alreadyReleasedAtHead = ([string]$baseCommitLines[0] -eq [string]$headCommitLines[0])
    }

    # Determine affected state.
    $envTag = Get-LastEnvironmentTag -Slug $options.slug -Branch $options.branch
    $envFirstBuild = [string]::IsNullOrWhiteSpace($envTag)
    $affected = $false

    if ($options.force) {
        $affected = $true
    }
    elseif ($firstRelease) {
        $affected = $true
    }
    elseif ($envFirstBuild) {
        $affected = $true
    }
    elseif ($options.branch -eq 'main' -and $alreadyReleasedAtHead) {
        $affected = $false
    }
    elseif ($pendingBuild -eq 1) {
        $affected = $true
    }
    elseif ($changedPaths.Count -gt 0) {
        $affected = $true
    }

    # Determine SemVer bump from all unreleased changes since canonical release.
    $versionRange = if (-not [string]::IsNullOrWhiteSpace($baseTag)) { "$baseTag..HEAD" } else { 'HEAD' }

    if ($options.bump -ne 'Auto' -and -not [string]::IsNullOrWhiteSpace($options.bump)) {
        $bump = $options.bump.ToLowerInvariant()
    }
    else {
        $records = @(Get-CommitRecords -Range $versionRange -Paths $depDirs)
        $bump = Get-BumpFromCommits -CommitRecords $records
        if ([string]::IsNullOrWhiteSpace($bump)) {
            $bump = 'minor'
        }
    }

    # Calculate next version.
    $nextMajor = $baseMajor
    $nextMinor = $baseMinor
    $nextPatch = $basePatch

    if ($affected) {
        $next = Apply-VersionBump -Major $baseMajor -Minor $baseMinor -Patch $basePatch -Bump $bump
        $nextMajor = [int]$next[0]
        $nextMinor = [int]$next[1]
        $nextPatch = [int]$next[2]

        $nextCore = "$nextMajor.$nextMinor.$nextPatch"
        if ((Compare-CoreVersions -Left $nextCore -Right $floorCore) -lt 0) {
            $floorParts = $floorCore.Split('.')
            $nextMajor = [int]$floorParts[0]
            $nextMinor = [int]$floorParts[1]
            $nextPatch = [int]$floorParts[2]
        }
    }

    $coreVersion = "$nextMajor.$nextMinor.$nextPatch"

    # DEV and QA use the current workflow build number.
    # PROD promotes the build metadata from the matching QA release candidate.
    $effectiveBuildNumber = [string]$options.buildnum
    $promotedFromTag = ''

    if ($options.branch -eq 'main') {
        $qaBuildNumber = Get-QaPromotionBuildNumber -Slug $options.slug -CoreVersion $coreVersion

        if (-not [string]::IsNullOrWhiteSpace($qaBuildNumber)) {
            $effectiveBuildNumber = $qaBuildNumber
            $promotedFromTag = "$($options.slug)/v$coreVersion-rc+$qaBuildNumber"
        }
        elseif ($affected) {
            throw "cannot promote $($options.slug) v$coreVersion to main: no matching QA tag '$($options.slug)/v$coreVersion-rc+<build>' was found"
        }
    }

    $fullVersion = Format-Version `
        -Major $nextMajor `
        -Minor $nextMinor `
        -Patch $nextPatch `
        -Branch $options.branch `
        -BuildNumber $effectiveBuildNumber

    $imageVersion = ConvertTo-DockerImageVersion -Version $fullVersion

    # Output suitable for GITHUB_OUTPUT.
    Write-Output "slug=$($options.slug)"
    Write-Output "affected=$($affected.ToString().ToLowerInvariant())"
    Write-Output "bump=$bump"
    Write-Output "base_version=$baseMajor.$baseMinor.$basePatch"
    Write-Output "core_version=$coreVersion"
    Write-Output "build_number=$effectiveBuildNumber"
    Write-Output "version=$fullVersion"
    Write-Output "image_version=$imageVersion"
    Write-Output "release_tag=$($options.slug)/v$coreVersion"
    Write-Output "build_tag=$($options.slug)/v$fullVersion"
    Write-Output "promoted_from_tag=$promotedFromTag"
    Write-Output "pending_tag=$pendingTag"
    Write-Output "pending_build=$pendingBuild"
    Write-Output "dep_dirs=$(($depDirs -join ' ') + ' ')"
    Write-Output "change_range=$changeRange"
}

# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

try {
    if ($args.Count -eq 0) {
        throw "usage: $($MyInvocation.MyCommand.Name) {matrix|plan} [args]"
    }

    $command = [string]$args[0]
    $remaining = if ($args.Count -gt 1) { @($args[1..($args.Count - 1)]) } else { @() }

    switch ($command) {
        'matrix' {
            Write-Matrix
        }
        'plan' {
            Write-Plan -Arguments $remaining
        }
        default {
            throw "usage: $($MyInvocation.MyCommand.Name) {matrix|plan} [args]"
        }
    }
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
