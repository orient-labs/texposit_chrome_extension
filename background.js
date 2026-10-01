// Opens TeXposit's import page for a DOI, telling it which projects the user
// currently has open so it can preselect when there is exactly one.
// For a local dev server, change TEXPOSIT_URL (and host_permissions in manifest.json).
const TEXPOSIT_URL = "https://app.texposit.com";
// const TEXPOSIT_URL = "http://localhost:8080";
const POPUP_WIDTH = 680;
const POPUP_HEIGHT = 560;
const EDITOR_URL_PATTERN = /\/editor\/([0-9a-f-]{36})/;

async function openProjectUuids() {
  const tabs = await chrome.tabs.query({ url: `${TEXPOSIT_URL}/editor/*` });
  const uuids = tabs.map((tab) => EDITOR_URL_PATTERN.exec(tab.url)?.[1]).filter(Boolean);
  return [...new Set(uuids)];
}

// `reference` includes DOI/title/authors and may include Scholar's PDF URL.
chrome.runtime.onMessage.addListener((reference) => {
  openProjectUuids().then((open) => {
    const params = new URLSearchParams({ ...reference, open: open.join(",") });
    chrome.windows.create({
      url: `${TEXPOSIT_URL}/import-reference?${params}`,
      type: "popup",
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
    });
  });
});
