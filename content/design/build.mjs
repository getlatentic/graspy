#!/usr/bin/env node
// Writes the web's and Android's token files from tokens.json.
//   node content/design/build.mjs          regenerate
//   node content/design/build.mjs --check  exit 1 when a generated file is stale
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SOURCE = join(HERE, "tokens.json");
const ANDROID_SOURCE = "apps/mobile/app/src/main";
const TARGETS = {
  css: "apps/web/src/design/tokens.css",
  kotlin: `${ANDROID_SOURCE}/java/com/latentic/graspy/ui/GraspyTokens.kt`,
  xml: `${ANDROID_SOURCE}/res/values/graspy_tokens.xml`,
  pageCss: `${ANDROID_SOURCE}/assets/app-host/tokens.css`,
};
const REGENERATE = "node content/design/build.mjs";

/** Hash of everything that decides the output, so a stale file names itself. */
function sourceHash() {
  const hash = createHash("sha256");
  hash.update(readFileSync(SOURCE));
  hash.update(readFileSync(fileURLToPath(import.meta.url)));
  return hash.digest("hex");
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The stamp line carries both hashes; the content hash covers every line after it. */
function stamp(prefix, body, suffix = "") {
  return `${prefix}graspy-tokens source=${sourceHash()} content=${sha256(body)}${suffix}\n${body}`;
}

const rem = (px) => `${px / 16}rem`;
const pascal = (name) =>
  name
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
const textName = (name) => (/^\d/.test(name) ? `Xl${name[0]}` : pascal(name));
const fontStack = ({ family, fallback }) =>
  [`"${family}"`, ...fallback].join(", ");

function cssColors(tokens) {
  return Object.entries(tokens.color).map(
    ([name, { value, description }]) =>
      `  /* ${description} */\n  --color-${name}: ${value};`,
  );
}

function cssText(tokens) {
  return Object.entries(tokens.text).map(([name, step]) => {
    const lines = [
      `  --text-${name}: ${rem(step.size)};`,
      `  --text-${name}--line-height: calc(${step.lineHeight} / ${step.size});`,
    ];
    if (step.letterSpacing !== undefined) {
      lines.push(`  --text-${name}--letter-spacing: ${step.letterSpacing}em;`);
    }
    return lines.join("\n");
  });
}

function renderCss(tokens) {
  const body = [
    `/* Generated from content/design/tokens.json; do not edit. Regenerate: ${REGENERATE} */`,
    "@theme {",
    ...cssColors(tokens),
    "",
    ...Object.entries(tokens.font).map(
      ([name, font]) => `  --font-${name}: ${fontStack(font)};`,
    ),
    "",
    ...cssText(tokens),
    "",
    ...Object.entries(tokens.radius).map(
      ([name, { value }]) => `  --radius-${name}: ${value}px;`,
    ),
    "",
    `  --spacing: ${rem(tokens.space.unit.value)};`,
    "}",
    "",
  ].join("\n");
  return stamp("/* ", body, " */");
}

function kotlinDoc(description, indent = "    ") {
  return description ? [`${indent}/** ${description} */`] : [];
}

function kotlinColors(tokens) {
  return Object.entries(tokens.color).flatMap(([name, { value, description }]) => [
    ...kotlinDoc(description),
    `    val ${pascal(name)} = Color(0xFF${value.slice(1).toUpperCase()})`,
  ]);
}

function kotlinText(tokens) {
  return Object.entries(tokens.text).flatMap(([name, step]) => {
    const spacing =
      step.letterSpacing === undefined ? "" : `, letterSpacing = (${step.letterSpacing}).em`;
    return [
      ...kotlinDoc(step.description),
      `    val ${textName(name)} = TextStyle(fontSize = ${step.size}.sp, lineHeight = ${step.lineHeight}.sp${spacing})`,
    ];
  });
}

const VARIABLE_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

function kotlinFont(name, font) {
  const { android } = font;
  const faces = android.variable
    ? VARIABLE_WEIGHTS.map(
        (weight) =>
          `    Font(R.font.${android.variable}, FontWeight.W${weight}, variationSettings = FontVariation.Settings(FontVariation.weight(${weight}))),`,
      )
    : Object.entries(android.static).map(
        ([weight, file]) => `    Font(R.font.${file}, FontWeight.W${weight}),`,
      );
  return [
    ...kotlinDoc(font.description, ""),
    `val ${pascal(name)}Font = FontFamily(`,
    ...faces,
    ")",
  ];
}

function renderKotlin(tokens) {
  const body = [
    `// Generated from content/design/tokens.json; do not edit. Regenerate: ${REGENERATE}`,
    "@file:OptIn(ExperimentalTextApi::class)",
    "",
    "package com.latentic.graspy.ui",
    "",
    "import androidx.compose.ui.graphics.Color",
    "import androidx.compose.ui.text.ExperimentalTextApi",
    "import androidx.compose.ui.text.TextStyle",
    "import androidx.compose.ui.text.font.Font",
    "import androidx.compose.ui.text.font.FontFamily",
    "import androidx.compose.ui.text.font.FontVariation",
    "import androidx.compose.ui.text.font.FontWeight",
    "import androidx.compose.ui.unit.Dp",
    "import androidx.compose.ui.unit.dp",
    "import androidx.compose.ui.unit.em",
    "import androidx.compose.ui.unit.sp",
    "import com.latentic.graspy.R",
    "",
    "object GraspyColor {",
    ...kotlinColors(tokens),
    "}",
    "",
    ...Object.entries(tokens.font).flatMap(([name, font]) => [...kotlinFont(name, font), ""]),
    "object GraspyText {",
    ...kotlinText(tokens),
    "}",
    "",
    "object GraspyRadius {",
    ...Object.entries(tokens.radius).flatMap(([name, { value, description }]) => [
      ...kotlinDoc(description),
      `    val ${pascal(name)} = ${value}.dp`,
    ]),
    "}",
    "",
    ...kotlinDoc(tokens.space.unit.description, ""),
    `val SpaceUnit = ${tokens.space.unit.value}.dp`,
    "",
    "/** A gap of [steps] spacing steps: `space(4)` is the web's `p-4`. */",
    "fun space(steps: Number): Dp = SpaceUnit * steps.toFloat()",
    "",
  ].join("\n");
  return stamp("// ", body);
}

function renderXml(tokens) {
  const body = [
    `<!-- Generated from content/design/tokens.json; do not edit. Regenerate: ${REGENERATE} -->`,
    '<resources xmlns:tools="http://schemas.android.com/tools" tools:ignore="UnusedResources">',
    ...Object.entries(tokens.color).map(
      ([name, { value }]) => `    <color name="graspy_${name.replaceAll("-", "_")}">${value}</color>`,
    ),
    "</resources>",
    "",
  ].join("\n");
  return stamp('<?xml version="1.0" encoding="utf-8"?>\n<!-- ', body, " -->");
}

/** Plain CSS variables for the pages the Android app draws in a WebView, such as the tutor's replies. */
function renderPageCss(tokens) {
  const body = [
    `/* Generated from content/design/tokens.json; do not edit. Regenerate: ${REGENERATE} */`,
    ":root {",
    ...Object.entries(tokens.color).map(([name, { value }]) => `  --color-${name}: ${value};`),
    ...Object.entries(tokens.font).map(([name, font]) => `  --font-${name}: ${fontStack(font)};`),
    ...Object.entries(tokens.radius).map(([name, { value }]) => `  --radius-${name}: ${value}px;`),
    `  --spacing: ${rem(tokens.space.unit.value)};`,
    "}",
    "",
  ].join("\n");
  return stamp("/* ", body, " */");
}

const RENDERERS = { css: renderCss, kotlin: renderKotlin, xml: renderXml, pageCss: renderPageCss };

function outputs() {
  const tokens = JSON.parse(readFileSync(SOURCE, "utf8"));
  return Object.entries(TARGETS).map(([kind, path]) => ({
    path: join(ROOT, path),
    text: RENDERERS[kind](tokens),
  }));
}

function readOrEmpty(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function check() {
  const stale = outputs().filter(({ path, text }) => readOrEmpty(path) !== text);
  for (const { path } of stale) {
    console.error(`${relative(ROOT, path)} does not match content/design/tokens.json. Run: ${REGENERATE}`);
  }
  return stale.length === 0;
}

if (process.argv.includes("--check")) {
  process.exit(check() ? 0 : 1);
}
for (const { path, text } of outputs()) {
  writeFileSync(path, text);
  console.log(`wrote ${relative(ROOT, path)}`);
}
