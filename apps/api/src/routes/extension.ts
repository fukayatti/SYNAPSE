import { Hono } from "hono";
import { promises as fs } from "fs";
import * as fsSync from "fs";
import path from "path";

const extensionRoutes = new Hono();

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.parse(dir).root) {
    if (fsSync.existsSync(path.join(dir, "turbo.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

extensionRoutes.get("/:modId/:filename", async (c) => {
  const modId = c.req.param("modId");
  const filename = c.req.param("filename");

  // Path traversal guard
  if (modId.includes("..") || filename.includes("..")) {
    return c.text("Bad Request", 400);
  }

  const projectRoot = findProjectRoot(process.cwd());
  const filePath = path.join(projectRoot, "FesOrder-Extension-Sample", filename);

  try {
    const content = await fs.readFile(filePath);
    
    let contentType = "text/plain";
    if (filename.endsWith(".js")) {
      contentType = "application/javascript";
    } else if (filename.endsWith(".css")) {
      contentType = "text/css";
    } else if (filename.endsWith(".json")) {
      contentType = "application/json";
    }

    return c.body(content, 200, {
      "Content-Type": contentType,
    });
  } catch (err) {
    console.error(`[Extension API] Failed to serve dynamic extension asset from: ${filePath}`, err);
    return c.text("Asset not found", 404);
  }
});

export default extensionRoutes;
