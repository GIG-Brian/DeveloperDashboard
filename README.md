# Deployment Dashboard — Azure DevOps Extension

Shows the latest deployed pipeline run per environment across all pipelines,
as a native hub page inside **Pipelines** in Azure DevOps Services.

---

## How it works

Extension static files (HTML, CSS, JS bundle) are hosted on **GitHub Pages**.
The `.vsix` manifest points Azure DevOps at your Pages URL via `baseUri`, which
means the extension iframe is served from your GitHub Pages origin — allowing
CORS-free calls to `dev.azure.com`.

---

## One-time setup

### 1 — Fork / create this repo on GitHub

The repo must be public for the free GitHub Pages tier, or private with a
GitHub Pro/Teams plan.

### 2 — Enable GitHub Pages

Go to **Settings → Pages** in your repo:
- Source: **GitHub Actions** (not a branch)

### 3 — Update `vss-extension.json`

Replace the two placeholders:

```json
"publisher": "YOUR-PUBLISHER-ID",
"baseUri":   "https://YOUR-GITHUB-ORG.github.io/YOUR-REPO-NAME"
```

If your repo is `https://github.com/acme/dashboard-extension`, then:
```json
"baseUri": "https://acme.github.io/dashboard-extension"
```

### 4 — Create a Marketplace publisher (if you don't have one)

Go to https://marketplace.visualstudio.com/manage and create a publisher.
The ID must match what you put in `vss-extension.json`.

### 5 — Push to main

The **Deploy to GitHub Pages** workflow runs automatically on every push to
`main`. It builds the webpack bundle and publishes the static files to Pages.

Wait for the Pages deployment to complete (check the Actions tab), then verify
your Pages URL serves `dashboard.html` correctly before installing the extension.

### 6 — Package and publish the .vsix

Run the **Publish Extension** workflow manually from the Actions tab, or push a
version tag (`git tag v1.0.0 && git push --tags`).

This produces the `.vsix`. You can either:
- Let the workflow auto-publish (add a `MARKETPLACE_TOKEN` secret — a PAT with
  **Marketplace → Publish** scope)
- Download the `.vsix` artifact and upload it manually at
  https://marketplace.visualstudio.com/manage

### 7 — Install in your organisation

In Azure DevOps: **Organisation settings → Extensions → Browse Marketplace**,
find your private extension, and install it.

---

## Updating the extension

For **content changes** (UI, logic): just push to `main`. GitHub Pages updates
automatically. No need to re-publish the `.vsix`.

For **manifest changes** (scopes, contribution points): bump `version` in
`vss-extension.json`, push, then re-run the Publish workflow and update the
installed extension in Azure DevOps.

---

## Requirements for data to appear

Your YAML pipelines must use `deployment:` jobs targeting named environments:

```yaml
jobs:
  - deployment: DeployMyApp
    environment: 'production'
    strategy:
      runOnce:
        deploy:
          steps:
            - script: echo deploying...
```

Regular `job:` steps are not tracked by the Environments API.
