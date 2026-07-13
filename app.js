/* global PDFLib, pdfjsLib, JSZip */

const { PDFDocument, degrees } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const toolInfo = {
  merge: {
    title: "Merge PDF",
    description: "Choose two or more PDFs and we will combine them in the selected order.",
  },
  split: {
    title: "Split PDF",
    description: "Choose the pages you want to keep, then download them as a new PDF.",
  },
  images: {
    title: "Images to PDF",
    description: "Turn JPG and PNG photos into one polished PDF document.",
  },
  "pdf-images": {
    title: "PDF to images",
    description: "Export each page of a PDF as a high-quality PNG image.",
  },
  rotate: {
    title: "Rotate pages",
    description: "Rotate every page in a PDF to fix its orientation.",
  },
};

const workbench = document.querySelector("#workbench");
const workbenchTitle = document.querySelector("#workbenchTitle");
const workbenchDescription = document.querySelector("#workbenchDescription");
const resultBox = document.querySelector("#resultBox");
const toolCards = [...document.querySelectorAll("[data-tool]")];

document.querySelector("#year").textContent = new Date().getFullYear();

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}

function showTool(tool) {
  if (!toolInfo[tool]) return;
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tool;
  });
  workbenchTitle.textContent = toolInfo[tool].title;
  workbenchDescription.textContent = toolInfo[tool].description;
  resultBox.hidden = true;
  resultBox.classList.remove("error");
  workbench.hidden = false;
  workbench.scrollIntoView({ behavior: "smooth", block: "start" });
}

