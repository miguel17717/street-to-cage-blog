import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import csv from 'csv-parser';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnvFile(path.resolve(__dirname, '.env'));
loadEnvFile(path.resolve(__dirname, '.env.local'));

const DATA_FILE = path.resolve(__dirname, 'data.csv');
const OUTPUT_DIR = path.resolve(__dirname, 'src', 'content', 'blog');
const MODEL = process.env.MODEL || process.env.OPENAI_MODEL || 'gemini-2.5-flash';
const WOKU_BASE_URL = process.env.OPENAI_BASE_URL || process.env.WOKU_BASE_URL || 'https://llm.wokushop.com/v1';

const REQUIRED_COLUMNS = [
  'Fighter',
  'Catchphrase',
  'Aesthetic',
  'Intent Angle',
  'Short Keyword',
  'Aesthetic Keyword',
  'Catchphrase Keyword',
  'Intent Keyword',
  'Pillar Keyword',
  'Pillar Link',
  'PrintBase URL'
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return 3000 + Math.floor(Math.random() * 2001);
}

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function normalizeUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function yamlString(value) {
  return JSON.stringify(String(value || '').replace(/\r?\n/g, ' ').trim());
}

function stripCodeFence(markdown) {
  return String(markdown || '')
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function readCsvRows() {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(DATA_FILE)
      .on('error', reject)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function validateRow(row, rowNumber) {
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !Object.hasOwn(row, column));
  if (missingColumns.length > 0) {
    throw new Error(`Row ${rowNumber} is missing columns: ${missingColumns.join(', ')}`);
  }
}

function createPrompt(row) {
  const pillarLink = normalizeUrl(row['Pillar Link']);
  const printBaseUrl = normalizeUrl(row['PrintBase URL']);

  return `You are an MMA streetwear fashion expert. Write the article in English, using pure Markdown format.

Input data:
- Fighter: ${row.Fighter}
- Catchphrase: ${row.Catchphrase}
- Aesthetic: ${row.Aesthetic}
- Intent Angle: ${row['Intent Angle']}
- Short Keyword: ${row['Short Keyword']}
- Aesthetic Keyword: ${row['Aesthetic Keyword']}
- Catchphrase Keyword: ${row['Catchphrase Keyword']}
- Intent Keyword: ${row['Intent Keyword']}
- Pillar Keyword: ${row['Pillar Keyword']}
- Pillar Link: ${pillarLink}
- PrintBase URL: ${printBaseUrl}

Strict AEO requirements:
1. H1: Must be exactly "${row['Intent Keyword']}". Format it as: # ${row['Intent Keyword']}
2. Quick Answer: Immediately under the H1, write one bold paragraph, maximum 50 words. It must start with a direct answer or definition, with no intro phrase such as "welcome", "in this article", "this guide", or "let's". It must contain the exact phrase "${row['Aesthetic Keyword']}".
3. H2: Subheadings must be natural-language NLP questions users commonly ask, and each H2 must contain the exact phrase "${row['Catchphrase Keyword']}".
4. Formatting: Include at least one bullet-point section.
5. Keyword density: Use the exact phrase "${row['Short Keyword']}" naturally about 2-3 times across the article.
6. Internal Link: Insert the exact phrase "${row['Pillar Keyword']}" as anchor text and link it to "${pillarLink}". Use this Markdown link exactly once: [${row['Pillar Keyword']}](${pillarLink})
7. CTA: At the very end, create a strong purchase call-to-action and link it to "${printBaseUrl}".
8. Output only the Markdown article body. Do not include YAML frontmatter. Do not wrap the answer in code fences.
9. Make the article useful for AI Overview extraction: direct definitions, concise answer-first sections, clear bullets, and natural-language questions.`;
}

function createFrontmatter(row) {
  const today = new Date().toISOString().slice(0, 10);
  const description = `${row['Aesthetic Keyword']} guide for ${row.Fighter}, covering ${row['Catchphrase Keyword']} meaning, styling, and buying intent.`;
  const tags = [row.Fighter, row.Aesthetic, row['Intent Angle']]
    .filter(Boolean)
    .map((tag) => String(tag).trim());

  return `---
title: ${yamlString(row['Intent Keyword'])}
description: ${yamlString(description)}
pubDate: ${today}
tags: ${JSON.stringify(tags)}
issue: ${yamlString(`AEO_DROP // ${row['Intent Angle']}`)}
quickAnswer: ${yamlString(row['Aesthetic Keyword'])}
author: "STREET_TO_CAGE_AEO_EDITOR"
authorRole: "AI_OVERVIEW_SEO_OPERATOR"
relatedDrop: ${yamlString(row['Pillar Keyword'])}
relatedDropPrice: "INTERNAL_LINK"
fullMarkdown: true
---
`;
}

async function generateWithWoku(row) {
  const apiKey = process.env.WOKU_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing WOKU_API_KEY. Set it in .env.local or PowerShell.');
  }

  const client = new OpenAI({
    apiKey,
    baseURL: WOKU_BASE_URL
  });

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: createPrompt(row) }],
    temperature: 0.7
  });

  return stripCodeFence(response.choices?.[0]?.message?.content || '');
}

async function generateWithGoogle(row) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY. Set it in .env.local or PowerShell.');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: createPrompt(row),
    config: {
      temperature: 0.7,
      thinkingConfig: {
        thinkingBudget: 0
      }
    }
  });

  return stripCodeFence(response.text);
}

async function generateArticle(row) {
  if (process.env.WOKU_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_PROVIDER === 'woku') {
    return generateWithWoku(row);
  }

  return generateWithGoogle(row);
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Cannot find data.csv at: ${DATA_FILE}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const rows = await readCsvRows();
  const usedSlugs = new Map();
  const providerName = process.env.WOKU_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_PROVIDER === 'woku'
    ? `Woku (${WOKU_BASE_URL})`
    : 'Google Gemini';

  console.log(`Provider: ${providerName}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Loaded ${rows.length} rows from data.csv`);

  for (const [index, row] of rows.entries()) {
    validateRow(row, index + 2);

    const baseSlug = slugify(row['Intent Keyword']);
    const currentCount = (usedSlugs.get(baseSlug) || 0) + 1;
    usedSlugs.set(baseSlug, currentCount);

    const slug = currentCount === 1 ? baseSlug : `${baseSlug}-${currentCount}`;
    const fileName = `${slug}.md`;
    const outputPath = path.join(OUTPUT_DIR, fileName);

    try {
      const markdown = await generateArticle(row);
      const output = `${createFrontmatter(row)}\n${markdown}\n`;

      fs.writeFileSync(outputPath, output, 'utf8');
      console.log(`[${index + 1}/${rows.length}] Done: ${fileName}`);
    } catch (error) {
      console.error(`[${index + 1}/${rows.length}] Failed: ${row['Intent Keyword']}`);
      console.error(error);
    }

    if (index < rows.length - 1) {
      const delay = randomDelay();
      console.log(`Waiting ${Math.round(delay / 1000)} seconds to avoid rate limits...`);
      await sleep(delay);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
