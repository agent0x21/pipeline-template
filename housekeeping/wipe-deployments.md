# Wipe deployments

Delete every deployment GitHub currently allows you to delete:

```powershell
gh api --paginate "repos/{owner}/{repo}/deployments?per_page=100" --jq '.[].id' | % { gh api --method DELETE "repos/{owner}/{repo}/deployments/$_" }
```

Mark every deployment inactive, then delete all deployments:

```powershell
$d = gh api --paginate "repos/{owner}/{repo}/deployments?per_page=100" --jq '.[].id'; $d | % { gh api --method POST "repos/{owner}/{repo}/deployments/$_/statuses" -f state=inactive }; $d | % { gh api --method DELETE "repos/{owner}/{repo}/deployments/$_" }
```

Preview deployments:

```powershell
gh api --paginate "repos/{owner}/{repo}/deployments?per_page=100" --jq '.[] | [.id, .environment, .ref, .created_at] | @tsv'
```
