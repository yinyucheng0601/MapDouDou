import {
  BOARD_SIZE,
  buildBeadPattern,
  exportPatternCsv,
  getCellColor,
} from "./converter.mjs";

const state = {
  source: null,
  pattern: null,
};

const elements = {
  imageInput: document.getElementById("imageInput"),
  loadDemoButton: document.getElementById("loadDemoButton"),
  widthInput: document.getElementById("widthInput"),
  widthPresets: document.getElementById("widthPresets"),
  widthValue: document.getElementById("widthValue"),
  heroWidth: document.getElementById("heroWidth"),
  colorInput: document.getElementById("colorInput"),
  colorValue: document.getElementById("colorValue"),
  paletteMode: document.getElementById("paletteMode"),
  backgroundMode: document.getElementById("backgroundMode"),
  symbolToggle: document.getElementById("symbolToggle"),
  exportSheetButton: document.getElementById("exportSheetButton"),
  exportPreviewButton: document.getElementById("exportPreviewButton"),
  exportCsvButton: document.getElementById("exportCsvButton"),
  sourcePreview: document.getElementById("sourcePreview"),
  sourceMeta: document.getElementById("sourceMeta"),
  previewCanvas: document.getElementById("previewCanvas"),
  previewMeta: document.getElementById("previewMeta"),
  sheetCanvas: document.getElementById("sheetCanvas"),
  sheetMeta: document.getElementById("sheetMeta"),
  patternSize: document.getElementById("patternSize"),
  beadCount: document.getElementById("beadCount"),
  boardCount: document.getElementById("boardCount"),
  paletteMeta: document.getElementById("paletteMeta"),
  paletteList: document.getElementById("paletteList"),
};

function currentSettings() {
  return {
    targetWidth: Number(elements.widthInput.value),
    maxColors: Number(elements.colorInput.value),
    paletteMode: elements.paletteMode.value,
    backgroundMode: elements.backgroundMode.value,
  };
}

function updateControlLabels() {
  const width = Number(elements.widthInput.value);
  const colors = Number(elements.colorInput.value);
  elements.widthValue.textContent = `${width} 颗`;
  elements.heroWidth.textContent = `${width} 颗`;
  elements.colorValue.textContent = `${colors} 色`;
  for (const button of elements.widthPresets.querySelectorAll("[data-width]")) {
    button.classList.toggle("is-active", Number(button.dataset.width) === width);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    downloadBlob(blob, filename);
  });
}

function renderPalette(pattern) {
  elements.paletteList.innerHTML = "";
  elements.paletteMeta.textContent = `${pattern.palette.length} 种颜色`;

  for (const entry of pattern.palette) {
    const item = document.createElement("div");
    item.className = "palette-item";

    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.background = entry.hex;

    const label = document.createElement("div");
    label.className = "palette-label";
    label.innerHTML = `<strong>${entry.name}</strong><small>${entry.hex.toUpperCase()}</small>`;

    const symbol = document.createElement("div");
    symbol.className = "palette-symbol";
    symbol.textContent = entry.symbol;

    const count = document.createElement("div");
    count.className = "palette-count";
    count.textContent = `${entry.count} 颗`;

    item.append(swatch, label, symbol, count);
    elements.paletteList.append(item);
  }
}

