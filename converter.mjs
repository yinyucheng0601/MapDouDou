export const BOARD_SIZE = 29;

export const STARTER_BEAD_PALETTE = [
  { name: "Black", hex: "#171717" },
  { name: "Cream", hex: "#f4eee2" },
  { name: "White", hex: "#ffffff" },
  { name: "Coral", hex: "#e28770" },
  { name: "Blush", hex: "#e8b4a8" },
  { name: "Rose", hex: "#cb7088" },
  { name: "Red", hex: "#d74b48" },
  { name: "Orange", hex: "#f29e59" },
  { name: "Butter", hex: "#f5d96b" },
  { name: "Lime", hex: "#b8d66a" },
  { name: "Leaf", hex: "#66a860" },
  { name: "Forest", hex: "#3f7a54" },
  { name: "Mint", hex: "#89cfb5" },
  { name: "Sky", hex: "#79bddb" },
  { name: "Ocean", hex: "#3c74c2" },
  { name: "Indigo", hex: "#2e275f" },
  { name: "Lavender", hex: "#6355aa" },
  { name: "Violet", hex: "#7d5cd0" },
  { name: "Plum", hex: "#5b3f8f" },
  { name: "Tan", hex: "#c4a27c" },
  { name: "Brown", hex: "#7b5546" },
  { name: "Fog", hex: "#c6c8cf" },
  { name: "Gray", hex: "#8b8f9c" },
];

const SYMBOLS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZ*@#$%?".split("");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function hexToRgb(hex) {
  const normalized = hex.replace("#", "").trim();
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const int = Number.parseInt(expanded, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

export function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbaKey({ r, g, b, a = 255 }) {
  return `${r},${g},${b},${a}`;
}

function distanceSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function getPixel(imageData, x, y) {
  const { width, data } = imageData;
  const index = (y * width + x) * 4;
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
    a: data[index + 3],
  };
}

function isTransparent(pixel) {
  return pixel.a < 20;
}

function colorsClose(a, b, tolerance) {
  if (isTransparent(a) && isTransparent(b)) {
    return true;
  }

  if (Math.abs(a.a - b.a) > tolerance * 2) {
    return false;
  }

  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance
  );
}

function findCornerSeed(imageData) {
  const corners = [
    getPixel(imageData, 0, 0),
    getPixel(imageData, imageData.width - 1, 0),
    getPixel(imageData, 0, imageData.height - 1),
    getPixel(imageData, imageData.width - 1, imageData.height - 1),
  ];
  const counts = new Map();
  for (const pixel of corners) {
    const key = rgbaKey(pixel);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const [seedKey] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const [r, g, b, a] = seedKey.split(",").map(Number);
  return { r, g, b, a };
}

export function detectBackgroundMask(imageData, tolerance = 16) {
  const { width, height } = imageData;
  const seed = findCornerSeed(imageData);
  const mask = new Uint8Array(width * height);
  const queue = [];

  function enqueue(x, y) {
    const idx = y * width + x;
    if (mask[idx]) {
      return;
    }
    const pixel = getPixel(imageData, x, y);
    if (!colorsClose(pixel, seed, tolerance)) {
      return;
    }
    mask[idx] = 1;
    queue.push([x, y]);
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.length) {
    const [x, y] = queue.shift();
    if (x > 0) enqueue(x - 1, y);
    if (x < width - 1) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y < height - 1) enqueue(x, y + 1);
  }

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const pixel = getPixel(imageData, x, y);
      if (mask[idx] || isTransparent(pixel)) {
        continue;
      }
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return {
      mask,
      seed,
      bounds: { left: 0, top: 0, width, height },
    };
  }

  return {
    mask,
    seed,
    bounds: {
      left,
      top,
      width: right - left + 1,
      height: bottom - top + 1,
    },
  };
}

