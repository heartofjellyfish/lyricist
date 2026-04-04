import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import wndb from "wordnet-db";
import { getLexiconSnapshot, getThemeAliasSnapshot } from "../src/lyricEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "src", "generatedWordnetMap.js");

const POS_FILES = ["noun", "verb", "adj", "adv"];

function normalizeLemma(word) {
  return word.toLowerCase().replaceAll(" ", "_");
}

function lexicalVariants(word) {
  const variants = new Set([normalizeLemma(word)]);
  if (word === "children") {
    variants.add("child");
  } else if (word === "kids") {
    variants.add("kid");
  } else if (word.endsWith("ies") && word.length > 3) {
    variants.add(normalizeLemma(`${word.slice(0, -3)}y`));
  } else if (word.endsWith("s") && word.length > 3) {
    variants.add(normalizeLemma(word.slice(0, -1)));
  }
  return [...variants];
}

function parseIndexOffsets(indexText, targetWords) {
  const lemmaToOffsets = new Map();

  for (const line of indexText.split("\n")) {
    if (!line || line.startsWith("  ")) {
      continue;
    }

    const parts = line.trim().split(/\s+/u);
    const lemma = parts[0];
    if (!targetWords.has(lemma)) {
      continue;
    }

    const synsetCount = Number(parts[2]);
    const pointerCount = Number(parts[3]);
    const offsetsStart = 4 + pointerCount + 2;
    const offsets = parts.slice(offsetsStart, offsetsStart + synsetCount).map(Number);
    lemmaToOffsets.set(lemma, offsets);
  }

  return lemmaToOffsets;
}

function readLineAtOffset(fileText, offset) {
  const nextNewline = fileText.indexOf("\n", offset);
  if (nextNewline === -1) {
    return fileText.slice(offset).trim();
  }
  return fileText.slice(offset, nextNewline).trim();
}

function parseSynsetWords(dataLine) {
  const raw = dataLine.split("|")[0].trim();
  const parts = raw.split(/\s+/u);
  const wordCount = Number.parseInt(parts[3], 16);
  const words = [];

  let cursor = 4;
  for (let index = 0; index < wordCount; index += 1) {
    const word = parts[cursor].toLowerCase().replaceAll("_", " ");
    if (/^[a-z]+(?: [a-z]+)?$/u.test(word) && word.length <= 24) {
      words.push(word);
    }
    cursor += 2;
  }

  return words;
}

async function loadWordnetData(targetWords) {
  const semanticMap = {};

  for (const pos of POS_FILES) {
    const indexText = await fs.readFile(path.join(wndb.path, `index.${pos}`), "utf8");
    const dataText = await fs.readFile(path.join(wndb.path, `data.${pos}`), "utf8");
    const offsetsByLemma = parseIndexOffsets(indexText, targetWords);

    for (const [lemma, offsets] of offsetsByLemma.entries()) {
      if (!semanticMap[lemma]) {
        semanticMap[lemma] = new Set();
      }

      for (const offset of offsets) {
        const line = readLineAtOffset(dataText, offset);
        for (const synonym of parseSynsetWords(line)) {
          if (synonym !== lemma.replaceAll("_", " ")) {
            semanticMap[lemma].add(synonym);
          }
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(semanticMap)
      .map(([lemma, values]) => [lemma.replaceAll("_", " "), [...values].sort().slice(0, 16)])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

async function main() {
  const themeAliases = getThemeAliasSnapshot();
  const rawTargets = new Set([
    ...getLexiconSnapshot().map((entry) => entry.text),
    ...Object.keys(themeAliases),
    ...Object.values(themeAliases).flat(),
  ]);
  const targetWords = new Set([...rawTargets].flatMap((word) => lexicalVariants(word)));
  const semanticMap = await loadWordnetData(targetWords);
  const fileText = `export const WORDNET_SEMANTIC_MAP = ${JSON.stringify(semanticMap, null, 2)};\n`;
  await fs.writeFile(outputPath, fileText, "utf8");
  console.log(JSON.stringify({ entries: Object.keys(semanticMap).length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
