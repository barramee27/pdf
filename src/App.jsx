import React, { useEffect, useRef, useState, useCallback } from 'react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { PDFDocument, rgb } from 'pdf-lib';
import { Document as DocxDocument, Packer, Paragraph, ImageRun, AlignmentType } from 'docx';
import PptxGenJS from 'pptxgenjs';
import * as XLSX from 'xlsx';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const Tool = {
  None: 'none',
  Draw: 'draw',
  Text: 'text',
  Highlight: 'highlight',
  Erase: 'erase'
};

function rgb255(r, g, b, a = 1) {
  return rgb(r / 255, g / 255, b / 255);
}

export default function App() {
  const [fileName, setFileName] = useState('');
  const [fileBytes, setFileBytes] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [tool, setTool] = useState(Tool.Draw);
  const [strokeColor, setStrokeColor] = useState('#0ea5e9');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [textValue, setTextValue] = useState('');
  const [highlightAlpha, setHighlightAlpha] = useState(0.2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState(null);

  // Advanced tools state
  const mergeInputRef = useRef(null);
  const [splitStart, setSplitStart] = useState('1');
  const [splitEnd, setSplitEnd] = useState('');
  const [compressScale, setCompressScale] = useState(0.8); // 0.5 - 1.0
  const [compressQuality, setCompressQuality] = useState(0.75); // JPEG quality
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.15);
  const [watermarkSize, setWatermarkSize] = useState(36);
  const [numberPages, setNumberPages] = useState(false);

  const baseCanvasRef = useRef(null);
  const annoCanvasRef = useRef(null);
  const viewportSizeRef = useRef({ width: 0, height: 0 });

  const loadPdf = useCallback(async (data) => {
    const loadingTask = pdfjs.getDocument({ data });
    const doc = await loadingTask.promise;
    setPdf(doc);
    setPageCount(doc.numPages);
    setPageNumber(1);
  }, []);

  const onUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const buf = await f.arrayBuffer();
    setFileBytes(new Uint8Array(buf));
    await loadPdf(buf);
  };

  const renderPage = useCallback(async () => {
    if (!pdf) return;
    const page = await pdf.getPage(pageNumber);
    const vp = page.getViewport({ scale });
    const baseCanvas = baseCanvasRef.current;
    const annoCanvas = annoCanvasRef.current;
    baseCanvas.width = vp.width;
    baseCanvas.height = vp.height;
    annoCanvas.width = vp.width;
    annoCanvas.height = vp.height;
    viewportSizeRef.current = { width: vp.width, height: vp.height };

    const ctx = baseCanvas.getContext('2d');
    ctx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    // keep annotations canvas intact when re-rendering scale/page? We clear when page changes
    const annCtx = annoCanvas.getContext('2d');
    annCtx.lineCap = 'round';
  }, [pdf, pageNumber, scale]);

  useEffect(() => { renderPage(); }, [renderPage]);

  const handleMouseDown = (e) => {
    if (!annoCanvasRef.current) return;
    const rect = annoCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (tool === Tool.Draw || tool === Tool.Erase) {
      const ctx = annoCanvasRef.current.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = tool === Tool.Erase ? '#00000000' : strokeColor;
      ctx.lineWidth = tool === Tool.Erase ? strokeWidth * 3 : strokeWidth;
      ctx.globalCompositeOperation = tool === Tool.Erase ? 'destination-out' : 'source-over';
      setIsDrawing(true);
    } else if (tool === Tool.Text) {
      const ctx = annoCanvasRef.current.getContext('2d');
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = strokeColor;
      ctx.font = `${Math.max(12, strokeWidth * 6)}px ui-sans-serif, Arial`;
      ctx.fillText(textValue || 'Text', x, y);
      ctx.restore();
    } else if (tool === Tool.Highlight) {
      setDragStart({ x, y });
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing && tool !== Tool.Highlight) return;
    const rect = annoCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (tool === Tool.Draw || tool === Tool.Erase) {
      const ctx = annoCanvasRef.current.getContext('2d');
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const handleMouseUp = (e) => {
    if (tool === Tool.Draw || tool === Tool.Erase) {
      setIsDrawing(false);
    }
    if (tool === Tool.Highlight && dragStart) {
      const rect = annoCanvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const ctx = annoCanvasRef.current.getContext('2d');
      const w = x - dragStart.x;
      const h = y - dragStart.y;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = hexToRgba(strokeColor, highlightAlpha);
      ctx.fillRect(dragStart.x, dragStart.y, w, h);
      ctx.restore();
      setDragStart(null);
    }
  };

  const clearAnnotations = () => {
    const c = annoCanvasRef.current;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
  };

  const exportCurrentPagePng = async () => {
    const combo = document.createElement('canvas');
    combo.width = baseCanvasRef.current.width;
    combo.height = baseCanvasRef.current.height;
    const cctx = combo.getContext('2d');
    cctx.drawImage(baseCanvasRef.current, 0, 0);
    cctx.drawImage(annoCanvasRef.current, 0, 0);
    combo.toBlob((blob) => {
      saveAs(blob, withExt(fileName, 'png', pageNumber));
    }, 'image/png');
  };

  const exportText = async () => {
    if (!pdf) return;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(it => it.str);
      text += strings.join(' ') + '\n\n';
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, withExt(fileName, 'txt'));
  };

  const exportEditedPdf = async () => {
    if (!pdf || !fileBytes) return;
    const originalPdf = await PDFDocument.load(fileBytes);
    const page = await pdf.getPage(pageNumber);
    const vp = page.getViewport({ scale });

    // Only overlay current page's annotations for now (MVP)
    const annBlob = await new Promise((res) => annoCanvasRef.current.toBlob(res, 'image/png'));
    const annBytes = new Uint8Array(await annBlob.arrayBuffer());
    const embedded = await originalPdf.embedPng(annBytes);

    const p = originalPdf.getPage(pageNumber - 1);
    const pageWidth = p.getWidth();
    const pageHeight = p.getHeight();
    const sx = pageWidth / vp.width;
    const sy = pageHeight / vp.height;

    p.drawImage(embedded, {
      x: 0,
      y: 0,
      width: vp.width * sx,
      height: vp.height * sy,
    });

    const bytes = await originalPdf.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    saveAs(blob, withExt(fileName, 'edited.pdf'));
  };

  const exportAllPagesAsZip = async () => {
    if (!pdf) return;
    const zip = new JSZip();
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({ scale });
      const base = document.createElement('canvas');
      base.width = vp.width;
      base.height = vp.height;
      const bctx = base.getContext('2d');
      await pg.render({ canvasContext: bctx, viewport: vp }).promise;

      const combo = document.createElement('canvas');
      combo.width = base.width;
      combo.height = base.height;
      const cctx = combo.getContext('2d');
      cctx.drawImage(base, 0, 0);
      if (i === pageNumber) {
        cctx.drawImage(annoCanvasRef.current, 0, 0);
      }
      const blob = await new Promise(res => combo.toBlob(res, 'image/png'));
      const buf = new Uint8Array(await blob.arrayBuffer());
      zip.file(`page-${i}.png`, buf);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, withExt(fileName, 'pages.zip'));
  };

  const exportDocxFromText = async () => {
    if (!pdf) return;
    // Reuse text extraction
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(it => it.str);
      text += strings.join(' ') + '\n\n';
    }
    const paragraphs = text.split(/\n\n+/).map(chunk => new Paragraph({ text: chunk }));
    const doc = new DocxDocument({ sections: [{ properties: {}, children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, withExt(fileName, 'docx'));
  };

  const renderPageToPngDataUrl = async (pageIndex) => {
    const pg = await pdf.getPage(pageIndex);
    const vp = pg.getViewport({ scale });
    const base = document.createElement('canvas');
    base.width = vp.width;
    base.height = vp.height;
    const bctx = base.getContext('2d');
    await pg.render({ canvasContext: bctx, viewport: vp }).promise;

    const combo = document.createElement('canvas');
    combo.width = base.width;
    combo.height = base.height;
    const cctx = combo.getContext('2d');
    cctx.drawImage(base, 0, 0);
    if (pageIndex === pageNumber) {
      cctx.drawImage(annoCanvasRef.current, 0, 0);
    }
    return combo.toDataURL('image/png');
  };

  const exportPptx = async () => {
    if (!pdf) return;
    // Detect orientation from first page
    const firstPage = await pdf.getPage(1);
    const firstVp = firstPage.getViewport({ scale: 1 });
    const isPortrait = firstVp.height >= firstVp.width;
    const pptx = new PptxGenJS();
    if (isPortrait) {
      // Define a tall custom layout for portrait pages
      pptx.defineLayout({ name: 'LAYOUT_TALL', width: 7.5, height: 13.33 });
      pptx.layout = 'LAYOUT_TALL';
    } else {
      pptx.layout = 'LAYOUT_WIDE';
    }
    const slideW = pptx.presLayout.width;
    const slideH = pptx.presLayout.height;
    const margin = 0.25; // inches
    const boxW = slideW - margin * 2;
    const boxH = slideH - margin * 2;
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({ scale: 1 });
      const imgAR = vp.width / vp.height;
      const boxAR = boxW / boxH;
      let w, h;
      if (imgAR > boxAR) {
        w = boxW;
        h = w / imgAR;
      } else {
        h = boxH;
        w = h * imgAR;
      }
      const x = (slideW - w) / 2;
      const y = (slideH - h) / 2;
      const dataUrl = await renderPageToPngDataUrl(i);
      const slide = pptx.addSlide();
      slide.addImage({ data: dataUrl, x, y, w, h });
    }
    const blob = await pptx.write('blob');
    saveAs(blob, withExt(fileName, 'pptx'));
  };

  const exportExcel = async () => {
    if (!pdf) return;
    const wb = XLSX.utils.book_new();
    // Try to reconstruct tables: group by line (y), then map items to columns by x
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.map(it => {
        const t = it.transform || it?.matrix || [1,0,0,1,0,0];
        const x = t[4];
        const y = vp.height - t[5]; // invert to top-origin
        return { str: it.str || '', x, y, width: it.width || 0 };
      }).filter(it => it.str.trim().length);

      // Group into lines by y with tolerance
      const yTol = 4; // px
      items.sort((a,b) => a.y - b.y || a.x - b.x);
      const lines = [];
      for (const it of items) {
        let line = lines.find(l => Math.abs(l.y - it.y) <= yTol);
        if (!line) { line = { y: it.y, cells: [] }; lines.push(line); }
        line.cells.push(it);
      }
      lines.forEach(l => l.cells.sort((a,b)=>a.x-b.x));

      // Determine column anchors from first few lines
      const sampleLines = lines.slice(0, Math.min(8, lines.length));
      const anchors = [];
      const xTol = 10;
      for (const l of sampleLines) {
        for (const c of l.cells) {
          const found = anchors.find(a => Math.abs(a - c.x) <= xTol);
          if (!found) anchors.push(c.x);
        }
      }
      anchors.sort((a,b)=>a-b);
      // Merge close anchors
      const merged = [];
      for (const x of anchors) {
        const last = merged[merged.length-1];
        if (last == null || Math.abs(last - x) > xTol) merged.push(x);
      }
      const cols = merged;

      // Build AOA rows
      const aoa = [];
      for (const l of lines) {
        if (!l.cells.length) continue;
        const row = Array(cols.length).fill('');
        for (const c of l.cells) {
          // find nearest column
          let idx = 0, best = Infinity;
          for (let k=0;k<cols.length;k++) {
            const d = Math.abs(cols[k] - c.x);
            if (d < best) { best = d; idx = k; }
          }
          row[idx] = row[idx] ? row[idx] + ' ' + c.str : c.str;
        }
        aoa.push(row);
      }

      const sheetData = aoa.length ? aoa : [[content.items.map(it=>it.str).join(' ')]];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, `Page ${i}`);
    }
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, withExt(fileName, 'xlsx'));
  };

  const exportDocxFromImages = async () => {
    if (!pdf) return;
    const children = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const dataUrl = await renderPageToPngDataUrl(i);
      const res = await fetch(dataUrl);
      const buf = await res.arrayBuffer();
      // Scale image to page width (~720px) keeping aspect ratio
      // Fit inside typical content area (letter: ~624x864 px). Use min fit for both dimensions.
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({ scale });
      const maxW = 620; // content width within margins
      const maxH = 860; // content height within margins
      const fit = Math.min(maxW / vp.width, maxH / vp.height);
      const targetWidth = Math.round(vp.width * fit);
      const targetHeight = Math.round(vp.height * fit);
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({ data: new Uint8Array(buf), transformation: { width: targetWidth, height: targetHeight } })
        ]
      }));
    }
    const doc = new DocxDocument({ sections: [{ properties: {}, children }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, withExt(fileName, 'pages.docx'));
  };

  // Merge multiple PDFs into one
  const handlePickMergeFiles = () => mergeInputRef.current?.click();
  const handleMergeFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length && !fileBytes) return;
    const out = await PDFDocument.create();
    // include current opened PDF first if present
    if (fileBytes) {
      const src = await PDFDocument.load(fileBytes);
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach(p => out.addPage(p));
    }
    for (const f of files) {
      const buf = new Uint8Array(await f.arrayBuffer());
      const src = await PDFDocument.load(buf);
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach(p => out.addPage(p));
    }
    const bytes = await out.save();
    saveAs(new Blob([bytes], { type: 'application/pdf' }), withExt(fileName || 'merged', 'merged.pdf'));
    e.target.value = '';
  };

  // Split current PDF by range
  const exportSplitRange = async () => {
    if (!fileBytes) return;
    const start = Math.max(1, parseInt(splitStart || '1', 10));
    const end = Math.min(pageCount || start, parseInt(splitEnd || String(pageCount), 10));
    if (isNaN(start) || isNaN(end) || start > end) return;
    const src = await PDFDocument.load(fileBytes);
    const out = await PDFDocument.create();
    const indices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
    const copied = await out.copyPages(src, indices);
    copied.forEach(p => out.addPage(p));
    const bytes = await out.save();
    saveAs(new Blob([bytes], { type: 'application/pdf' }), withExt(fileName, `p${start}-p${end}.pdf`));
  };

  // Compress by rasterizing pages to JPEG with lower scale/quality
  const exportCompressed = async () => {
    if (!pdf) return;
    const out = await PDFDocument.create();
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({ scale: Math.max(0.5, Math.min(1.5, compressScale)) });
      const c = document.createElement('canvas');
      c.width = vp.width;
      c.height = vp.height;
      const ctx = c.getContext('2d');
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      const dataUrl = c.toDataURL('image/jpeg', Math.max(0.3, Math.min(0.95, compressQuality)));
      const jpgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
      const img = await out.embedJpg(jpgBytes);
      const page = out.addPage([vp.width, vp.height]);
      page.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
    }
    const bytes = await out.save();
    saveAs(new Blob([bytes], { type: 'application/pdf' }), withExt(fileName, 'compressed.pdf'));
  };

  // Watermark + page numbers
  const exportWithWatermarkAndNumbers = async () => {
    if (!fileBytes) return;
    const src = await PDFDocument.load(fileBytes);
    const pages = src.getPages();
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (watermarkText) {
        p.drawText(watermarkText, {
          x: p.getWidth() / 2 - (watermarkText.length * watermarkSize * 0.15),
          y: p.getHeight() / 2,
          size: watermarkSize,
          color: rgb255(255, 165, 0, watermarkOpacity),
          rotate: { type: 'degrees', angle: 30 },
          opacity: Math.max(0.05, Math.min(0.5, watermarkOpacity))
        });
      }
      if (numberPages) {
        const label = `${i + 1} / ${pages.length}`;
        p.drawText(label, {
          x: p.getWidth() / 2 - (label.length * 6),
          y: 24,
          size: 12,
          color: rgb255(80, 80, 80, 0.9)
        });
      }
    }
    const bytes = await src.save();
    saveAs(new Blob([bytes], { type: 'application/pdf' }), withExt(fileName, 'watermark.pdf'));
  };

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="tool-group">
          <input type="file" accept="application/pdf" onChange={onUpload} />
          <span style={{ color: 'var(--muted)' }}>{fileName || 'No file selected'}</span>
        </div>
        <div className="tool-group">
          <button className={`tool-button ${tool===Tool.Draw?'active':''}`} onClick={()=>setTool(Tool.Draw)}>Draw</button>
          <button className={`tool-button ${tool===Tool.Text?'active':''}`} onClick={()=>setTool(Tool.Text)}>Text</button>
          <button className={`tool-button ${tool===Tool.Highlight?'active':''}`} onClick={()=>setTool(Tool.Highlight)}>Highlight</button>
          <button className={`tool-button ${tool===Tool.Erase?'active':''}`} onClick={()=>setTool(Tool.Erase)}>Erase</button>
          <button className="tool-button" onClick={clearAnnotations}>Clear Page</button>
        </div>
        <div className="tool-group">
          <label>Color <input type="color" value={strokeColor} onChange={e=>setStrokeColor(e.target.value)} /></label>
          <label>Size <input type="range" min="1" max="12" value={strokeWidth} onChange={e=>setStrokeWidth(Number(e.target.value))} /></label>
          <label>Scale <input type="range" min="0.5" max="2" step="0.1" value={scale} onChange={e=>setScale(Number(e.target.value))} /></label>
          <input placeholder="Text tool content" value={textValue} onChange={e=>setTextValue(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #334155', background:'#0b1220', color:'#e5e7eb' }} />
        </div>
      </div>

      <div className="canvas-wrap">
        <div className="page-controls">
          <button className="tool-button" onClick={()=>setPageNumber(p=>Math.max(1, p-1))}>Prev</button>
          <span>Page {pageNumber} / {pageCount || '-'}</span>
          <button className="tool-button" onClick={()=>setPageNumber(p=>Math.min(pageCount||p, p+1))}>Next</button>
        </div>
        <div className="page-stage" style={{ width: viewportSizeRef.current.width, height: viewportSizeRef.current.height }}>
          <canvas ref={baseCanvasRef} />
          <canvas
            ref={annoCanvasRef}
            style={{ position:'absolute', inset:0, cursor: tool===Tool.Draw? 'crosshair':'default' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={()=>setIsDrawing(false)}
          />
        </div>
      </div>

      <div className="export-bar">
        <button className="tool-button" onClick={exportEditedPdf}>Export Edited PDF (current page overlay)</button>
        <button className="tool-button" onClick={exportCurrentPagePng}>Export Current Page PNG</button>
        <button className="tool-button" onClick={exportAllPagesAsZip}>Export All Pages as ZIP (PNG)</button>
        <button className="tool-button" onClick={exportText}>Export TXT (all pages)</button>
        <button className="tool-button" onClick={exportDocxFromText}>Export DOCX (text)</button>
        <button className="tool-button" onClick={exportDocxFromImages}>Export DOCX (pages as images)</button>
        <button className="tool-button" onClick={exportPptx}>Export PPTX (pages as slides)</button>
        <button className="tool-button" onClick={exportExcel}>Export Excel (editable)</button>

        {/* Merge */}
        <button className="tool-button" onClick={handlePickMergeFiles}>Merge with PDFs…</button>
        <input ref={mergeInputRef} type="file" accept="application/pdf" multiple onChange={handleMergeFiles} style={{ display:'none' }} />

        {/* Split */}
        <div className="tool-group">
          <label>Split pages
            <input style={{ width: 48, marginLeft: 6 }} value={splitStart} onChange={e=>setSplitStart(e.target.value)} />
            –
            <input style={{ width: 48, marginLeft: 6 }} value={splitEnd} onChange={e=>setSplitEnd(e.target.value)} placeholder={`${pageCount}`} />
          </label>
          <button className="tool-button" onClick={exportSplitRange}>Export Split</button>
        </div>

        {/* Compress */}
        <div className="tool-group">
          <label>Scale <input type="range" min="0.5" max="1.0" step="0.05" value={compressScale} onChange={e=>setCompressScale(parseFloat(e.target.value))} /></label>
          <label>Quality <input type="range" min="0.3" max="0.95" step="0.05" value={compressQuality} onChange={e=>setCompressQuality(parseFloat(e.target.value))} /></label>
          <button className="tool-button" onClick={exportCompressed}>Export Compressed PDF</button>
        </div>

        {/* Watermark & Page numbers */}
        <div className="tool-group">
          <input placeholder="Watermark text" value={watermarkText} onChange={e=>setWatermarkText(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #334155', background:'#0b1220', color:'#e5e7eb' }} />
          <label>Opacity <input type="range" min="0.05" max="0.5" step="0.05" value={watermarkOpacity} onChange={e=>setWatermarkOpacity(parseFloat(e.target.value))} /></label>
          <label>Size <input type="range" min="18" max="64" step="2" value={watermarkSize} onChange={e=>setWatermarkSize(parseInt(e.target.value,10))} /></label>
          <label><input type="checkbox" checked={numberPages} onChange={e=>setNumberPages(e.target.checked)} /> Page numbers</label>
          <button className="tool-button" onClick={exportWithWatermarkAndNumbers}>Export Watermarked</button>
        </div>
      </div>
    </div>
  );
}

function hexToRgba(hex, alpha) {
  const c = hex.replace('#','');
  const bigint = parseInt(c, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function withExt(name, ext, page) {
  const base = name?.replace(/\.[^.]+$/, '') || 'file';
  if (page) return `${base}-p${page}.${ext}`;
  return `${base}.${ext}`;
}

