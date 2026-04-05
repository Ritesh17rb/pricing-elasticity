/**
 * CSV utilities shared across legacy and Yum-specific loaders.
 * Handles quoted fields, embedded commas, escaped quotes, and basic type coercion.
 */

function parseCSVRow(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function splitCSVLines(csvText) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (current.trim() !== '') {
        lines.push(current);
      }
      current = '';
      if (char === '\r' && next === '\n') {
        i++;
      }
      continue;
    }

    current += char;
  }

  if (current.trim() !== '') {
    lines.push(current);
  }

  return lines;
}

export function coerceCSVValue(value) {
  const trimmed = value.trim();

  if (trimmed === '') return null;
  if (trimmed === 'True' || trimmed === 'true') return true;
  if (trimmed === 'False' || trimmed === 'false') return false;
  if (!Number.isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);

  return trimmed;
}

export function parseCSV(csvText, { coerce = true } = {}) {
  const lines = splitCSVLines(csvText);
  if (lines.length === 0) return [];

  const headers = parseCSVRow(lines[0]).map(header => header.trim());

  return lines.slice(1).map(line => {
    const rawValues = parseCSVRow(line);
    const row = {};

    headers.forEach((header, index) => {
      const rawValue = rawValues[index] ?? '';
      row[header] = coerce ? coerceCSVValue(rawValue) : rawValue;
    });

    return row;
  });
}
