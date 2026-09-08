# Run from the repository root. Nx supplies impact; Git supplies direct SemVer changes.
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Project,
    [Parameter(Mandatory)] [string] $ProjectFile,
    [Parameter(Mandatory)] [ValidateSet('dev', 'qa', 'main')] [string] $Branch,
    [Parameter(Mandatory)] [string] $Base,
    [Parameter(Mandatory)] [string] $Head,
    [switch] $Affected,
    # Optional explicit dependency impact, including when own files also changed.
    [switch] $DependencyChanged,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Git {
    param([string[]] $Arguments)
    $result = @(& git @Arguments)
    if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed ($LASTEXITCODE)." }
    return $result
}

$repo = (Invoke-Git @('rev-parse', '--show-toplevel'))[0]
$file = (Resolve-Path -LiteralPath $ProjectFile).Path
$relative = [IO.Path]::GetRelativePath($repo, $file).Replace('\', '/')
if ($relative.StartsWith('../') -or [IO.Path]::IsPathRooted($relative)) {
    throw 'ProjectFile must be inside the repository.'
}
$projectRoot = $relative.Substring(0, $relative.LastIndexOf('/'))
$pathspec = ":(top,literal)$projectRoot"
$headSha = (Invoke-Git @('rev-parse', '--verify', "$Head^{commit}"))[0]
# Base may be the empty tree for the first push.
$null = Invoke-Git @('rev-parse', '--verify', "$Base^{tree}")
$changed = @(Invoke-Git @('diff', '--name-only', $Base, $headSha, '--', $pathspec))
$directlyChanged = $changed.Count -gt 0
# Affected without own changes is treated as dependency/shared-input impact.
$dependencyImpact = $DependencyChanged -or ($Affected -and -not $directlyChanged)

# Ignore tags from unmerged branches; SemVer ordering puts a stable version above
# prereleases of the same core (git's version sort does not reliably do that).
$semver = '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(beta|rc)\.(0|[1-9]\d*))?(?:\+[0-9A-Za-z.-]+)?$'
$tags = @(foreach ($tag in (Invoke-Git @('tag', '--merged', 'HEAD', '--list', "$Project@*"))) {
    $value = $tag.Substring($Project.Length + 1)
    $m = [regex]::Match($value, $semver)
    if ($m.Success) {
        [pscustomobject]@{
            Tag = $tag; Value = $value
            Major = [long]$m.Groups[1].Value; Minor = [long]$m.Groups[2].Value
            Patch = [long]$m.Groups[3].Value
            Channel = switch ($m.Groups[4].Value) { 'beta' { 0 }; 'rc' { 1 }; default { 2 } }
            Counter = if ($m.Groups[5].Success) { [long]$m.Groups[5].Value } else { 0 }
        }
    }
})
$tags = @($tags | Sort-Object Major, Minor, Patch, Channel, Counter -Descending)
$lastTag = if ($tags.Count) { $tags[0].Tag } else { $null }
$content = [IO.File]::ReadAllText($file)
$xml = [xml]$content
$versionNodes = @($xml.SelectNodes('/*[local-name()="Project"]/*[local-name()="PropertyGroup"]/*[local-name()="Version"]'))
if ($versionNodes.Count -gt 1) { throw 'Multiple Version properties require an explicit versioning policy.' }
$current = if ($lastTag) { $tags[0].Value } elseif ($versionNodes.Count) { $versionNodes[0].InnerText } else { '0.1.0' }
$m = [regex]::Match($current, $semver)
if (-not $m.Success) { throw "Unsupported version '$current'; expected x.y.z, x.y.z-beta.N or x.y.z-rc.N." }
$parts = @([long]$m.Groups[1].Value, [long]$m.Groups[2].Value, [long]$m.Groups[3].Value)
$oldPreid = $m.Groups[4].Value
$preid = switch ($Branch) { 'dev' { 'beta' }; 'qa' { 'rc' }; 'main' { '' } }
$promoting = $oldPreid -and ($preid -ne $oldPreid)
if ($oldPreid -eq 'rc' -and $preid -eq 'beta') { throw 'Refusing to move an rc release back to beta.' }

# A rerun at the original event SHA must not create another dependency patch.
if ($lastTag) {
    & git merge-base --is-ancestor $headSha $lastTag
    $covered = $LASTEXITCODE
    if ($covered -gt 1) { throw 'Unable to compare the event head and release tag.' }
    if ($covered -eq 0 -and -not $promoting) {
        Write-Host "Already released $Project through $headSha."
        return
    }
}

# Scan unreleased project commits even if the current event changed only a dependency.
$range = if ($lastTag) { "$lastTag..$headSha" } else { $headSha }
$messages = (Invoke-Git @('log', $range, '--format=%s%n%b%x1e', '--', $pathspec)) -join "`n"
$bump = 'none'
foreach ($message in ($messages -split [char]30)) {
    $message = $message.Trim()
    if (-not $message) { continue }
    $subject = ($message -split "`n", 2)[0]
    if ($subject -cmatch '^[a-zA-Z]+(?:\([^\r\n)]+\))?!:\s' -or
        $message -cmatch '(?m)^BREAKING[ -]CHANGE:\s') { $bump = 'major'; break }
    if ($subject -cmatch '^feat(?:\([^\r\n)]+\))?:\s') { $bump = 'minor' }
    elseif ($subject -cmatch '^fix(?:\([^\r\n)]+\))?:\s' -and $bump -eq 'none') { $bump = 'patch' }
}
if ($bump -eq 'none' -and $dependencyImpact) { $bump = 'patch' }
if ($bump -eq 'none' -and -not $promoting) {
    Write-Host "No releasable changes for $Project."
    return
}

# Continue an existing prerelease core unless the requested bump exceeds it.
# Promotion beta -> rc -> stable does not add an extra patch.
switch ($bump) {
    'major' {
        if (-not $oldPreid -or $parts[1] -ne 0 -or $parts[2] -ne 0 -or $parts[0] -eq 0) {
            $parts[0]++; $parts[1] = 0; $parts[2] = 0
        }
    }
    'minor' {
        if (-not $oldPreid -or $parts[2] -ne 0) { $parts[1]++; $parts[2] = 0 }
    }
    'patch' { if (-not $oldPreid) { $parts[2]++ } }
}
$core = $parts -join '.'
$version = $core
if ($preid) {
    $counter = if ($oldPreid -eq $preid -and $core -eq ($current -split '[-+]')[0]) {
        [long]$m.Groups[5].Value + 1
    } else { 0 }
    $version = "$core-$preid.$counter"
}
$tag = "$Project@$version"
Write-Host "$Project : $current -> $version (direct=$directlyChanged, dependency=$dependencyImpact, bump=$bump)"
if ($DryRun) { return }
$existing = @(Invoke-Git @('tag', '--list', $tag))
if ($existing.Count) { throw "Tag $tag already exists; refusing to overwrite it." }
if (@(Invoke-Git @('diff', '--cached', '--name-only')).Count) { throw 'Index must be clean before versioning.' }
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
if ($versionNodes.Count) {
    $content = [regex]::new('<Version>[^<]*</Version>').Replace($content, "<Version>$version</Version>", 1)
} else {
    $group = [regex]::Match($content, '(?m)^(?<indent>\s*)<PropertyGroup\s*>')
    if (-not $group.Success) { throw 'No unconditional PropertyGroup available for Version.' }
    $position = $group.Index + $group.Length
    $content = $content.Insert($position, "$newline$($group.Groups['indent'].Value)  <Version>$version</Version>")
}
$null = [xml]$content
[IO.File]::WriteAllText($file, $content, [Text.UTF8Encoding]::new($false))
$null = Invoke-Git @('add', '--', $relative)
# --allow-empty supports tagging a disk version already matching a promotion.
$null = Invoke-Git @('commit', '--allow-empty', '-m', "chore($Project): release $version")
$null = Invoke-Git @('tag', '-a', $tag, '-m', $tag)
Write-Host "Released $tag"
