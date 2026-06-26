const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourcePath = path.join(__dirname, "content.js");
const source = fs.readFileSync(sourcePath, "utf8");

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  let braceIndex = source.indexOf("{", start);
  let depth = 0;
  for (let i = braceIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unclosed function: ${name}`);
}

const sandbox = {};
vm.createContext(sandbox);
[
  "normalizeRecommendMatchText",
  "containsRecommendCandidateName",
  "scoreRecommendCardMeta",
  "sortRecommendCardMetas",
].forEach((name) => {
  vm.runInContext(extractFunction(name), sandbox, { filename: "content.js" });
});

assert.strictEqual(
  sandbox.containsRecommendCandidateName("王 禹\n涵  销售", "王禹涵"),
  true,
  "split name should match after whitespace normalization",
);

const ranked = sandbox.sortRecommendCardMetas(
  [
    {
      id: "ancestor",
      text: "王禹涵 销售 打招呼",
      left: 0,
      top: 340,
      width: 1100,
      height: 260,
      depth: 1,
      hasDirectGreetButton: true,
      hasRecommendAction: true,
    },
    {
      id: "name-only",
      text: "王 禹\n涵 销售",
      left: 30,
      top: 360,
      width: 420,
      height: 150,
      depth: 3,
      hasDirectGreetButton: false,
      hasRecommendAction: false,
    },
    {
      id: "card",
      text: "王 禹\n涵 销售 打招呼",
      left: 18,
      top: 350,
      width: 980,
      height: 170,
      depth: 2,
      hasDirectGreetButton: true,
      hasRecommendAction: true,
    },
  ],
  "王禹涵",
  1360,
  430,
);

assert.strictEqual(ranked[0].id, "card", "smallest matching card with direct greet button should rank first");
assert.strictEqual(ranked.every((item) => item.id !== "name-only"), true, "name-only inner block without action should be excluded");

console.log("recommend greet helper tests passed");