function averageCellColor(imageData, bounds, mask, cropBackground, col, row, targetWidth, targetHeight) {
  const x0 = bounds.left + (col * bounds.width) / targetWidth;
  const x1 = bounds.left + ((col + 1) * bounds.width) / targetWidth;
  const y0 = bounds.top + (row * bounds.height) / targetHeight;
  const y1 = bounds.top + ((row + 1) * bounds.height) / targetHeight;

  const sx0 = clamp(Math.floor(x0), 0, imageData.width - 1);
  const sx1 = clamp(Math.max(sx0 + 1, Math.ceil(x1)), 1, imageData.width);
  const sy0 = clamp(Math.floor(y0), 0, imageData.height - 1);
  const sy1 = clamp(Math.max(sy0 + 1, Math.ceil(y1)), 1, imageData.height);

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let weight = 0;
  let sampleCount = 0;
  const colorVotes = new Map();

  for (let y = sy0; y < sy1; y += 1) {
    for (let x = sx0; x < sx1; x += 1) {
      const index = y * imageData.width + x;
      if (cropBackground && mask[index]) {
        continue;
      }
      const pixel = getPixel(imageData, x, y);
      if (isTransparent(pixel)) {
        continue;
      }
      const alphaWeight = pixel.a / 255;
      sumR += pixel.r * alphaWeight;
      sumG += pixel.g * alphaWeight;
      sumB += pixel.b * alphaWeight;
      weight += alphaWeight;
      sampleCount += 1;

      const key = rgbaKey({ ...pixel, a: 255 });
      colorVotes.set(key, (colorVotes.get(key) || 0) + 1);
    }
  }

  if (!weight) {
    const cx = clamp(Math.floor((x0 + x1) / 2), 0, imageData.width - 1);
    const cy = clamp(Math.floor((y0 + y1) / 2), 0, imageData.height - 1);
    const index = cy * imageData.width + cx;
    if (cropBackground && mask[index]) {
      return null;
    }
    const pixel = getPixel(imageData, cx, cy);
    if (isTransparent(pixel)) {
      return null;
    }
    return { r: pixel.r, g: pixel.g, b: pixel.b };
  }

  const sortedVotes = [...colorVotes.entries()].sort((a, b) => b[1] - a[1]);
  const [dominantKey, dominantCount] = sortedVotes[0] || [];
  if (dominantKey && (colorVotes.size <= 16 || dominantCount / sampleCount >= 0.5)) {
    const [r, g, b] = dominantKey.split(",").map(Number);
    return { r, g, b };
  }

  return {
    r: Math.round(sumR / weight),
    g: Math.round(sumG / weight),
    b: Math.round(sumB / weight),
  };
}

function rasterizeImage(imageData, options) {
  const { targetWidth, backgroundMode } = options;
  const cropBackground = backgroundMode === "auto";
  const analysis = cropBackground
    ? detectBackgroundMask(imageData)
    : {
        mask: new Uint8Array(imageData.width * imageData.height),
        seed: null,
        bounds: {
          left: 0,
          top: 0,
          width: imageData.width,
          height: imageData.height,
        },
      };

  const { bounds, mask } = analysis;
  const targetHeight = Math.max(1, Math.round((bounds.height / bounds.width) * targetWidth));
  const cells = [];

  for (let row = 0; row < targetHeight; row += 1) {
    const rowCells = [];
    for (let col = 0; col < targetWidth; col += 1) {
      rowCells.push(
        averageCellColor(imageData, bounds, mask, cropBackground, col, row, targetWidth, targetHeight)
      );
    }
    cells.push(rowCells);
  }

  return {
    width: targetWidth,
    height: targetHeight,
    cells,
    analysis,
  };
}

function collectUniqueColors(cells) {
  const unique = new Map();
  for (const row of cells) {
    for (const cell of row) {
      if (!cell) {
        continue;
      }
      const key = rgbaKey({ ...cell, a: 255 });
      const bucket = unique.get(key) || { color: cell, count: 0 };
      bucket.count += 1;
      unique.set(key, bucket);
    }
  }
  return [...unique.values()];
}

function pickWeightedCenters(uniqueColors, count) {
  const sorted = [...uniqueColors].sort((a, b) => b.count - a.count);
  const centers = [sorted[0].color];
  while (centers.length < count && centers.length < sorted.length) {
    let bestCandidate = sorted[0].color;
    let bestScore = -1;
    for (const item of sorted) {
      const nearest = Math.min(...centers.map((center) => distanceSq(item.color, center)));
      const score = nearest * item.count;
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = item.color;
      }
    }
    centers.push(bestCandidate);
  }
  return centers;
}

function runWeightedKMeans(uniqueColors, maxColors, iterations = 14) {
  const clusterCount = Math.min(maxColors, uniqueColors.length);
  let centers = pickWeightedCenters(uniqueColors, clusterCount);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, weight: 0 }));

    for (const item of uniqueColors) {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      centers.forEach((center, index) => {
        const value = distanceSq(item.color, center);
        if (value < nearestDistance) {
          nearestDistance = value;
          nearestIndex = index;
        }
      });

      sums[nearestIndex].r += item.color.r * item.count;
      sums[nearestIndex].g += item.color.g * item.count;
      sums[nearestIndex].b += item.color.b * item.count;
      sums[nearestIndex].weight += item.count;
    }

    centers = centers.map((center, index) => {
      const bucket = sums[index];
      if (!bucket.weight) {
        return center;
      }
      return {
        r: Math.round(bucket.r / bucket.weight),
        g: Math.round(bucket.g / bucket.weight),
        b: Math.round(bucket.b / bucket.weight),
      };
    });
  }

  return centers;
}

