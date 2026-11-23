# Contributing

## Branch model and ownership

- `main`: stable, demo-ready scaffold/releases; changes only through PRs from `develop`.
- `develop`: integration branch; feature branches merge here through PRs.
- `feature/lennx`: Developer 2, backend/AI/integrations (branch brief also spells this `feature/lennox`; see setup note below).
- `feature/steve`: Developer 1, frontend/simulation experience.

The task brief uses both `feature/lennox` and `feature/lennx`. The requested final first-steps note names `feature/lennx`; use `feature/lennx` unless the team confirms the longer spelling before the first push.

Protect `main` and `develop`: PR required, at least one approving review, required status checks `backend`, `frontend`, and `secret-scan`, branch must be up to date, and force pushes/deletions disabled. These exact GitHub CLI commands apply the rules when `gh` has admin access (edit owner/repo if the remote differs):

```sh
gh api --method PUT repos/Mihon-Community/MtaaLab/branches/main/protection \
  -F 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=backend' \
  -f 'required_status_checks[contexts][]=frontend' \
  -f 'required_status_checks[contexts][]=secret-scan' \
  -F 'enforce_admins=true' -F 'required_pull_request_reviews[required_approving_review_count]=1' \
  -F 'restrictions=null' -F 'allow_force_pushes=false' -F 'allow_deletions=false'
gh api --method PUT repos/Mihon-Community/MtaaLab/branches/develop/protection \
  -F 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=backend' \
  -f 'required_status_checks[contexts][]=frontend' \
  -f 'required_status_checks[contexts][]=secret-scan' \
  -F 'enforce_admins=true' -F 'required_pull_request_reviews[required_approving_review_count]=1' \
  -F 'restrictions=null' -F 'allow_force_pushes=false' -F 'allow_deletions=false'
```

If `gh auth status` lacks admin scope, repository admin must apply these settings manually. Keep `docker` optional and do not require it for branch protection.

## Daily workflow

1. `git pull origin develop` while on your feature branch (or fetch and rebase your own unshared work).
2. Work only on your feature branch; keep commits focused.
3. Run the checks listed in the relevant guide and CI workflow.
4. `git push -u origin feature/<name>` and open a PR into `develop`.
5. Require green CI and teammate review; squash merge.
6. Before demo/release, open a PR from `develop` into `main`; never push directly to `main` or `develop`.

Use Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`. Never commit `.env`, keys, learner data, or real phone numbers. If a secret is exposed, rotate it and follow the security guide.

## Conflicts

Fetch `origin/develop`, bring it into your feature branch, resolve conflicts locally, run checks, then push the feature branch. For shared conflicts, coordinate with the other developer before choosing a behavior. Do not rewrite remote history or force-push.

## Pull request rules

Use the PR template. Contract changes in `docs/API_CONTRACT.md` require both developers to review. Database changes require migration and RLS review. Do not merge until CI is green and acceptance IDs are recorded.
