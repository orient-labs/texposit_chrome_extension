// Injects "Import to TeXposit": a link in the right-hand column of every Google
// Scholar result (next to the [PDF] link), or a floating button on a paper page
// that declares its DOI in <meta> tags.
const BUTTON_LABEL = "Import to TeXposit";
const DOI_PATTERN = /10\.\d{4,9}\/[^\s"<>?#]+/;
const ARXIV_PATTERN = /arxiv\.org\/(?:abs|pdf)\/([\w.\-/]+?)(?:v\d+)?(?:\.pdf)?$/;
const ARXIV_DOI_PREFIX = "10.48550/arXiv.";
const SCHOLAR_HOST = "scholar.google.com";
const DOI_META_SELECTOR = 'meta[name="citation_doi"], meta[name="dc.identifier"], meta[name="DC.Identifier"]';
const PDF_META_SELECTOR = 'meta[name="citation_pdf_url"]';
const ARXIV_META_SELECTOR = 'meta[name="citation_arxiv_id"]';
const TITLE_META_SELECTOR = 'meta[name="citation_title"]';
const AUTHOR_META_SELECTOR = 'meta[name="citation_author"]';
const SCHOLAR_LABS_PATH = "/scholar_labs/";
const SCHOLAR_ACTION_ROW_SELECTOR = ".gs_flb"; // Save / Cite / Cited by row
const SCHOLAR_LINK_MARKER = "data-texposit";
const BYLINE_SEPARATOR = /\s+-\s+/; // Scholar: "authors - venue, year - publisher"
const ELLIPSIS = "…";

function doiFromUrl(url) {
  const arxivId = ARXIV_PATTERN.exec(url)?.[1];
  if (arxivId) return ARXIV_DOI_PREFIX + arxivId;
  return DOI_PATTERN.exec(decodeURIComponent(url))?.[0];
}

function doiFromPage() {
  const metaDoi = [...document.querySelectorAll(DOI_META_SELECTOR)]
    .map((meta) => DOI_PATTERN.exec(meta.content)?.[0])
    .find(Boolean);
  const arxivId = document.querySelector(ARXIV_META_SELECTOR)?.content;
  return metaDoi || (arxivId && ARXIV_DOI_PREFIX + arxivId) || doiFromUrl(location.href);
}

// Title/authors are hints: TeXposit uses them only to fill fields the DOI
// record lacks (old Elsevier records have no authors, yet the page lists them).
// Authors are sent BibTeX-style ("A and B"); a truncated list ends in "others".
function scholarAuthors(result) {
  const byline = result.querySelector(".gs_a")?.textContent.split(BYLINE_SEPARATOR)[0] ?? "";
  const names = byline.split(",").map((name) => name.trim()).filter(Boolean);
  const truncated = names.some((name) => name.includes(ELLIPSIS));
  const cleaned = names.map((name) => name.replace(ELLIPSIS, "").trim()).filter(Boolean);
  return [...cleaned, ...(truncated ? ["others"] : [])].join(" and ");
}

function metaAuthors() {
  return [...document.querySelectorAll(AUTHOR_META_SELECTOR)].map((meta) => meta.content).join(" and ");
}

function scholarPdfUrl(result) {
  const link = [...result.querySelectorAll(".gs_ggsd a[href]")]
    .find((candidate) => /\bPDF\b/i.test(candidate.textContent));
  return link?.href;
}

function sendReference(event, reference) {
  event.preventDefault();
  chrome.runtime.sendMessage(reference);
}

// Scholar's right column is .gs_ggs > .gs_ggsd > .gs_or_ggsm (one row per
// link) and only exists on results that have a PDF; results without one get
// an identical column so the link sits in the same place on every result.
function scholarLinkColumn(result) {
  let column = result.querySelector(".gs_ggsd");
  if (column) return column;
  const wrapper = document.createElement("div");
  wrapper.className = "gs_ggs gs_fl";
  column = document.createElement("div");
  column.className = "gs_ggsd";
  wrapper.append(column);
  result.prepend(wrapper);
  return column;
}

function addScholarLinks() {
  for (const result of document.querySelectorAll(".gs_r.gs_or")) {
    const heading = result.querySelector("h3");
    if (!heading || result.querySelector(`[${SCHOLAR_LINK_MARKER}]`)) continue;
    const titleLink = heading.querySelector("a");
    const doi = titleLink && doiFromUrl(titleLink.href);
    const pdfUrl = scholarPdfUrl(result);
    const reference = {
      ...(doi && { doi }),
      ...(pdfUrl && { pdf_url: pdfUrl }),
      title: (titleLink ?? heading).textContent.trim(),
      authors: scholarAuthors(result),
    };

    const link = document.createElement("a");
    link.href = "#";
    link.textContent = BUTTON_LABEL;
    link.setAttribute(SCHOLAR_LINK_MARKER, "1");
    link.addEventListener("click", (event) => sendReference(event, reference));
    const actionRow = result.querySelector(SCHOLAR_ACTION_ROW_SELECTOR);
    if (isScholarLabs() && actionRow) {
      actionRow.append(link);
      continue;
    }
    const row = document.createElement("div");
    row.className = "gs_or_ggsm";
    row.append(link);
    scholarLinkColumn(result).append(row);
  }
}

// Scholar Labs: the PDF column is a collapsed popup, so the link goes in the
// action row instead; results stream in after load, hence the observer.
function isScholarLabs() {
  return location.pathname.startsWith(SCHOLAR_LABS_PATH);
}

function watchScholarResults() {
  addScholarLinks();
  new MutationObserver(addScholarLinks).observe(document.body, { childList: true, subtree: true });
}

function addFloatingButton() {
  const doi = doiFromPage();
  if (!doi) return;
  const button = document.createElement("button");
  button.textContent = BUTTON_LABEL;
  const title = document.querySelector(TITLE_META_SELECTOR)?.content ?? "";
  const pdfUrl = document.querySelector(PDF_META_SELECTOR)?.content;
  button.addEventListener("click", (event) => sendReference(event, {
    doi,
    title,
    authors: metaAuthors(),
    ...(pdfUrl && { pdf_url: pdfUrl }),
  }));
  button.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 14px;" +
    "border:0;border-radius:8px;background:#2b6cb0;color:#fff;font:600 14px sans-serif;cursor:pointer";
  document.body.append(button);
}

if (location.hostname === SCHOLAR_HOST) watchScholarResults();
else addFloatingButton();
