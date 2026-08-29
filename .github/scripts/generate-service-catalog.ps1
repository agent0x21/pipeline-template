#!/usr/bin/env pwsh
<#
.SYNOPSIS
Generate .github/service-catalog.json by inspecting a repository.

.DESCRIPTION
The generated catalog is intentionally conservative. It is meant to produce a
reviewable starting point, not to guess every build convention perfectly.

Detection rules:

- .NET service:
  - directory contains a Dockerfile
  - directory contains exactly one .csproj

- Node/React service:
  - directory contains a Dockerfile
  - directory contains package.json

Dependency detection:

- .NET:
  - follows transitive <ProjectReference Include="..."> entries

- Node:
  - if workspaces are declared in the root package.json, workspace packages
    referenced by dependencies/devDependencies/peerDependencies are added to
    depends_on

By default the script writes .github/service-catalog.json. Use --check to fail
when the generated file differs from the existing catalog.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DEFAULT_OUTPUT = '.github/service-catalog.json'
$DEFAULT_DOTNET_VERSION = '10.0.x'
$DEFAULT_NODE_VERSION = '22'

$SKIP_DIRS = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::Ordinal
)

@(
    '.git'
    '.github'
    '.vs'
    '.vscode'
    'bin'
    'obj'
    'node_modules'
    'dist'
    'build'
    'coverage'
) | ForEach-Object {
    [void]$SKIP_DIRS.Add($_)
}


function Write-Usage {
    @"
usage: $([System.IO.Path]::GetFileName($PSCommandPath)) [-h] [--root ROOT] [--output OUTPUT] [--check] [--stdout]

Generate .github/service-catalog.json from repo contents.

options:
  -h, --help       show this help message and exit
    --root ROOT      Repository root. Defaults to nearest parent containing .git.
  --output OUTPUT  Output path. Defaults to .github/service-catalog.json.
  --check          Fail if the generated catalog differs from the existing output file.
  --stdout         Print generated catalog instead of writing it.
"@
}


function Parse-Arguments {
    param(
        [string[]] $Arguments
    )

    $result = [ordered]@{
        Root   = $null
        Output = $DEFAULT_OUTPUT
        Check  = $false
        Stdout = $false
        Help   = $false
    }

    for ($i = 0; $i -lt $Arguments.Count; $i++) {
        $arg = $Arguments[$i]

        switch -Regex ($arg) {
            '^(-h|--help)$' {
                $result.Help = $true
                continue
            }

            '^--check$' {
                $result.Check = $true
                continue
            }

            '^--stdout$' {
                $result.Stdout = $true
                continue
            }

            '^--root=(.*)$' {
                $result.Root = $Matches[1]
                continue
            }

            '^--output=(.*)$' {
                $result.Output = $Matches[1]
                continue
            }

            '^--root$' {
                if ($i + 1 -ge $Arguments.Count) {
                    throw 'argument --root: expected one argument'
                }

                $i++
                $result.Root = $Arguments[$i]
                continue
            }

            '^--output$' {
                if ($i + 1 -ge $Arguments.Count) {
                    throw 'argument --output: expected one argument'
                }

                $i++
                $result.Output = $Arguments[$i]
                continue
            }

            default {
                throw "unrecognized argument: $arg"
            }
        }
    }

    return $result
}


function Resolve-DefaultRoot {
    param(
        [Parameter(Mandatory)]
        [string] $StartDirectory
    )

    $directory = [System.IO.DirectoryInfo]::new(
        [System.IO.Path]::GetFullPath($StartDirectory)
    )

    while ($null -ne $directory) {
        if (
            [System.IO.Directory]::Exists(
                [System.IO.Path]::Combine($directory.FullName, '.git')
            ) -or
            [System.IO.File]::Exists(
                [System.IO.Path]::Combine($directory.FullName, '.git')
            )
        ) {
            return $directory.FullName
        }

        $directory = $directory.Parent
    }

    return [System.IO.Path]::GetFullPath($StartDirectory)
}


