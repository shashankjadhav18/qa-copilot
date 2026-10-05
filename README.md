# QA Copilot

QA Copilot is a Chrome extension that uses a local AI gateway to support Azure DevOps QA workflows.

## Features

- **Bug -> Test Case**: read an Azure DevOps bug, generate structured test steps, create an ADO Test Case, and link it to the bug.
- **Feature -> Test Scope**: generate functional, negative, boundary, regression, open-question, and exit-criteria coverage.
- **Feature -> Bug Hunt**: generate review-only potential UI and workflow findings.
- **Persistent run tab**: keep progress and generated results visible after the extension popup closes.
- **Gateway health check**: show whether the local AI gateway is available before running analysis.

Feature workflows are review-only. They do not create bugs or update feature work items automatically.

## Requirements

- Google Chrome with Manifest V3 support.
- Access to an Azure DevOps organization for the bug-to-test-case workflow.
- A local OpenAI-compatible gateway at:

```text
http://localhost:4141
```

The gateway must provide `/v1/models` and `/v1/chat/completions`.

## Install locally

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the repository folder.

## Configuration

Open the extension popup and enter the Azure DevOps organization, project, and PAT when using **Bug -> Test Case**.

The PAT is stored in Chrome local extension storage and is never committed by this repository. Use a token with the minimum permissions required to create and link Test Cases.

The extension can also detect organization and project names from the active Azure DevOps URL.

## Work-item workflows

### Bug -> Test Case

Open an Azure DevOps bug, select the workflow, and choose **Generate & Link**. The extension creates a Test Case through the Azure DevOps Work Item REST API.

### Feature -> Test Scope

Open an Azure DevOps feature, select **Feature -> Test Scope**, and choose **Generate Preview**. The output is shown in the persistent QA Copilot Run tab.

### Feature -> Bug Hunt

Open an Azure DevOps feature, select **Feature -> Bug Hunt**, and choose **Find Potential Bugs**. Findings are suggestions for manual review, not confirmed defects.

## Privacy and limitations

- AI requests are sent to the configured local gateway.
- Do not paste confidential work-item data into an untrusted gateway.
- The extension does not automatically create bugs from Bug Hunt findings.
- The extension does not claim that generated tests passed.
- Review all generated test cases, comments, and findings before using them.

## Customizing ADO paths

The public version leaves the test-case area mapping empty and uses the configured project as the default iteration path. Customize the constants in `background.js` if your organization requires specific area or iteration paths.

## License

MIT. See `LICENSE`.
