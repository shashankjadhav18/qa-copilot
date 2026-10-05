// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generateFeatureScope") {
    chrome.storage.local.remove("featureScopeResult");
    updateStatus("processing", "Generating feature test scope and closing comment...", 25);

    generateFeatureScope(request.featureData)
      .then(result => {
        updateStatus("success", "Feature test scope is ready for review.", 100);
        chrome.storage.local.remove('bugHuntResult');
        chrome.storage.local.set({
          featureScopeResult: {
            result,
            workItemId: request.featureData.workItemId || "",
            title: request.featureData.title || "",
            generatedAt: Date.now()
          }
        });
        notifyPopup({ action: "featureScopeResult", result });
      })
      .catch(err => {
        updateStatus("error", `Feature scope generation failed: ${err.message}`, 0);
      });

    return false;
  }

  if (request.action === "generateBugHunt") {
    chrome.storage.local.remove("bugHuntResult");
    updateStatus("processing", "Analyzing feature risks and generating potential bug findings...", 25);

    generateBugHunt(request.featureData)
      .then(result => {
        updateStatus("success", "Potential bug findings are ready for review.", 100);
        chrome.storage.local.remove('featureScopeResult');
        chrome.storage.local.set({
          bugHuntResult: {
            result,
            workItemId: request.featureData.workItemId || "",
            title: request.featureData.title || "",
            generatedAt: Date.now()
          }
        });
        notifyPopup({ action: "bugHuntResult", result });
      })
      .catch(err => {
        updateStatus("error", `Bug hunt failed: ${err.message}`, 0);
      });

    return false;
  }

  if (request.action === "processAutomation") {
    // Initialize state tracker for the popup UI progress bar
    updateStatus("processing", "Analyzing bug description with GitHub Copilot...", 15);

    runPipeline(request.config, request.bugData)
      .then(result => {
        updateStatus("success", `Successfully created Test Case #${result.id}!`, 100);
        
        // Push OS desktop toast notification on absolute completion
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'notification-icon.png',
          title: 'Automation Success',
          message: `Created Test Case #${result.id} and linked it to Bug #${request.bugData.bugId} successfully!`
        });
      })
      .catch(err => {
        updateStatus("error", `Pipeline broken: ${err.message}`, 0);

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'notification-icon-failed.png',
          title: 'Automation Failed',
          message: `Pipeline broken: ${err.message}`
        });
      });
      
    return false; // Intentionally clean close message channel sync
  }
});

// Helper function to dynamically update the shared storage state engine
function updateStatus(state, message, progress) {
  chrome.storage.local.set({
    pipelineStatus: { state, message, progress, timestamp: Date.now() }
  });
}

function notifyPopup(message) {
  const pending = chrome.runtime.sendMessage(message);
  if (pending && typeof pending.catch === "function") {
    pending.catch(err => {
      // The popup is optional; it closes when the persistent run tab opens.
      if (!String(err && err.message).includes("Receiving end does not exist")) {
        console.warn("Unable to notify popup:", err);
      }
    });
  }
}

