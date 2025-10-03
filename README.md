## PDF to Anyfile Editor

### Overview
Upload a PDF, annotate it (draw, text, highlight, erase), and export to several formats. You can also download the original bytes with a different file extension (rename-only) for quick repackaging.

### Features
- **Upload PDF**: Client-side, no server required.
- **Annotate**:
  - Draw with adjustable color and size
  - Add text labels
  - Rectangle highlighter with adjustable opacity
  - Eraser for annotations
- **Export**:
  - Edited PDF (current page overlay)
  - PNG for current page
  - ZIP containing PNGs of all pages
  - Extracted plain text (.txt) for all pages
  - Save original bytes using a different extension (e.g., .docx, .jpg, .zip)
- **Mobile-first UI** with sticky toolbars

### Tech Stack
- React + Vite
- pdfjs-dist (rendering & text extraction)
- pdf-lib (embedding annotations as an image overlay into PDF)
- FileSaver.js, JSZip

### Getting Started
#### Prerequisites
- Node.js 18+ and npm

#### Install
```bash
npm install
```

#### Development
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

#### Production Build
```bash
npm run build
npm run preview
```

### Usage
1. Click “Choose file” and select a PDF.
2. Pick a tool: Draw, Text, Highlight, or Erase.
3. Adjust color, size, and zoom scale as needed.
4. Use “Clear Page” to remove current annotations on that page.
5. Export options at the bottom bar:
   - Edited PDF (current page overlay)
   - Current Page PNG
   - All Pages ZIP (PNGs)
   - TXT (all pages)
   - Save as specific extension (rename-only)

### Notes & Limitations
- The “Edited PDF” export embeds the annotations of the current page as an image overlay on that page only (MVP). Multi-page embedded overlays can be added later.
- “Save as extension” does not convert the PDF; it downloads the original bytes with a different extension name.
- Text extraction is basic and may not preserve layout.
- pdf.js uses dynamic code internally which may trigger warnings in some bundlers; this is expected for client-side rendering.

### Deploy to Vercel
1. Push this project to GitHub (repo: `barramee27/pdf`).
2. In Vercel, import the repository.
3. Settings:
   - Framework Preset: Vite
   - Build command: `vite build`
   - Output directory: `dist`
4. Deploy. Once complete, open the URL and test with a sample PDF.

### Configuration
- No environment variables required.
- `vercel.json` routes all paths to `index.html` for SPA behavior.

### Roadmap (Optional Enhancements)
- Per-page annotation layers persisted and embedded for the entire document
- Move/resize text annotations after placement
- Freeform highlighter path
- Undo/redo stack
- Drag-and-drop file support

### License
MIT. See LICENSE if added to this repository.

### Acknowledgements
- Mozilla pdf.js (`pdfjs-dist`)
- pdf-lib team
- Open-source community


