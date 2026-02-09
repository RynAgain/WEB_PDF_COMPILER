# Web PDF Compiler — Improvement Roadmap

Feature plan and task tracker for future development.

---

## 🔧 Bug Fixes & Polish

- [ ] Fix SVG icon sizing consistency across all browsers (Firefox vs Chrome rendering)
- [ ] Handle edge case where `html2canvas` fails silently on certain SPAs (React, Angular lazy-loaded content)
- [ ] Add error recovery when Tampermonkey storage quota is exceeded (graceful warning + cleanup)
- [x] Fix panel position reset when window is resized (panel can go offscreen)
- [x] Prevent duplicate captures if user double-clicks the capture button rapidly
- [ ] Styling is !important to prvent influece from base page.
---

## 📸 Capture Improvements

- [x] **Delayed capture timer** — 3/5/10 second countdown before capture (lets user scroll to position, dismiss popups)
- [ ] **Region selection capture** — Click-and-drag to select a specific area of the page to capture
- [ ] **Auto-scroll full page** — Scroll-and-stitch capture for pages that lazy-load content on scroll
- [x] **Custom page title** — Let user rename the captured page title (currently uses `document.title`)
- [ ] **Re-capture / update** — Replace a page in the lineup without deleting and re-adding
- [ ] **Capture annotations** — Add text notes/comments to each captured page
- [ ] **Dark mode detection** — Option to force light background before capturing dark-themed sites
- [ ] **Exclude elements** — CSS selector input to hide specific elements before capture (ads, popups, navbars)

---

## 📄 PDF Output Enhancements

- [x] **Clickable TOC links** — Internal PDF links that jump to the referenced page
- [x] **Clickable URL links** — Source URLs in headers/TOC as clickable hyperlinks
- [ ] **Cover page** — Customizable cover page with project name, logo, author, date
- [ ] **Page orientation per capture** — Auto-landscape for wide captures, portrait for tall ones
- [ ] **Custom header/footer templates** — User-defined text with variables (`{title}`, `{url}`, `{date}`, `{page}`)
- [ ] **Watermark support** — Optional diagonal watermark text across pages (e.g., "DRAFT", "CONFIDENTIAL")
- [ ] **PDF bookmarks** — Sidebar bookmark navigation for each capture section
- [ ] **Page border/shadow** — Subtle border or drop shadow around captured images for visual polish
- [ ] **Image fit options** — Fit-to-width, fit-to-page, or actual-size rendering modes
- [ ] **Appendix page** — Auto-generated list of all source URLs at the end

---

## 🗂️ Project Management

- [x] **Drag-and-drop reordering** — Drag pages to reorder instead of just up/down buttons
- [ ] **Project export/import** — Export project as JSON file, import on another machine
- [ ] **Project duplication** — Clone an existing project with all its pages
- [ ] **Project tags/categories** — Tag projects for organization (e.g., "API Docs", "Tutorials")
- [ ] **Bulk page selection** — Checkbox multi-select for bulk delete or bulk move
- [x] **Page preview modal** — Click thumbnail to see full-size preview of captured page
- [ ] **Storage usage indicator** — Show how much Tampermonkey storage is being used per project
- [ ] **Auto-cleanup** — Option to auto-delete projects older than X days
- [ ] **Project templates** — Pre-configured capture settings per project type

---

## 🎨 UI/UX Improvements

- [ ] **Light theme option** — Toggle between dark (current) and light panel theme
- [ ] **Panel resize** — Drag to resize the panel width/height
- [ ] **Minimized mode** — Compact mode showing just project name + page count + capture button
- [ ] **Page thumbnails grid view** — Grid layout option for page list (in addition to current list view)
- [ ] **Capture progress indicator** — Visual progress during html2canvas rendering (not just "Capturing...")
- [ ] **Undo delete** — Toast with "Undo" button when a page or project is deleted
- [ ] **Keyboard navigation** — Tab through pages, Enter to preview, Delete to remove
- [ ] **Notification badge per project** — Show unsaved/new-capture indicators
- [ ] **Responsive panel** — Auto-adjust panel size for smaller viewports

