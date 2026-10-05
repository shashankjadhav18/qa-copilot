// content.js
function scrapeWorkItemDetails() {
  let workItemId = null;
  const idElement = document.querySelector(".work-item-form-id") || 
                    document.querySelector(".workitem-info-bar .id") ||
                    document.querySelector("[data-vss-managed-column='id']");
  
  if (idElement && idElement.textContent.trim()) {
    workItemId = idElement.textContent.trim();
  } else {
    const urlMatch = window.location.href.match(/\/(?:edit|workitems)\/(\d+)/);
    if (urlMatch && urlMatch[1]) {
      workItemId = urlMatch[1];
    }
  }

  let titleText = "";
  const titleInput = document.querySelector(".work-item-form-title input") || 
                     document.querySelector("[aria-label='Title']") ||
                     document.querySelector("[aria-label='Title'] input") ||
                     document.querySelector(".work-item-title-text input");

  if (titleInput) {
    titleText = titleInput.value ? titleInput.value.trim() : titleInput.innerText.trim();
  }
  
  if (!titleText) {
    const backupHeader = document.querySelector(".work-item-form-header-row") || 
                         document.querySelector(".work-item-title") || 
                         document.querySelector("h1.work-item-title") ||
                         document.title;
    if (backupHeader) {
      titleText = typeof backupHeader === 'string' ? backupHeader : backupHeader.innerText;
      titleText = titleText.replace(/^\d+\s*/, "").replace(/ - Boards$/i, "").trim();
    }
  }

  const descElement = document.querySelector("[aria-label='&Steps to Reproduce:']") ||
                      document.querySelector("[aria-label='Description']") || 
                      document.querySelector(".work-item-description") ||
                      document.querySelector(".richedit-container .internal-content") ||
                      document.querySelector(".vss-RichEditor-container");

  const acceptanceElement = document.querySelector("[aria-label='Acceptance Criteria']") ||
                            document.querySelector("[aria-label='Acceptance criteria']") ||
                            document.querySelector("[id*='AcceptanceCriteria']");

  // Targets the active text inside the Area Path field container
  const areaPathElement = document.querySelector("[aria-label='Area Path']") || 
                          document.querySelector(".work-item-form-area-iteration .combo-text-input") ||
                          document.querySelector("[id*='AreaPath'] input");
                          
  let areaPathText = "";
  if (areaPathElement) {
    areaPathText = areaPathElement.value ? areaPathElement.value.trim() : areaPathElement.textContent.trim();
  }

  const workItemTypeElement = document.querySelector("[aria-label='Work Item Type']") ||
                              document.querySelector("[id*='WorkItemType']");
  const workItemType = workItemTypeElement
    ? (workItemTypeElement.value || workItemTypeElement.textContent || "").trim()
    : "";

  return {
    workItemId: workItemId,
    bugId: workItemId,
    workItemType: workItemType || "Unknown",
    title: titleText,
    description: descElement ? descElement.innerText.trim() : "No clear description extracted from selectors.",
    acceptanceCriteria: acceptanceElement ? acceptanceElement.innerText.trim() : "",
    areaPath: areaPathText
  };
}

if (typeof window.hasScraperExecuted === 'undefined') {
  window.hasScraperExecuted = true;
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrape") {
      sendResponse(scrapeWorkItemDetails());
    }
    return true;
  });
}