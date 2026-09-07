param(
    [Parameter(Mandatory)] [string] $Project,
    [Parameter(Mandatory)] [string] $ProjectFile,
    [Parameter(Mandatory)] [ValidateSet('dev', 'qa', 'main')] [string] $Branch
)

$ErrorActionPreference = 'Stop'

$tagPattern = "$Project@*"
$lastTag = @(git tag --list $tagPattern --sort=-v:refname | Select-Object -First 1)
$current = '0.1.0'

if ($lastTag.Count -gt 0) {
    $current = ($lastTag[0] -replace "^$([regex]::Escape($Project))@", '') -replace '-.*$', ''
} else {
    $versionMatch = Select-String -Path $ProjectFile -Pattern '<Version>([^<]+)</Version>'
    if ($versionMatch) { $current = $versionMatch.Matches[0].Groups[1].Value }
}

$parts = $current.Split('.') | ForEach-Object { [int]$_ }
$range = if ($lastTag.Count -gt 0) { "$($lastTag[0])..HEAD" } else { '' }
$commits = if ($range) { git log $range --format='%s' } else { git log --format='%s' }

if ($commits -match '^(破坏性|BREAKING CHANGE)|!:' ) {
    $parts[0]++; $parts[1] = 0; $parts[2] = 0
} elseif ($commits -match '^feat(\(.+\))?:') {
    $parts[1]++; $parts[2] = 0
} else {
    $parts[2]++
}

$baseVersion = "$($parts[0]).$($parts[1]).$($parts[2])"
$preid = switch ($Branch) {
    'dev'  { 'beta' }
    'qa'   { 'rc' }
    'main' { '' }
}
$version = switch ($Branch) {
    'dev'  { "$baseVersion-beta.0" }
    'qa'   { "$baseVersion-rc.0" }
    'main' { $baseVersion }
}
if ($preid -and $lastTag.Count -gt 0 -and $lastTag[0] -match "-$preid\.(\d+)$") {
    $version = "$baseVersion-$preid.$([int]$Matches[1] + 1)"
}

$content = [IO.File]::ReadAllText($ProjectFile)
if ($content -match '<Version>[^<]+</Version>') {
    $content = [regex]::Replace($content, '<Version>[^<]+</Version>', "<Version>$version</Version>", 1)
} else {
    $content = [regex]::Replace($content, '(</PropertyGroup>)', "  <Version>$version</Version>`n  `$1", 1)
}
[IO.File]::WriteAllText($ProjectFile, $content, [Text.UTF8Encoding]::new($false))

git add $ProjectFile
git commit -m "chore($Project): release $version"
git tag "$Project@$version"
Write-Host "Released $Project@$version"