function nearestPaletteIndex(color, palette) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  palette.forEach((entry, index) => {
    const value = distanceSq(color, entry.rgb);
    if (value < bestDistance) {
      bestDistance = value;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function assignSymbols(length) {
  return Array.from({ length }, (_, index) => SYMBOLS[index] || `${index + 1}`);
}

function reorderPaletteByUsage(palette, grid) {
  const remap = palette
    .map((entry, index) => ({ ...entry, originalIndex: index }))
    .sort((a, b) => b.count - a.count);
  const lookup = new Map(remap.map((entry, index) => [entry.originalIndex, index]));
  const normalizedGrid = grid.map((row) =>
    row.map((cell) => {
      if (!cell) {
        return null;
      }
      const paletteIndex = lookup.get(cell.paletteIndex);
      const entry = remap[paletteIndex];
      return { paletteIndex, symbol: entry.symbol };
    })
  );

  return {
    palette: remap.map((entry, index) => ({
      ...entry,
      symbol: assignSymbols(remap.length)[index],
    })),
    grid: normalizedGrid,
  };
}

function quantizeToAutoPalette(raster, maxColors) {
  const uniqueColors = collectUniqueColors(raster.cells);
  const centers =
    uniqueColors.length <= maxColors
      ? uniqueColors.map((item) => item.color)
      : runWeightedKMeans(uniqueColors, maxColors);

  const palette = centers.map((center, index) => ({
    name: `Auto ${index + 1}`,
    rgb: center,
    hex: rgbToHex(center),
    count: 0,
    symbol: "",
  }));

  const grid = raster.cells.map((row) =>
    row.map((cell) => {
      if (!cell) {
        return null;
      }
      const paletteIndex = nearestPaletteIndex(cell, palette);
      palette[paletteIndex].count += 1;
      return { paletteIndex, symbol: "" };
    })
  );

  const normalized = reorderPaletteByUsage(
    palette.map((entry, index) => ({ ...entry, symbol: assignSymbols(palette.length)[index] })),
    grid
  );
  return normalized;
}

function quantizeToStarterPalette(raster, maxColors) {
  const expandedPalette = STARTER_BEAD_PALETTE.map((entry) => ({
    ...entry,
    rgb: hexToRgb(entry.hex),
    count: 0,
    symbol: "",
  }));

  const initialCounts = new Map();
  for (const row of raster.cells) {
    for (const cell of row) {
      if (!cell) {
        continue;
      }
      const paletteIndex = nearestPaletteIndex(cell, expandedPalette);
      initialCounts.set(paletteIndex, (initialCounts.get(paletteIndex) || 0) + 1);
    }
  }

  const allowedIndices = [...initialCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([index]) => index);

  const palette = allowedIndices.map((index) => ({
    ...expandedPalette[index],
    count: 0,
    symbol: "",
  }));

  const grid = raster.cells.map((row) =>
    row.map((cell) => {
      if (!cell) {
        return null;
      }
      const paletteIndex = nearestPaletteIndex(cell, palette);
      palette[paletteIndex].count += 1;
      return { paletteIndex, symbol: "" };
    })
  );

  const normalized = reorderPaletteByUsage(
    palette.map((entry, index) => ({ ...entry, symbol: assignSymbols(palette.length)[index] })),
    grid
  );
  return normalized;
}

export function buildBeadPattern(imageData, options) {
  const raster = rasterizeImage(imageData, options);
  const quantized =
    options.paletteMode === "auto"
      ? quantizeToAutoPalette(raster, options.maxColors)
      : quantizeToStarterPalette(raster, options.maxColors);

  const totalBeads = quantized.palette.reduce((sum, entry) => sum + entry.count, 0);
  const boardsWide = Math.ceil(raster.width / BOARD_SIZE);
  const boardsHigh = Math.ceil(raster.height / BOARD_SIZE);

  return {
    width: raster.width,
    height: raster.height,
    totalBeads,
    boardsWide,
    boardsHigh,
    analysis: raster.analysis,
    palette: quantized.palette,
    grid: quantized.grid,
  };
}

export function exportPatternCsv(pattern) {
  const header = ["row", ...Array.from({ length: pattern.width }, (_, index) => index + 1)].join(",");
  const rows = pattern.grid.map((row, rowIndex) => {
    const values = row.map((cell) => (cell ? pattern.palette[cell.paletteIndex].symbol : ""));
    return [rowIndex + 1, ...values].join(",");
  });
  return [header, ...rows].join("\n");
}

export function getCellColor(pattern, cell) {
  if (!cell) {
    return null;
  }
  return pattern.palette[cell.paletteIndex];
}
