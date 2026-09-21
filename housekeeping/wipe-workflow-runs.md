# Wipe workflow runs

Delete all workflow runs from the current GitHub repository:

```powershell
gh run list --limit 10000 --json databaseId --jq '.[].databaseId' | % { gh run delete $_ }
```
