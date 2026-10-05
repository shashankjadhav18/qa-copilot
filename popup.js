// popup.js

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Check local gateway server health status upon popup launch
  checkLocalServerHealth();

  // 2. Restore configurations and toggle preferences
  chrome.storage.local.get([
    'adoOrg', 'adoProject', 'adoPat', 'openAiKey',
    'pipelineStatus', 'extensionEnabled', 'selectedWorkflow',
    'featureScopeResult', 'bugHuntResult'
  ], async (data) => {
    if (chrome.runtime.lastError) return;
    if (data.adoPat) document.getElementById('adoPat').value = data.adoPat;
    if (data.selectedWorkflow) {
      document.getElementById('workflow').value = data.selectedWorkflow;
    }
    if (data.featureScopeResult && data.featureScopeResult.result) {
      if (!data.selectedWorkflow) document.getElementById('workflow').value = 'feature-test-scope';
      renderFeatureScope(data.featureScopeResult.result);
    }
    if (data.bugHuntResult && data.bugHuntResult.result) {
      if (!data.selectedWorkflow) document.getElementById('workflow').value = 'feature-bug-hunt';
      renderBugHunt(data.bugHuntResult.result);
    }
    
    // Set toggle switch state (default to true if unassigned)
    const toggleInput = document.getElementById('extensionToggle');
    toggleInput.checked = data.extensionEnabled !== false;
    toggleActionState(toggleInput.checked);

    if (data.pipelineStatus && data.pipelineStatus.state === "processing") {
      renderStatusUI(data.pipelineStatus);
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const adoContext = detectAdoContext(tab && tab.url);
      if (adoContext) {
        document.getElementById('adoOrg').value = adoContext.adoOrg;
        document.getElementById('adoProject').value = adoContext.adoProject;
        await chrome.storage.local.set(adoContext);
      }
    } catch (err) {
      console.error("Failed to auto-parse active tab URL:", err);
    }
    updateWorkflowButton();
  });
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'featureScopeResult') {
    renderFeatureScope(request.result);
  } else if (request.action === 'bugHuntResult') {
    renderBugHunt(request.result);
  }
});

function renderFeatureScope(output) {
  if (document.getElementById('workflow').value !== 'bug-test-case') {
    document.getElementById('outputPanel').style.display = 'none';
    return;
  }
  document.getElementById('scopeHeading').innerText = 'Test scope';
  document.getElementById('commentHeading').innerText = 'Feature closing comment';
  document.getElementById('copyScopeBtn').innerText = 'Copy test scope';
  document.getElementById('copyCommentBtn').innerText = 'Copy closing comment';
  document.getElementById('scopeOutput').value = output.testScope || '';
  document.getElementById('commentOutput').value = output.closingComment || '';
  document.getElementById('outputPanel').style.display = 'block';
  document.getElementById('processBtn').disabled = !document.getElementById('extensionToggle').checked;
}

function renderBugHunt(output) {
  if (document.getElementById('workflow').value !== 'bug-test-case') {
    document.getElementById('outputPanel').style.display = 'none';
    return;
  }
  document.getElementById('scopeHeading').innerText = 'Potential bug findings';
  document.getElementById('commentHeading').innerText = 'Proposed bug report';
  document.getElementById('copyScopeBtn').innerText = 'Copy bug findings';
  document.getElementById('copyCommentBtn').innerText = 'Copy proposed bug report';
  document.getElementById('scopeOutput').value = output.findings || '';
  document.getElementById('commentOutput').value = output.bugReport || '';
  document.getElementById('outputPanel').style.display = 'block';
  document.getElementById('processBtn').disabled = !document.getElementById('extensionToggle').checked;
}

async function copyOutput(id) {
  const value = document.getElementById(id).value;
  await navigator.clipboard.writeText(value);
  showStatus('Copied to clipboard.');
}

document.getElementById('copyScopeBtn').addEventListener('click', () => copyOutput('scopeOutput'));
document.getElementById('copyCommentBtn').addEventListener('click', () => copyOutput('commentOutput'));
document.getElementById('openRunBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('preview.html') });
});

// Async server ping health validation routine
async function checkLocalServerHealth() {
  const banner = document.getElementById('connectionBanner');
  const icon = document.getElementById('connectionIcon');
  const text = document.getElementById('connectionText');

  try {
    // Ping terminal bridge proxy server standard layout
    const res = await fetch("http://localhost:4141/v1/models", { method: "GET" });
    if (res.ok) {
      banner.className = "connection-banner connected";
      icon.innerText = "✓";
      text.innerText = "Active - Connected to localhost";
    } else {
      throw new Error();
    }
  } catch (err) {
    banner.className = "connection-banner disconnected";
    icon.innerText = "⚠️";
    text.innerText = "Local server required";
  }
}

// Handle workflow input locking based on top toggle position block
function toggleActionState(isEnabled) {
  const processBtn = document.getElementById('processBtn');
  if (!isEnabled) {
    processBtn.disabled = true;
    processBtn.innerText = "Workflows Disabled";
  } else {
    processBtn.disabled = false;
    updateWorkflowButton();
  }
}

function updateWorkflowButton() {
  const workflow = document.getElementById('workflow');
  const processBtn = document.getElementById('processBtn');
  if (workflow && processBtn) {
    processBtn.innerText = workflow.value === 'bug-test-case'
      ? 'Generate & Link'
      : workflow.value === 'feature-bug-hunt'
        ? 'Find Potential Bugs'
        : 'Generate Preview';
  }
}

