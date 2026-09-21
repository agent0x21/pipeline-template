# Wipe releases

Delete all GitHub Releases while keeping their Git tags:

```powershell
gh release list --limit 10000 --json tagName --jq '.[].tagName' | % { gh release delete $_ --yes }
```

Delete all GitHub Releases and their associated Git tags:

```powershell
gh release list --limit 10000 --json tagName --jq '.[].tagName' | % { gh release delete $_ --yes --cleanup-tag }
```

Preview releases:

```powershell
gh release list --limit 10000
```
