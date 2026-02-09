# Web PDF Compiler — Tampermonkey Userscript

Scan webpages and compile multiple pages into a single PDF document. Features inter-page persistence so you can capture pages across browsing sessions and organize them into projects.

---

## Features

- **Page Capture** — Capture the visible viewport or the full scrollable page as a high-quality screenshot (2x scale default)
- **Project Management** — Create, rename, and delete projects to organize your captures
- **Inter-Page Persistence** — All data stored via Tampermonkey `GM_setValue`/`GM_getValue`, persisting across pages, tabs, and sessions
- **Page Reordering** — Move captured pages up/down in the list before compiling
- **PDF Compilation** with professional output:
  - **Table of Contents** with PDF page references (`p.5`, `p.12`, etc.)
  - **Page headers** — title, URL, and timestamp at the top of each capture section
  - **Page numbers** — "Page X of Y" footer on every page with project name and date
  - **Section divider lines** between capture sections
  - **Segment overlap** — prevents text from being cut at page break boundaries
  - **Proper margins** — configurable margins on all sides
  - **Multi-page TOC** — automatically expands for large projects
  - **PDF metadata** — title, author, subject embedded in the file
- **Configurable Settings** — Paper size, margins, capture quality, and more
- **Draggable Panel** — Floating UI panel that can be dragged anywhere
- **Keyboard Shortcuts** — `Alt+Shift+P` to toggle, `Alt+Shift+C` to capture
- **Tampermonkey Menu** — All commands accessible from the extension menu

---

## Installation

### Prerequisites

- **Tampermonkey** browser extension:
  - [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
  - [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
  - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### Steps

1. Open Tampermonkey Dashboard → click the **`+`** tab
2. Delete any default template and paste the contents of `web-pdf-compiler.user.js`
3. Press `Ctrl+S` to save
4. Navigate to any page — purple PDF button appears at bottom-right

---

## Usage

### Capturing Pages

1. Navigate to a webpage
2. Open the panel (click purple button or `Alt+Shift+P`)
3. Choose **Visible Area** or **Full Page** capture mode
4. Click **Capture Page** (or `Alt+Shift+C`)

### Managing Projects

- **New** — `+` button next to dropdown
- **Rename** — pencil icon
- **Delete** — trash icon
- **Switch** — dropdown selector

### Compiling to PDF

1. Ensure pages are captured in the active project
2. Click **Compile & Download PDF**
3. PDF downloads with TOC, headers, page numbers, and all captures

---

## Settings (⚙️)

Click the gear icon in the panel header to configure:

### Paper & Layout

| Setting | Default | Description |
|---------|---------|-------------|
| Paper Size | A4 | A4, Letter, or Legal |
| Margins | 20px | Space around content on all sides |
| Segment Overlap | 30px | Pixel overlap at page breaks to prevent cutting text |

### Capture Quality

| Setting | Default | Description |
|---------|---------|-------------|
| Capture Scale | 2x | html2canvas rendering scale (1-3, higher = sharper) |
| Image Quality | 0.92 | JPEG quality for captures |
| PDF Segment Quality | 0.92 | JPEG quality for page-split segments |
| Max Stored Width | 2400px | Maximum image width saved to storage |

### PDF Content

| Setting | Default | Description |
|---------|---------|-------------|
| Table of Contents | ✅ | First page(s) with page listing and PDF page refs |
| Page Headers | ✅ | Title, URL, timestamp at top of each section |
| Page Numbers | ✅ | "Page X of Y" footer with project name |
| Section Dividers | ✅ | Horizontal line between capture sections |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + Shift + P` | Toggle panel visibility |
| `Alt + Shift + C` | Quick capture current page |

---

## v2.0 Improvements

- ✅ **Proper margins** — content no longer bleeds to page edges
- ✅ **Page numbering** — "Page X of Y" on every PDF page
- ✅ **TOC with page references** — shows which PDF page each capture starts on
- ✅ **Multi-page TOC** — automatically handles large projects
- ✅ **Page headers** — title + URL + date at the top of each capture section
- ✅ **Section dividers** — visual separation between captures
- ✅ **Segment overlap** — 30px overlap prevents text being sliced at boundaries
- ✅ **PDF metadata** — title, author, subject embedded
- ✅ **Settings panel** — configurable paper size, margins, quality, content toggles
- ✅ **Higher capture quality** — 2x scale default (was 1.5x), 2400px max width (was 1600px)
- ✅ **Paper size options** — A4, Letter, Legal

---

## Technical Details

| Component | Library / API |
|-----------|---------------|
| Screenshot capture | [html2canvas](https://html2canvas.hertzen.com/) v1.4.1 |
| PDF generation | [jsPDF](https://parall.ax/products/jspdf) v2.5.1 |
| Persistent storage | Tampermonkey `GM_setValue` / `GM_getValue` |
| Image compression | Canvas API (auto-downscale for storage) |

### Limitations

- **Cross-origin images** — Some images may not render due to CORS restrictions
- **Dynamic content** — JS-rendered content not yet loaded at capture time may be missing
- **iframes** — Content inside iframes is not captured (`@noframes`)
- **Storage limits** — Browser-dependent; very large projects may hit limits

---

## License

MIT