async function openRunTab() {
  const previewUrl = chrome.runtime.getURL('preview.html');
  const existing = await chrome.tabs.query({ url: previewUrl });
  if (existing.length) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId !== (await chrome.windows.getCurrent()).id) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: previewUrl });
}

function detectAdoContext(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parsed.hostname === 'dev.azure.com' && segments.length >= 2) {
      return { adoOrg: segments[0], adoProject: segments[1] };
    }
    if (parsed.hostname.endsWith('.visualstudio.com') && segments.length >= 1) {
      return { adoOrg: parsed.hostname.split('.')[0], adoProject: segments[0] };
    }
  } catch (err) {
    console.warn('Could not detect Azure DevOps context:', err);
  }
  return null;
}

document.getElementById('extensionToggle').addEventListener('change', (e) => {
  const isChecked = e.target.checked;
  toggleActionState(isChecked);
  chrome.storage.local.set({ extensionEnabled: isChecked });
});

document.getElementById('workflow').addEventListener('change', () => {
  updateWorkflowButton();
  document.getElementById('outputPanel').style.display = 'none';
  chrome.storage.local.set({
    selectedWorkflow: document.getElementById('workflow').value
  });
});

// Storage layout monitor hooks
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pipelineStatus) {
    renderStatusUI(changes.pipelineStatus.newValue);
  }
});

function renderStatusUI(status) {
  const btn = document.getElementById('processBtn');
  const statusPanel = document.getElementById('statusPanel');
  const progressBar = document.getElementById('progressBar');
  const statusTitle = document.getElementById('statusTitle');
  
  if (!status) return;

  statusPanel.style.display = 'block';
  progressBar.style.width = `${status.progress}%`;

  if (status.state === "processing") {
    statusTitle.innerText = "Running Pipeline...";
    btn.disabled = true;
    showStatus(status.message);
  } else if (status.state === "success") {
    statusTitle.innerText = "Success!";
    btn.disabled = !document.getElementById('extensionToggle').checked;
    showStatus(status.message);
    setTimeout(() => { 
      statusPanel.style.display = 'none';
      chrome.storage.local.remove('pipelineStatus');
    }, 5000);
  } else if (status.state === "error") {
    statusTitle.innerText = "Error Occurred";
    btn.disabled = !document.getElementById('extensionToggle').checked;
    showStatus(status.message);
  }
}

function getConfigInputs() {
  return {
    adoOrg: document.getElementById('adoOrg').value.trim(),
    adoProject: document.getElementById('adoProject').value.trim(),
    adoPat: document.getElementById('adoPat').value.trim(),
    openAiKey: document.getElementById('openAiKey').value.trim()
  };
}

document.getElementById('saveBtn').addEventListener('click', () => {
  const config = getConfigInputs();
  chrome.storage.local.set(config, () => {
    const statusPanel = document.getElementById('statusPanel');
    const statusTitle = document.getElementById('statusTitle');
    statusPanel.style.display = 'block';
    statusTitle.innerText = "Configuration";
    showStatus('Configuration saved successfully!');
    setTimeout(() => { statusPanel.style.display = 'none'; }, 2000);
  });
});

document.getElementById('processBtn').addEventListener('click', async () => {
  const btn = document.getElementById('processBtn');
  const config = getConfigInputs();
  const workflow = document.getElementById('workflow').value;
  chrome.storage.local.set({ selectedWorkflow: workflow });

  if (!config.adoOrg || !config.adoProject ||
      (workflow === 'bug-test-case' && !config.adoPat)) {
    const statusPanel = document.getElementById('statusPanel');
    const statusTitle = document.getElementById('statusTitle');
    statusPanel.style.display = 'block';
    statusTitle.innerText = "Validation Error";
    showStatus(workflow === 'feature-test-scope'
      ? 'Please provide the Azure DevOps organization and project.'
      : 'Please fill out all configuration fields.');
    return;
  }

  btn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found.");

    if (workflow !== 'bug-test-case') {
      document.getElementById('outputPanel').style.display = 'none';
    }

    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    
    chrome.tabs.sendMessage(tab.id, { action: "scrape" }, (bugData) => {
      if (chrome.runtime.lastError || !bugData || !bugData.workItemId) {
        const statusPanel = document.getElementById('statusPanel');
        const statusTitle = document.getElementById('statusTitle');
        statusPanel.style.display = 'block';
        statusTitle.innerText = "Scraping Failed";
        showStatus('Could not scrape work-item details. Ensure you are on an Azure DevOps work-item page.');
        btn.disabled = false;
        return;
      }

      chrome.runtime.sendMessage({
            action: workflow === 'feature-test-scope'
          ? "generateFeatureScope"
              : workflow === 'feature-bug-hunt'
                ? "generateBugHunt"
                : "processAutomation",
        config: config,
        bugData: bugData,
        featureData: bugData
      });

      if (workflow !== 'bug-test-case') {
        openRunTab().catch(err => console.warn('Could not open run tab:', err));
      }
    });

  } catch (err) {
    const statusPanel = document.getElementById('statusPanel');
    const statusTitle = document.getElementById('statusTitle');
    statusPanel.style.display = 'block';
    statusTitle.innerText = "Pipeline Exception";
    showStatus(`Error: ${err.message}`);
    btn.disabled = false;
  }
});

function showStatus(text) {
  const statusText = document.getElementById('statusText');
  statusText.innerText = text;
}