function drawBeadPreview(canvas, pattern) {
  const maxCanvasWidth = 880;
  const cellSize = Math.max(12, Math.floor(maxCanvasWidth / Math.max(pattern.width, pattern.height)));
  const padding = 22;
  const width = pattern.width * cellSize + padding * 2;
  const height = pattern.height * cellSize + padding * 2;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);

  const checker = 18;
  for (let y = 0; y < height; y += checker) {
    for (let x = 0; x < width; x += checker) {
      ctx.fillStyle = ((x + y) / checker) % 2 === 0 ? "#f8f2e8" : "#efe7d8";
      ctx.fillRect(x, y, checker, checker);
    }
  }

  for (let row = 0; row < pattern.height; row += 1) {
    for (let col = 0; col < pattern.width; col += 1) {
      const cell = pattern.grid[row][col];
      const entry = getCellColor(pattern, cell);
      const x = padding + col * cellSize;
      const y = padding + row * cellSize;

      if (!entry) {
        continue;
      }

      const radius = cellSize * 0.44;
      const centerX = x + cellSize / 2;
      const centerY = y + cellSize / 2;

      ctx.fillStyle = entry.hex;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      ctx.arc(centerX - radius * 0.18, centerY - radius * 0.18, radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(20,18,34,0.14)";
      ctx.lineWidth = Math.max(1, cellSize * 0.05);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  elements.previewMeta.textContent = `${pattern.width} x ${pattern.height} 豆`;
}

function textColorForBackground(hex) {
  const normalized = hex.replace("#", "");
  const rgb = {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
  const luminance = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return luminance > 150 ? "#2c2347" : "#fffaf2";
}

function drawPatternSheet(canvas, pattern, showSymbols) {
  const cellSize = Math.max(18, Math.floor(1040 / Math.max(pattern.width, pattern.height)));
  const padding = 28;
  const topLabelHeight = Math.max(30, Math.floor(cellSize * 1.45));
  const leftLabelWidth = Math.max(34, Math.floor(cellSize * 1.9));
  const legendTitleHeight = 28;
  const legendItemHeight = 28;
  const legendGap = 14;
  const gridWidth = pattern.width * cellSize;
  const gridHeight = pattern.height * cellSize;
  const legendItemWidth = Math.max(180, Math.min(250, Math.floor(gridWidth / 3.2)));
  const itemsPerRow = Math.max(1, Math.floor(gridWidth / legendItemWidth));
  const legendRows = Math.ceil(pattern.palette.length / itemsPerRow);
  const legendHeight =
    legendTitleHeight + legendRows * legendItemHeight + Math.max(20, legendGap + 12);
  const width = leftLabelWidth + gridWidth + padding * 2;
  const height = topLabelHeight + gridHeight + legendHeight + padding * 2;
  const gridX = padding + leftLabelWidth;
  const gridY = padding + topLabelHeight;
  const legendY = gridY + gridHeight + legendGap;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#f4ecdf";
  ctx.fillRect(gridX, gridY, gridWidth, gridHeight);

  ctx.fillStyle = "#665c80";
  ctx.font = `${Math.max(11, Math.floor(cellSize * 0.42))}px "Avenir Next", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let col = 0; col < pattern.width; col += 1) {
    const labelX = gridX + col * cellSize + cellSize / 2;
    const labelY = padding + topLabelHeight / 2;
    ctx.fillText(String(col + 1), labelX, labelY);
  }

  ctx.textAlign = "right";
  for (let row = 0; row < pattern.height; row += 1) {
    const labelX = padding + leftLabelWidth - 8;
    const labelY = gridY + row * cellSize + cellSize / 2;
    ctx.fillText(String(row + 1), labelX, labelY);
  }

  for (let row = 0; row < pattern.height; row += 1) {
    for (let col = 0; col < pattern.width; col += 1) {
      const x = gridX + col * cellSize;
      const y = gridY + row * cellSize;
      const cell = pattern.grid[row][col];
      const entry = getCellColor(pattern, cell);

      ctx.fillStyle = entry ? entry.hex : "#faf6ed";
      ctx.fillRect(x, y, cellSize, cellSize);

      ctx.strokeStyle = "rgba(47, 39, 100, 0.14)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cellSize, cellSize);

      if (showSymbols && entry) {
        ctx.fillStyle = textColorForBackground(entry.hex);
        ctx.font = `${Math.max(12, Math.floor(cellSize * 0.42))}px "Avenir Next", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(entry.symbol, x + cellSize / 2, y + cellSize / 2 + 1);
      }
    }
  }

  ctx.strokeStyle = "rgba(47, 39, 100, 0.52)";
  ctx.lineWidth = 2;
  for (let col = 0; col <= pattern.width; col += BOARD_SIZE) {
    const x = gridX + col * cellSize;
    ctx.beginPath();
    ctx.moveTo(x, gridY);
    ctx.lineTo(x, gridY + gridHeight);
    ctx.stroke();
  }
  for (let row = 0; row <= pattern.height; row += BOARD_SIZE) {
    const y = gridY + row * cellSize;
    ctx.beginPath();
    ctx.moveTo(gridX, y);
    ctx.lineTo(gridX + gridWidth, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(47, 39, 100, 0.78)";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(gridX, gridY, gridWidth, gridHeight);

  ctx.fillStyle = "#2f2764";
  ctx.font = `600 ${Math.max(16, Math.floor(cellSize * 0.68))}px "Avenir Next", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("颜色图例", padding, legendY + 18);

  const swatchSize = 18;
  const legendStartY = legendY + legendTitleHeight;
  const actualLegendItemWidth = gridWidth / itemsPerRow;
  ctx.font = `500 14px "Avenir Next", sans-serif`;
  ctx.textBaseline = "middle";

  pattern.palette.forEach((entry, index) => {
    const legendCol = index % itemsPerRow;
    const legendRow = Math.floor(index / itemsPerRow);
    const itemX = padding + legendCol * actualLegendItemWidth;
    const itemY = legendStartY + legendRow * legendItemHeight;

    ctx.fillStyle = entry.hex;
    ctx.fillRect(itemX, itemY, swatchSize, swatchSize);
    ctx.strokeStyle = "rgba(43, 35, 71, 0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(itemX, itemY, swatchSize, swatchSize);

    ctx.fillStyle = "#2c2347";
    ctx.fillText(
      `${entry.symbol}  ${entry.name}  ${entry.count}颗`,
      itemX + swatchSize + 10,
      itemY + swatchSize / 2
    );
  });

  elements.sheetMeta.textContent = `${pattern.boardsWide} x ${pattern.boardsHigh} 块底板分区`;
}

function updateSummary(pattern) {
  elements.patternSize.textContent = `${pattern.width} x ${pattern.height}`;
  elements.beadCount.textContent = `${pattern.totalBeads} 颗`;
  elements.boardCount.textContent = `${pattern.boardsWide} x ${pattern.boardsHigh}`;
}

function rebuildPattern() {
  if (!state.source) {
    return;
  }

  state.pattern = buildBeadPattern(state.source.imageData, currentSettings());
  renderPalette(state.pattern);
  drawBeadPreview(elements.previewCanvas, state.pattern);
  drawPatternSheet(elements.sheetCanvas, state.pattern, elements.symbolToggle.checked);
  updateSummary(state.pattern);
}

function setSource(source) {
  state.source = source;
  elements.sourcePreview.src = source.previewUrl;
  elements.sourceMeta.textContent = `${source.imageData.width} x ${source.imageData.height}px`;
  rebuildPattern();
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({
        imageData,
        previewUrl: url,
      });
    };
    image.onerror = () => reject(new Error("无法读取图片文件。"));
    image.src = url;
  });
}

function drawRect(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function createDemoSource() {
  const canvas = document.createElement("canvas");
  const scale = 10;
  canvas.width = 48 * scale;
  canvas.height = 48 * scale;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);

  const coral = "#e28770";
  const purple = "#6355aa";
  const deep = "#2e275f";
  const cream = "#f4eee2";
  const black = "#171717";

  drawRect(ctx, 8, 22, 32, 20, coral);
  drawRect(ctx, 0, 26, 8, 7, coral);
  drawRect(ctx, 40, 26, 8, 7, coral);
  drawRect(ctx, 12, 42, 4, 6, coral);
  drawRect(ctx, 20, 42, 4, 6, coral);
  drawRect(ctx, 28, 42, 4, 6, coral);
  drawRect(ctx, 12, 21, 2, 1, coral);
  drawRect(ctx, 34, 21, 2, 1, coral);

  drawRect(ctx, 6, 18, 36, 4, purple);
  drawRect(ctx, 8, 16, 32, 2, deep);
  drawRect(ctx, 10, 6, 28, 10, purple);
  drawRect(ctx, 14, 2, 20, 4, purple);
  drawRect(ctx, 18, 0, 12, 2, purple);
  drawRect(ctx, 7, 6, 3, 4, purple);
  drawRect(ctx, 6, 10, 4, 4, purple);
  drawRect(ctx, 38, 6, 2, 6, purple);
  drawRect(ctx, 40, 10, 2, 4, purple);

  drawRect(ctx, 13, 8, 2, 2, cream);
  drawRect(ctx, 22, 4, 2, 2, cream);
  drawRect(ctx, 30, 8, 2, 2, cream);
  drawRect(ctx, 11, 18, 2, 2, cream);
  drawRect(ctx, 27, 18, 2, 2, cream);
  drawRect(ctx, 35, 20, 2, 2, cream);

  drawRect(ctx, 13, 23, 3, 4, black);
  drawRect(ctx, 30, 23, 3, 4, black);

  return {
    imageData: ctx.getImageData(0, 0, 48, 48),
    previewUrl: canvas.toDataURL("image/png"),
  };
}

function attachEvents() {
  elements.imageInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }
    const source = await readImageFile(file);
    setSource(source);
  });

  elements.loadDemoButton.addEventListener("click", () => {
    setSource(createDemoSource());
  });

  [elements.widthInput, elements.colorInput].forEach((input) => {
    input.addEventListener("input", () => {
      updateControlLabels();
      rebuildPattern();
    });
  });

  elements.widthPresets.addEventListener("click", (event) => {
    const target = event.target.closest("[data-width]");
    if (!target) {
      return;
    }
    elements.widthInput.value = target.dataset.width;
    updateControlLabels();
    rebuildPattern();
  });

  [elements.paletteMode, elements.backgroundMode, elements.symbolToggle].forEach((input) => {
    input.addEventListener("change", rebuildPattern);
  });

  elements.exportSheetButton.addEventListener("click", () => {
    if (!state.pattern) {
      return;
    }
    downloadCanvas(elements.sheetCanvas, "bead-pattern-sheet.png");
  });

  elements.exportPreviewButton.addEventListener("click", () => {
    if (!state.pattern) {
      return;
    }
    downloadCanvas(elements.previewCanvas, "bead-pattern-preview.png");
  });

  elements.exportCsvButton.addEventListener("click", () => {
    if (!state.pattern) {
      return;
    }
    const csv = exportPatternCsv(state.pattern);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "bead-pattern.csv");
  });
}

updateControlLabels();
attachEvents();
setSource(createDemoSource());
