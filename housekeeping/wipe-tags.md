# Wipe tags

Delete all remote tags from `origin`:

```powershell
git ls-remote --tags --refs origin | % { ($_ -split "`t")[1] -replace '^refs/tags/', '' } | % { git push origin --delete $_ }
```

Delete all local tags:

```powershell
git tag -l | % { git tag -d $_ }
```

Delete all remote and local tags:

```powershell
$remoteTags = git ls-remote --tags --refs origin | % { ($_ -split "`t")[1] -replace '^refs/tags/', '' }; $localTags = git tag -l; $remoteTags | % { git push origin --delete $_ }; $localTags | % { git tag -d $_ }
```

Preview remote tags:

```powershell
git ls-remote --tags --refs origin | % { ($_ -split "`t")[1] -replace '^refs/tags/', '' }
```

Preview local tags:

```powershell
git tag -l
```