toolCards.forEach((card) => card.addEventListener("click", () => showTool(card.dataset.tool)));
document.querySelectorAll("[data-open-tool]").forEach((button) => {
  button.addEventListener("click", () => showTool(button.dataset.openTool));
});
document.querySelector("#backToTools").addEventListener("click", () => {
  workbench.hidden = true;
  document.querySelector("#tools").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("#toolSearch").addEventListener("input", (event) => {
  const term = event.target.value.trim().toLowerCase();
  let matches = 0;
  document.querySelectorAll("#toolGrid > .tool-card").forEach((card) => {
    const visible = !term || card.dataset.search?.includes(term);
    card.hidden = !visible;
    if (visible && !card.classList.contains("coming-soon")) matches += 1;
  });
  document.querySelector("#emptySearch").hidden = matches > 0 || !term;
});

function updateFileList(input, targetId) {
  const target = document.querySelector(`#${targetId}`);
  target.innerHTML = "";
  [...input.files].forEach((file) => {
    const fileRow = document.createElement("div");
    fileRow.className = "file-pill";
    const name = document.createElement("strong");
    name.textContent = file.name;
    const size = document.createElement("span");
    size.textContent = formatSize(file.size);
    fileRow.append(name, size);
    target.append(fileRow);
  });
}

const fileBindings = [
  ["mergeInput", "mergeFiles"],
  ["splitInput", "splitFiles"],
  ["imagesInput", "imagesFiles"],
  ["pdfImagesInput", "pdfImagesFiles"],
  ["rotateInput", "rotateFiles"],
];

fileBindings.forEach(([inputId, listId]) => {
  const input = document.querySelector(`#${inputId}`);
  input.addEventListener("change", () => updateFileList(input, listId));
});

document.querySelectorAll("[data-dropzone]").forEach((zone) => {
  const input = zone.querySelector("input[type=file]");
  ["dragenter", "dragover"].forEach((eventName) => zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    zone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((eventName) => zone.addEventListener(eventName, (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragging");
  }));
  zone.addEventListener("drop", (event) => {
    const incoming = [...event.dataTransfer.files];
    const permitted = incoming.filter((file) => {
      if (input.accept.includes("application/pdf")) return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      return ["image/jpeg", "image/png"].includes(file.type);
    });
    if (!input.multiple && permitted.length > 1) permitted.splice(1);
    const transfer = new DataTransfer();
    permitted.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => runAction(button));
});

async function runAction(button) {
  const action = button.dataset.action;
  button.disabled = true;
  const originalContent = button.innerHTML;
  button.textContent = "Processing…";
  resultBox.hidden = true;

  try {
    if (action === "merge") await mergePdfs();
    if (action === "split") await splitPdf();
    if (action === "images") await imagesToPdf();
    if (action === "pdf-images") await pdfToImages();
    if (action === "rotate") await rotatePdf();
  } catch (error) {
    console.error(error);
    showResult(error.message || "We could not process that file. Please check it and try again.", true);
  } finally {
    button.disabled = false;
    button.innerHTML = originalContent;
  }
}

async function mergePdfs() {
  const files = [...document.querySelector("#mergeInput").files];
  if (files.length < 2) throw new Error("Choose at least two PDF files to merge.");
  const output = await PDFDocument.create();
  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer());
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  downloadBytes(await output.save(), "merged-pdfast.pdf");
  showResult("Your merged PDF has downloaded. Your original files stayed in this browser.");
}

async function splitPdf() {
  const file = document.querySelector("#splitInput").files[0];
  const range = document.querySelector("#pageRange").value.trim();
  if (!file) throw new Error("Choose a PDF file first.");
  if (!range) throw new Error("Enter the pages you want to extract, for example: 1-3, 5.");
  const source = await PDFDocument.load(await file.arrayBuffer());
  const pagesToKeep = parsePageRange(range, source.getPageCount());
  if (!pagesToKeep.length) throw new Error("Enter a valid page range.");
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, pagesToKeep);
  pages.forEach((page) => output.addPage(page));
  downloadBytes(await output.save(), `${baseName(file.name)}-pages.pdf`);
  showResult(`Created a PDF with ${pagesToKeep.length} page${pagesToKeep.length === 1 ? "" : "s"}.`);
}

async function imagesToPdf() {
  const files = [...document.querySelector("#imagesInput").files];
  const format = document.querySelector("#pageFormat").value;
  if (!files.length) throw new Error("Choose at least one JPG or PNG image.");
  const output = await PDFDocument.create();
  const a4 = [595.28, 841.89];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    const image = isPng ? await output.embedPng(buffer) : await output.embedJpg(buffer);
    const page = format === "fit" ? output.addPage([image.width, image.height]) : output.addPage(a4);
    const margin = format === "fit" ? 0 : 36;
    const scale = Math.min((page.getWidth() - margin * 2) / image.width, (page.getHeight() - margin * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
  }
  downloadBytes(await output.save(), "images-pdfast.pdf");
  showResult(`Created a ${files.length}-page PDF from your image${files.length === 1 ? "" : "s"}.`);
}

async function pdfToImages() {
  const file = document.querySelector("#pdfImagesInput").files[0];
  const scale = Number(document.querySelector("#imageQuality").value);
  if (!file) throw new Error("Choose a PDF file first.");
  const source = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const images = [];
  for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
    const page = await source.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    images.push(await canvasToBlob(canvas));
  }
  if (images.length === 1) {
    downloadBlob(images[0], `${baseName(file.name)}-page-1.png`);
  } else {
    const zip = new JSZip();
    images.forEach((image, index) => zip.file(`${baseName(file.name)}-page-${index + 1}.png`, image));
    downloadBlob(await zip.generateAsync({ type: "blob" }), `${baseName(file.name)}-images.zip`);
  }
  showResult(`Exported ${images.length} page${images.length === 1 ? "" : "s"} as PNG ${images.length === 1 ? "image" : "images in a ZIP"}.`);
}

async function rotatePdf() {
  const file = document.querySelector("#rotateInput").files[0];
  const rotation = Number(document.querySelector("#rotateDegrees").value);
  if (!file) throw new Error("Choose a PDF file first.");
  const source = await PDFDocument.load(await file.arrayBuffer());
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, source.getPageIndices());
  pages.forEach((page) => {
    page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
    output.addPage(page);
  });
  downloadBytes(await output.save(), `${baseName(file.name)}-rotated.pdf`);
  showResult("Your rotated PDF has downloaded.");
}

function parsePageRange(value, pageCount) {
  const pages = new Set();
  value.split(",").map((item) => item.trim()).filter(Boolean).forEach((part) => {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Use page numbers like 1-3, 5, 8-10.");
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > pageCount) throw new Error(`Choose pages between 1 and ${pageCount}.`);
    for (let index = first; index <= last; index += 1) pages.add(index - 1);
  });
  return [...pages].sort((a, b) => a - b);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error("Could not create an image from this PDF page."));
  }, "image/png"));
}

function downloadBytes(bytes, name) {
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), name);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName(fileName) {
  return fileName.replace(/\.[^/.]+$/, "") || "pdfast-file";
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showResult(message, isError = false) {
  resultBox.textContent = message;
  resultBox.hidden = false;
  resultBox.classList.toggle("error", isError);
  resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
