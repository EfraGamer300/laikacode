import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GITHUB_OWNER = "EfraGamer300";
const GITHUB_REPO = "laikacode";

export function getCurrentVersion(): string {
  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return pkg.version;
}

function parseSemver(v: string): [number, number, number] {
  const m = v.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

function compareVersions(a: string, b: string): number {
  const [a1, a2, a3] = parseSemver(a);
  const [b1, b2, b3] = parseSemver(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  current: string;
  latest: string;
  body: string;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const current = getCurrentVersion();
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) {
      return { hasUpdate: false, current, latest: current, body: "" };
    }
    const data = await res.json() as { tag_name: string; body: string };
    const latest = data.tag_name;
    return {
      hasUpdate: compareVersions(latest, current) > 0,
      current,
      latest,
      body: data.body || "",
    };
  } catch {
    return { hasUpdate: false, current, latest: current, body: "" };
  }
}

export async function performUpdate(
  onOutput?: (line: string) => void
): Promise<{ success: boolean; message: string }> {
  const isGitRepo = fs.existsSync(path.join(ROOT, ".git"));

  if (isGitRepo) {
    try {
      onOutput?.("Pulling latest changes from GitHub...");
      const pull = execSync("git pull origin master", {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 30000,
      });
      onOutput?.(pull.trim());

      onOutput?.("Installing dependencies...");
      const install = execSync("npm install --production 2>&1 || true", {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 60000,
      });
      onOutput?.(install.trim());

      const newVersion = getCurrentVersion();
      return { success: true, message: `Updated to v${newVersion}` };
    } catch (e: any) {
      return { success: false, message: `Update failed: ${e.message}` };
    }
  }

  // Not a git repo — download release tarball
  try {
    const info = await checkForUpdates();
    if (!info.hasUpdate) {
      return { success: true, message: "Already on the latest version." };
    }

    onOutput?.(`Downloading v${info.latest}...`);
    const tarUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/tags/${info.latest}.tar.gz`;

    const res = await fetch(tarUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      return { success: false, message: `Failed to download: ${res.status}` };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const tmpTar = path.join(ROOT, `.update-${info.latest}.tar.gz`);
    fs.writeFileSync(tmpTar, buf);

    onOutput?.("Extracting...");
    execSync(`tar xzf "${tmpTar}" --strip-components=1 -C "${ROOT}"`, {
      cwd: ROOT,
      timeout: 15000,
    });
    fs.unlinkSync(tmpTar);

    onOutput?.("Installing dependencies...");
    execSync("npm install --production 2>&1 || true", {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 60000,
    });

    return { success: true, message: `Updated to v${info.latest}` };
  } catch (e: any) {
    return { success: false, message: `Update failed: ${e.message}` };
  }
}