---

## 🔌 Integration & Advanced Features

- [ ] **Cloud sync** — Optional sync via Google Drive / Dropbox / GitHub Gist
- [ ] **Batch URL capture** — Paste a list of URLs and auto-capture all of them in sequence
- [ ] **Scheduled captures** — Auto-capture a URL on a timer (e.g., daily snapshots)
- [ ] **Diff comparison** — Compare two captures of the same URL side-by-side
- [ ] **OCR text extraction** — Extract text from captured images using Tesseract.js
- [ ] **PDF merge** — Import existing PDF files and merge with captured pages
- [ ] **API endpoint** — Expose capture/compile functions for other scripts/extensions to call
- [ ] **Clipboard paste** — Paste screenshots from clipboard directly into a project
- [ ] **Browser action popup** — Chrome extension version with popup UI (beyond Tampermonkey)

---

## 🏗️ Architecture & Performance

- [ ] **IndexedDB storage** — Move image data to IndexedDB for larger storage limits (keep metadata in GM_setValue)
- [ ] **Lazy thumbnail loading** — Only load thumbnails when page items scroll into view
- [ ] **Web Worker PDF compilation** — Move jsPDF processing to a Web Worker to prevent UI freeze
- [ ] **Chunked image storage** — Split large images across multiple storage keys to avoid quota per-key limits
- [ ] **Compression optimization** — Try WebP format where supported for smaller storage footprint
- [ ] **Memory management** — Release canvas/image objects immediately after use during compilation
- [ ] **Streaming PDF build** — Build PDF incrementally instead of holding all images in memory

---

## 📊 Priority Matrix

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| ✅ Done | Drag-and-drop reordering | Medium | High |
| ✅ Done | Clickable TOC links | Low | High |
| ✅ Done | Custom page titles | Low | High |
| ✅ Done | Page preview modal | Medium | High |
| 🔴 High | IndexedDB storage | High | High |
| 🟡 Medium | Region selection capture | High | Medium |
| 🟡 Medium | Project export/import | Medium | Medium |
| ✅ Done | Delayed capture timer | Low | Medium |
| 🟡 Medium | Cover page | Medium | Medium |
| 🟡 Medium | Exclude elements | Medium | Medium |
| 🟡 Medium | PDF bookmarks | Medium | Medium |
| 🟢 Low | Cloud sync | High | Medium |
| 🟢 Low | Batch URL capture | High | Medium |
| 🟢 Low | OCR text extraction | High | Low |
| 🟢 Low | Watermark support | Low | Low |
| 🟢 Low | Light theme | Medium | Low |

---

## Completed ✅

- [x] Basic page capture (visible area + full page)
- [x] Project management (create, rename, delete, switch)
- [x] Inter-page persistence via GM_setValue
- [x] Page reordering (up/down) and deletion
- [x] PDF compilation with jsPDF
- [x] Table of contents with PDF page references
- [x] Page headers (title, URL, timestamp)
- [x] Page numbering ("Page X of Y")
- [x] Configurable settings panel
- [x] Paper size options (A4, Letter, Legal)
- [x] Configurable margins
- [x] Segment overlap at page breaks
- [x] Section divider lines
- [x] PDF metadata embedding
- [x] Keyboard shortcuts (Alt+Shift+P, Alt+Shift+C)
- [x] Tampermonkey menu commands
- [x] Draggable panel
- [x] Toast notifications
- [x] Capture flash feedback
- [x] Page count badge on toggle button
- [x] Thumbnail previews in page list
- [x] Custom page titles (rename captured page titles via edit button)
- [x] Clickable TOC links (internal PDF links jump to referenced page)
- [x] Duplicate capture prevention (isCapturing guard flag)
- [x] Panel position clamping on window resize
- [x] Clickable URL links in PDF headers and TOC entries
- [x] Page preview modal (click thumbnail for full-size view)
- [x] Delayed capture timer (None/3s/5s/10s countdown with visual overlay)
- [x] Drag-and-drop page reordering (HTML5 DnD on grip handles)
