import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { PUBLIC_DIR } from "../server/config.js";
import { resolveStaticPath } from "../server/static.js";

test("serves index for /", () => {
  assert.equal(resolveStaticPath(PUBLIC_DIR, "/"), path.join(PUBLIC_DIR, "index.html"));
});

test("resolves files inside public/", () => {
  assert.equal(resolveStaticPath(PUBLIC_DIR, "/js/main.js"), path.join(PUBLIC_DIR, "js", "main.js"));
});

test("refuses traversal, dotfiles and malformed paths", () => {
  for (const bad of [
    "/.env",
    "/../.env",
    "/../server/app.js",
    "/%2e%2e/server/app.js",
    "/js/../../.env",
    "/.git/config",
    "/assets/.hidden",
    "/%E0%A4%A",
    "/foo%00.html",
    "/..\\server\\app.js"
  ]) {
    assert.equal(resolveStaticPath(PUBLIC_DIR, bad), null, bad);
  }
});
