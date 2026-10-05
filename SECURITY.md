# Security

## Credentials

Never commit Azure DevOps PATs, AI keys, resume data, work-item exports, or private screenshots.

Use a short-lived PAT with the minimum permissions required. Revoke a token immediately if it is exposed.

## Local gateway

QA Copilot sends work-item content to the local gateway configured at `http://localhost:4141`. Verify that the gateway is trusted and understand how it handles request logs before using confidential data.

## Reporting an issue

Do not include credentials or private work-item content in a public issue. Redact sensitive details and report security concerns privately to the repository maintainer.