function Convert-ToPosixPath {
    param(
        [Parameter(Mandatory)]
        [string] $Path
    )

    return $Path.Replace('\', '/')
}


function Get-RelativePath {
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Root
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $fullRoot = [System.IO.Path]::GetFullPath($Root)

    $relative = [System.IO.Path]::GetRelativePath($fullRoot, $fullPath)
    return Convert-ToPosixPath $relative
}


function Convert-ToSlug {
    param(
        [Parameter(Mandatory)]
        [string] $Name
    )

    $value = [regex]::Replace($Name, '^TimeClock\.', '')
    $value = $value.Replace('.', ' ')
    $value = [regex]::Replace($value, '([A-Z]+)([A-Z][a-z])', '$1 $2')
    $value = [regex]::Replace($value, '([a-z0-9])([A-Z])', '$1 $2')
    $value = [regex]::Replace($value, '[^A-Za-z0-9]+', '-')

    return $value.Trim('-').ToLowerInvariant()
}


function Get-SortedPaths {
    param(
        [Parameter(Mandatory)]
        [System.Collections.IEnumerable] $Paths
    )

    $items = [System.Collections.Generic.List[string]]::new()

    foreach ($path in $Paths) {
        if ($path -is [System.IO.FileSystemInfo]) {
            $items.Add($path.FullName)
        }
        else {
            $items.Add([string]$path)
        }
    }

    $array = $items.ToArray()
    [Array]::Sort($array, [System.StringComparer]::Ordinal)

    return $array
}


function Get-RepositoryDirectories {
    param(
        [Parameter(Mandatory)]
        [string] $Root
    )

    $results = [System.Collections.Generic.List[string]]::new()

    function Visit-Directory {
        param(
            [Parameter(Mandatory)]
            [string] $Directory
        )

        foreach ($child in [System.IO.Directory]::GetDirectories($Directory)) {
            $name = [System.IO.Path]::GetFileName($child)

            if ($SKIP_DIRS.Contains($name)) {
                continue
            }

            $results.Add($child)
            Visit-Directory $child
        }
    }

    Visit-Directory ([System.IO.Path]::GetFullPath($Root))

    $array = $results.ToArray()
    [Array]::Sort($array, [System.StringComparer]::Ordinal)

    return $array
}


function Read-JsonFile {
    param(
        [Parameter(Mandatory)]
        [string] $Path
    )

    try {
        $text = [System.IO.File]::ReadAllText(
            $Path,
            [System.Text.Encoding]::UTF8
        )

        return $text | ConvertFrom-Json -AsHashtable
    }
    catch {
        throw "invalid JSON in ${Path}: $($_.Exception.Message)"
    }
}


function Get-JsonValue {
    param(
        [Parameter(Mandatory)]
        $Object,

        [Parameter(Mandatory)]
        [string] $Name,

        $Default = $null
    )

    if ($null -eq $Object) {
        return $Default
    }

    if ($Object -is [System.Collections.IDictionary]) {
        foreach ($key in $Object.Keys) {
            if ([string]$key -ceq $Name) {
                return $Object[$key]
            }
        }

        return $Default
    }

    foreach ($property in $Object.PSObject.Properties) {
        if ($property.Name -ceq $Name) {
            return $property.Value
        }
    }

    return $Default
}


function Get-DockerContext {
    param(
        [Parameter(Mandatory)]
        [string] $Directory,

        [Parameter(Mandatory)]
        [string] $Root
    )

    $relativeDirectory = Get-RelativePath -Path $Directory -Root $Root

    if ($relativeDirectory.StartsWith('src/', [System.StringComparison]::Ordinal)) {
        return '.'
    }

    return $relativeDirectory
}


function Get-ProjectReferences {
    param(
        [Parameter(Mandatory)]
        [string] $Csproj
    )

    try {
        $xml = [xml][System.IO.File]::ReadAllText(
            $Csproj,
            [System.Text.Encoding]::UTF8
        )
    }
    catch {
        return @()
    }

    $references = [System.Collections.Generic.List[string]]::new()

    $nodes = $xml.SelectNodes('//*')

    foreach ($element in $nodes) {
        if ($element.LocalName -cne 'ProjectReference') {
            continue
        }

        $include = $element.GetAttribute('Include')

        if ([string]::IsNullOrEmpty($include) -or $include.Contains('$(')) {
            continue
        }

        $normalizedInclude = $include.Replace('\', '/')
        $projectDirectory = [System.IO.Path]::GetDirectoryName($Csproj)

        $refPath = [System.IO.Path]::GetFullPath(
            [System.IO.Path]::Combine(
                $projectDirectory,
                $normalizedInclude
            )
        )

        if ([System.IO.File]::Exists($refPath)) {
            $references.Add($refPath)
        }
    }

    return $references.ToArray()
}


function Test-IsUnderRoot {
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Root
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $fullRoot = [System.IO.Path]::GetFullPath($Root)

    $relative = [System.IO.Path]::GetRelativePath($fullRoot, $fullPath)

    if ([System.IO.Path]::IsPathRooted($relative)) {
        return $false
    }

    if ($relative -eq '..') {
        return $false
    }

    if (
        $relative.StartsWith(
            "../",
            [System.StringComparison]::Ordinal
        ) -or
        $relative.StartsWith(
            "..\",
            [System.StringComparison]::Ordinal
        )
    ) {
        return $false
    }

    return $true
}


function Get-DotNetDependencyDirectories {
    param(
        [Parameter(Mandatory)]
        [string] $Csproj,

        [Parameter(Mandatory)]
        [string] $Root,

        [System.Collections.Generic.HashSet[string]] $Seen
    )

    if ($null -eq $Seen) {
        $Seen = [System.Collections.Generic.HashSet[string]]::new(
            [System.StringComparer]::Ordinal
        )
    }

    $csprojFull = [System.IO.Path]::GetFullPath($Csproj)

    if ($Seen.Contains($csprojFull)) {
        return [System.Collections.Generic.HashSet[string]]::new(
            [System.StringComparer]::Ordinal
        )
    }

    [void]$Seen.Add($csprojFull)

    $dependencies = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::Ordinal
    )

    $projectDirectory = [System.IO.Path]::GetDirectoryName($csprojFull)

    [void]$dependencies.Add(
        (Get-RelativePath -Path $projectDirectory -Root $Root)
    )

    foreach ($refProject in Get-ProjectReferences -Csproj $csprojFull) {
        if (-not (Test-IsUnderRoot -Path $refProject -Root $Root)) {
            continue
        }

        $nested = Get-DotNetDependencyDirectories `
            -Csproj $refProject `
            -Root $Root `
            -Seen $Seen

        foreach ($item in $nested) {
            [void]$dependencies.Add($item)
        }
    }

    return $dependencies
}


function Get-WorkspacePatterns {
    param(
        [Parameter(Mandatory)]
        $RootPackage
    )

    $workspaces = Get-JsonValue `
        -Object $RootPackage `
        -Name 'workspaces' `
        -Default @()

    if ($workspaces -is [System.Collections.IDictionary]) {
        $workspaces = Get-JsonValue `
            -Object $workspaces `
            -Name 'packages' `
            -Default @()
    }

    $result = [System.Collections.Generic.List[string]]::new()

    if ($workspaces -is [string]) {
        $result.Add($workspaces)
        return $result.ToArray()
    }

    if ($workspaces -is [System.Collections.IEnumerable]) {
        foreach ($pattern in $workspaces) {
            if ($pattern -is [string]) {
                $result.Add($pattern)
            }
        }
    }

    return $result.ToArray()
}


function Convert-GlobToRegex {
    param(
        [Parameter(Mandatory)]
        [string] $Pattern
    )

    $pattern = Convert-ToPosixPath $Pattern

    $builder = [System.Text.StringBuilder]::new()
    [void]$builder.Append('^')

    $i = 0

    while ($i -lt $pattern.Length) {
        $char = $pattern[$i]

        if ($char -eq '*') {
            if (
                $i + 1 -lt $pattern.Length -and
                $pattern[$i + 1] -eq '*'
            ) {
                $i += 2

                if (
                    $i -lt $pattern.Length -and
                    $pattern[$i] -eq '/'
                ) {
                    [void]$builder.Append('(?:.*/)?')
                    $i++
                }
                else {
                    [void]$builder.Append('.*')
                }

                continue
            }

            [void]$builder.Append('[^/]*')
            $i++
            continue
        }

        if ($char -eq '?') {
            [void]$builder.Append('[^/]')
            $i++
            continue
        }

        [void]$builder.Append([regex]::Escape([string]$char))
        $i++
    }

    [void]$builder.Append('$')

    return $builder.ToString()
}


function Test-GlobMatch {
    param(
        [Parameter(Mandatory)]
        [string] $RelativePath,

        [Parameter(Mandatory)]
        [string] $Pattern
    )

    $relativePath = Convert-ToPosixPath $RelativePath
    $regex = Convert-GlobToRegex $Pattern

    return [regex]::IsMatch(
        $relativePath,
        $regex,
        [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
    )
}


function Get-WorkspacePackageDirectories {
    param(
        [Parameter(Mandatory)]
        [string] $Root
    )

    $packages = [System.Collections.Generic.Dictionary[string, string]]::new(
        [System.StringComparer]::Ordinal
    )

    $packageJson = [System.IO.Path]::Combine($Root, 'package.json')

    if (-not [System.IO.File]::Exists($packageJson)) {
        return $packages
    }

    $package = Read-JsonFile $packageJson
    $patterns = @(Get-WorkspacePatterns $package)

    if ($patterns.Count -eq 0) {
        return $packages
    }

    $candidateDirectories = @($Root) + @(Get-RepositoryDirectories $Root)

    foreach ($pattern in $patterns) {
        foreach ($candidate in $candidateDirectories) {
            $relative = Get-RelativePath -Path $candidate -Root $Root

            # pathlib's root.glob(pattern) does not regard "." as matching
            # an arbitrary package pattern.
            if ($relative -eq '.') {
                continue
            }

            if (-not (Test-GlobMatch -RelativePath $relative -Pattern $pattern)) {
                continue
            }

            $packageFile = [System.IO.Path]::Combine(
                $candidate,
                'package.json'
            )

            if (-not [System.IO.File]::Exists($packageFile)) {
                continue
            }

            $workspacePackage = Read-JsonFile $packageFile
            $name = Get-JsonValue `
                -Object $workspacePackage `
                -Name 'name'

            if ($name -is [string] -and $name.Length -gt 0) {
                $packages[$name] = $relative
            }
        }
    }

    return $packages
}


function Get-NodeDependencies {
    param(
        [Parameter(Mandatory)]
        [string] $PackageFile,

        [Parameter(Mandatory)]
        [string] $Root,

        [Parameter(Mandatory)]
        [System.Collections.Generic.Dictionary[string, string]] $Workspaces
    )

    $package = Read-JsonFile $PackageFile

    $dependencies = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::Ordinal
    )

    [void]$dependencies.Add(
        (Get-RelativePath `
            -Path ([System.IO.Path]::GetDirectoryName($PackageFile)) `
            -Root $Root)
    )

    foreach ($section in @(
        'dependencies'
        'devDependencies'
        'peerDependencies'
    )) {
        $values = Get-JsonValue `
            -Object $package `
            -Name $section `
            -Default $null

        if ($values -isnot [System.Collections.IDictionary]) {
            continue
        }

        foreach ($packageName in $values.Keys) {
            $workspacePath = $null

            if ($Workspaces.TryGetValue([string]$packageName, [ref]$workspacePath)) {
                [void]$dependencies.Add($workspacePath)
            }
        }
    }

    $result = @($dependencies)
    [Array]::Sort($result, [System.StringComparer]::Ordinal)

    return $result
}


function Find-Services {
    param(
        [Parameter(Mandatory)]
        [string] $Root
    )

    $services = [System.Collections.Generic.List[object]]::new()

    $seenSlugs = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::Ordinal
    )

    $workspaces = Get-WorkspacePackageDirectories $Root

    foreach ($directory in Get-RepositoryDirectories $Root) {
        $dockerfile = [System.IO.Path]::Combine(
            $directory,
            'Dockerfile'
        )

        if (-not [System.IO.File]::Exists($dockerfile)) {
            continue
        }

        $csprojs = @(
            [System.IO.Directory]::GetFiles(
                $directory,
                '*.csproj',
                [System.IO.SearchOption]::TopDirectoryOnly
            )
        )

        [Array]::Sort($csprojs, [System.StringComparer]::Ordinal)

        $packageFile = [System.IO.Path]::Combine(
            $directory,
            'package.json'
        )

        if ($csprojs.Count -eq 1) {
            $csproj = $csprojs[0]
            $name = [System.IO.Path]::GetFileNameWithoutExtension($csproj)
            $slug = Convert-ToSlug $name

            $dependencySet = Get-DotNetDependencyDirectories `
                -Csproj $csproj `
                -Root $Root

            $dependsOn = @($dependencySet)
            [Array]::Sort(
                $dependsOn,
                [System.StringComparer]::Ordinal
            )

            $service = [ordered]@{
                slug           = $slug
                name           = $name
                type           = 'dotnet'
                path           = Get-RelativePath -Path $directory -Root $Root
                project        = Get-RelativePath -Path $csproj -Root $Root
                dockerfile     = Get-RelativePath -Path $dockerfile -Root $Root
                docker_context = Get-DockerContext -Directory $directory -Root $Root
                dotnet_version = $DEFAULT_DOTNET_VERSION
                depends_on     = @($dependsOn)
            }
        }
        elseif ([System.IO.File]::Exists($packageFile)) {
            $package = Read-JsonFile $packageFile

            $packageName = Get-JsonValue `
                -Object $package `
                -Name 'name'

            if (-not $packageName) {
                $packageName = [System.IO.Path]::GetFileName($directory)
            }

            $name = [string]$packageName
            $slugName = ($name -split '/')[-1]
            $slug = Convert-ToSlug $slugName

            $dependsOn = Get-NodeDependencies `
                -PackageFile $packageFile `
                -Root $Root `
                -Workspaces $workspaces

            $service = [ordered]@{
                slug            = $slug
                name            = $name
                type            = 'node'
                path            = Get-RelativePath -Path $directory -Root $Root
                dockerfile      = Get-RelativePath -Path $dockerfile -Root $Root
                docker_context  = Get-RelativePath -Path $directory -Root $Root
                node_version    = $DEFAULT_NODE_VERSION
                install_command = if (
                    [System.IO.File]::Exists(
                        [System.IO.Path]::Combine(
                            $directory,
                            'package-lock.json'
                        )
                    )
                ) {
                    'npm ci'
                }
                else {
                    'npm install'
                }
                build_command = 'npm run build'
                depends_on    = @($dependsOn)
            }

            $scripts = Get-JsonValue `
                -Object $package `
                -Name 'scripts' `
                -Default $null

            if ($scripts -is [System.Collections.IDictionary]) {
                $hasTest = $false

                foreach ($key in $scripts.Keys) {
                    if ([string]$key -ceq 'test') {
                        $hasTest = $true
                        break
                    }
                }

                if ($hasTest) {
                    $service['test_command'] = 'npm test'
                }
            }
        }
        else {
            continue
        }

        $originalSlug = $service['slug']
        $suffix = 2

        while ($seenSlugs.Contains($service['slug'])) {
            $service['slug'] = "$originalSlug-$suffix"
            $suffix++
        }

        [void]$seenSlugs.Add($service['slug'])
        $services.Add($service)
    }

    return $services.ToArray()
}


function Convert-ToCatalogJson {
    param(
        [Parameter(Mandatory)]
        $Catalog
    )

    # PowerShell 7's ConvertTo-Json uses two-space pretty-printing.
    # EscapeNonAscii most closely matches Python json.dumps()'s default
    # ensure_ascii=True behavior.
    $json = $Catalog | ConvertTo-Json `
        -Depth 100 `
        -EscapeHandling EscapeNonAscii

    # Normalize newlines so --check is deterministic across platforms,
    # matching the Python script's "\n" output.
    $json = $json -replace "`r`n", "`n"
    $json = $json -replace "`r", "`n"

    return $json.TrimEnd("`r", "`n") + "`n"
}


function Main {
    param(
        [string[]] $Arguments
    )

    try {
        $parsed = Parse-Arguments $Arguments
    }
    catch {
        [Console]::Error.WriteLine($_.Exception.Message)
        return 2
    }

    if ($parsed.Help) {
        Write-Usage
        return 0
    }

    try {
        $root = if ($parsed.Root) {
            [System.IO.Path]::GetFullPath($parsed.Root)
        }
        else {
            Resolve-DefaultRoot (Get-Location).Path
        }

        if (-not [System.IO.Directory]::Exists($root)) {
            throw "Repository root does not exist: $root"
        }

        $output = [System.IO.Path]::GetFullPath(
            [System.IO.Path]::Combine(
                $root,
                $parsed.Output
            )
        )

        $catalog = [ordered]@{
            services = @(Find-Services $root)
        }

        $rendered = Convert-ToCatalogJson $catalog

        if ($parsed.Stdout) {
            [Console]::Out.Write($rendered)
            return 0
        }

        if ($parsed.Check) {
            if (-not [System.IO.File]::Exists($output)) {
                [Console]::Error.WriteLine("$output does not exist")
                return 1
            }

            $current = [System.IO.File]::ReadAllText(
                $output,
                [System.Text.Encoding]::UTF8
            )

            if ($current -cne $rendered) {
                [Console]::Error.WriteLine("$output is out of date")
                return 1
            }

            [Console]::Out.WriteLine("$output is up to date")
            return 0
        }

        $outputDirectory = [System.IO.Path]::GetDirectoryName($output)

        if (-not [System.IO.Directory]::Exists($outputDirectory)) {
            [void][System.IO.Directory]::CreateDirectory($outputDirectory)
        }

        # Match Python's Path.write_text(..., encoding="utf-8") without
        # introducing a PowerShell/Windows UTF-8 BOM.
        $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)

        [System.IO.File]::WriteAllText(
            $output,
            $rendered,
            $utf8WithoutBom
        )

        [Console]::Out.WriteLine("wrote $output")
        [Console]::Out.WriteLine(
            "services discovered: $($catalog.services.Count)"
        )

        return 0
    }
    catch {
        [Console]::Error.WriteLine($_.Exception.Message)
        return 1
    }
}


exit (Main $args)
