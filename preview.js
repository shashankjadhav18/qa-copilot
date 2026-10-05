const statusText = document.getElementById("statusText");
const statusState = document.getElementById("statusState");
const progressBar = document.getElementById("progressBar");
const errorText = document.getElementById("errorText");
const resultPanel = document.getElementById("resultPanel");

function renderStatus(status) {
  if (!status) return;
  statusText.textContent = status.message || "Processing...";
  statusState.textContent = status.state || "unknown";
  progressBar.style.width = `${Number(status.progress) || 0}%`;
  errorText.textContent = status.state === "error" ? status.message : "";
}

function renderFeatureScope(result) {
  document.getElementById("firstHeading").textContent = "Test scope";
  document.getElementById("secondHeading").textContent = "Feature closing comment";
  document.getElementById("firstOutput").value = result.testScope || "";
  document.getElementById("secondOutput").value = result.closingComment || "";
  resultPanel.style.display = "block";
}

function renderBugHunt(result) {
  document.getElementById("firstHeading").textContent = "Potential bug findings";
  document.getElementById("secondHeading").textContent = "Proposed bug report";
  document.getElementById("firstOutput").value = result.findings || "";
  document.getElementById("secondOutput").value = result.bugReport || "";
  resultPanel.style.display = "block";
}

function renderStored(data) {
  renderStatus(data.pipelineStatus);
  if (data.featureScopeResult && data.featureScopeResult.result) {
    renderFeatureScope(data.featureScopeResult.result);
  } else if (data.bugHuntResult && data.bugHuntResult.result) {
    renderBugHunt(data.bugHuntResult.result);
  }
}

chrome.storage.local.get(
  ["pipelineStatus", "featureScopeResult", "bugHuntResult"],
  renderStored
);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.pipelineStatus) renderStatus(changes.pipelineStatus.newValue);
  if (changes.featureScopeResult && changes.featureScopeResult.newValue) {
    renderFeatureScope(changes.featureScopeResult.newValue.result);
  }
  if (changes.bugHuntResult && changes.bugHuntResult.newValue) {
    renderBugHunt(changes.bugHuntResult.newValue.result);
  }
});

async function copyText(id) {
  await navigator.clipboard.writeText(document.getElementById(id).value);
}

document.getElementById("copyFirst").addEventListener("click", () => copyText("firstOutput"));
document.getElementById("copySecond").addEventListener("click", () => copyText("secondOutput"));