async function fetchWithTimeout(url, options, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("The local Copilot gateway did not respond within 120 seconds.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function runPipeline(config, bugData) {
  // Step 1: Query Copilot via local standalone terminal bridge
  const testCaseJson = await generateTestStepsFromCopilot(bugData);
  
  updateStatus("processing", "Mapping Area/Iteration paths and structuring ADO payload...", 60);
  
  // Step 2: Push finalized formatted entity schema to Azure DevOps REST API
  const createdItem = await createAndLinkTestCaseInADO(config, testCaseJson, bugData);
  return createdItem;
}

async function generateTestStepsFromCopilot(bugData) {
  const url = "http://localhost:4141/v1/chat/completions";

  const cleanDescription = bugData.description ? bugData.description.substring(0, 2000) : "";

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" }, 
      messages: [
        {
          role: "system",
          content: "You are an expert QA Lead. Analyze the bug text and return a test case structure. You must return your response strictly as a single clean JSON object matching this schema layout exactly: {\"title\": \"Clean verification title\", \"steps\": [\"Step 1 text\", \"Step 2 text\"], \"expectedResult\": \"Clear description of successful verification outcome\"}"
        },
        {
          role: "user",
          content: `Bug Title: ${bugData.title}\nBug Description: ${cleanDescription}`
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GitHub Copilot Terminal Gateway error: ${response.status} - ${errText}`);
  }

  const payload = await response.json();
  const cleanJsonText = payload.choices[0].message.content.trim();
  return JSON.parse(cleanJsonText);
}

async function generateFeatureScope(featureData) {
  const url = "http://localhost:4141/v1/chat/completions";
  const cleanDescription = featureData.description
    ? featureData.description.substring(0, 6000)
    : "";
  const acceptanceCriteria = featureData.acceptanceCriteria
    ? featureData.acceptanceCriteria.substring(0, 4000)
    : "No explicit acceptance criteria were extracted.";

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert QA Lead creating a reviewable test scope for an Azure DevOps feature.
Return exactly one JSON object with these string fields:
{
  "testScope": "Markdown test scope with objective, in-scope areas, numbered validations, negative/boundary cases, regression areas, open questions, and exit criteria.",
  "closingComment": "A professional draft feature closing comment containing a Validation scope bullet list. It must clearly say this is a draft for QA review and must not claim that tests passed."
}
Rules:
- Treat explicit acceptance criteria as authoritative.
- Identify missing or ambiguous requirements under Open questions.
- Cover functional, negative, boundary, API/data, permission, compatibility, and regression validation when relevant.
- Include the key generated validations in the closing comment under a "Validation scope" heading.
- Do not invent successful test results, defect numbers, or sign-off.
- Keep the output practical and concise.`
        },
        {
          role: "user",
          content: `Feature ID: ${featureData.workItemId || "Unknown"}
Feature type: ${featureData.workItemType || "Unknown"}
Title: ${featureData.title || "Untitled feature"}
Description:
${cleanDescription}

Acceptance criteria:
${acceptanceCriteria}`
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Copilot Terminal Gateway error: ${response.status} - ${errText}`);
  }

  const payload = await response.json();
  const content = payload.choices &&
    payload.choices[0] &&
    payload.choices[0].message &&
    payload.choices[0].message.content;
  if (!content) throw new Error("Copilot returned an empty feature scope.");

  const result = JSON.parse(content.trim());
  if (!result.testScope || !result.closingComment) {
    throw new Error("Copilot returned an incomplete feature scope.");
  }
  return result;
}

async function generateBugHunt(featureData) {
  const url = "http://localhost:4141/v1/chat/completions";
  const cleanDescription = featureData.description
    ? featureData.description.substring(0, 6000)
    : "";
  const acceptanceCriteria = featureData.acceptanceCriteria
    ? featureData.acceptanceCriteria.substring(0, 4000)
    : "No explicit acceptance criteria were extracted.";

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert exploratory QA lead analyzing an Azure DevOps feature for potential UI and workflow defects.
Return exactly one JSON object:
{
  "findings": "Markdown report of potential bugs and coverage gaps",
  "bugReport": "Markdown proposed bug report for the highest-risk finding"
}
Rules:
- Do not test or discuss APIs.
- Focus on UI behavior, workflow transitions, validation, data persistence through the UI, permissions, concurrency, legacy behavior, mixed data, and regression risk.
- Each finding must include title, risk, confidence, validation steps, expected behavior, potential issue, evidence, and affected area.
- Clearly label findings as potential or unconfirmed; do not claim a bug is reproduced.
- Identify missing or ambiguous acceptance criteria separately.
- The bug report must be a draft for manual review and must not invent evidence, screenshots, or defect IDs.`
        },
        {
          role: "user",
          content: `Feature ID: ${featureData.workItemId || "Unknown"}
Feature type: ${featureData.workItemType || "Unknown"}
Title: ${featureData.title || "Untitled feature"}
Description:
${cleanDescription}

Acceptance criteria:
${acceptanceCriteria}`
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Copilot Terminal Gateway error: ${response.status} - ${errText}`);
  }

  const payload = await response.json();
  const content = payload.choices &&
    payload.choices[0] &&
    payload.choices[0].message &&
    payload.choices[0].message.content;
  if (!content) throw new Error("Copilot returned empty bug findings.");

  const normalizedContent = typeof content === "string"
    ? content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    : JSON.stringify(content);
  let parsed;
  try {
    parsed = JSON.parse(normalizedContent);
  } catch (err) {
    throw new Error("Copilot returned bug findings that were not valid JSON.");
  }

  const toText = value => {
    if (typeof value === "string") return value.trim();
    if (value === null || typeof value === "undefined") return "";
    return JSON.stringify(value, null, 2);
  };
  const findings = toText(
    parsed.findings ||
    parsed.potentialBugs ||
    parsed.bugFindings ||
    parsed.potentialFindings ||
    parsed.bugs ||
    parsed.report ||
    parsed.testFindings
  );
  const bugReport = toText(
    parsed.bugReport ||
    parsed.proposedBugReport ||
    parsed.proposedBug ||
    parsed.highestRiskBug ||
    parsed.highestRiskFinding ||
    parsed.draftBug
  );

  if (!findings || !bugReport) {
    throw new Error("Copilot returned bug findings without a report and proposed bug details.");
  }
  return { findings, bugReport };
}

async function createAndLinkTestCaseInADO(config, aiData, bugData) {
  const url = `https://dev.azure.com/${config.adoOrg}/${config.adoProject}/_apis/wit/workitems/$Test Case?api-version=7.1`;
  
  let sourceAreaPath = (bugData.areaPath || "").replace(/\s+/g, ' ').trim();
  // Customize these paths for your Azure DevOps project, or leave the source
  // area path unchanged by using the default branch below.
  const sourceMatch = "";
  const replacementTarget = "";
  
  let targetAreaPath = (sourceMatch &&
                        (sourceAreaPath.toLowerCase() === sourceMatch.toLowerCase() ||
                         sourceAreaPath.toLowerCase().includes(sourceMatch.toLowerCase())))
                        ? replacementTarget
                        : (sourceAreaPath || `${config.adoProject}`);

  const targetIterationPath = config.adoProject;

  let stepXmlItems = aiData.steps.map((step, idx) => {
    return `<step type="ActionStep" id="${idx + 2}"><parameterizedString isformatted="true">${step}</parameterizedString><parameterizedString isformatted="true"></parameterizedString></step>`;
  }).join("");

  const finalStepId = aiData.steps.length + 2;
  stepXmlItems += `<step type="ValidateStep" id="${finalStepId}"><parameterizedString isformatted="true">Verify system outcome</parameterizedString><parameterizedString isformatted="true">${aiData.expectedResult}</parameterizedString></step>`;
  const nativeAdoStepsXml = `<steps id="0" last="${finalStepId}">${stepXmlItems}</steps>`;

  const patchPayload = [
    { "op": "add", "path": "/fields/System.Title", "value": `Verification: ${aiData.title} (Bug #${bugData.bugId})` },
    { "op": "add", "path": "/fields/Microsoft.VSTS.TCM.Steps", "value": nativeAdoStepsXml },
    { "op": "add", "path": "/fields/System.AreaPath", "value": targetAreaPath },
    { "op": "add", "path": "/fields/System.IterationPath", "value": targetIterationPath },
    { 
      "op": "add", 
      "path": "/fields/System.Tags", 
      "value": "CiCQA_AIExtension" // Updated tag designation
    },
    {
      "op": "add",
      "path": "/relations/-",
      "value": {
        "rel": "Microsoft.VSTS.Common.TestedBy-Reverse",
        "url": `https://dev.azure.com/${config.adoOrg}/${config.adoProject}/_apis/wit/workitems/${bugData.bugId}`,
        "attributes": { "comment": "AI generated test vector mapping linked via Chrome Engine" }
      }
    }
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json-patch+json",
      "Authorization": `Basic ${btoa(":" + config.adoPat)}`
    },
    body: JSON.stringify(patchPayload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure DevOps error: ${response.status} - ${errText}`);
  }

  return await response.json();
}