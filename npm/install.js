#!/usr/bin/env node
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

const REPO = "hypurrquant/defi-cli";
const VERSION = require("./package.json").version;
const BIN_DIR = path.join(__dirname, "bin");

const PLATFORM_MAP = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
};

const platform = `${os.platform()}-${os.arch()}`;
const target = PLATFORM_MAP[platform];

if (!target) {
  console.error(`Unsupported platform: ${platform}`);
  console.error("Supported: darwin-arm64, darwin-x64, linux-x64, linux-arm64");
  console.error("Build from source: cargo install --path crates/defi-cli");
  process.exit(1);
}

console.log(`
  ╔══════════════════════════════════════════╗
  ║                                          ║
  ║     ██████╗ ███████╗███████╗██╗          ║
  ║     ██╔══██╗██╔════╝██╔════╝██║          ║
  ║     ██║  ██║█████╗  █████╗  ██║          ║
  ║     ██║  ██║██╔══╝  ██╔══╝  ██║          ║
  ║     ██████╔╝███████╗██║     ██║          ║
  ║     ╚═════╝ ╚══════╝╚═╝     ╚═╝          ║
  ║                                          ║
  ║     DeFi CLI v${VERSION.padEnd(28)}║
  ║     11 chains · 108 protocols            ║
  ║     hypurrquant.com                      ║
  ║                                          ║
  ╚══════════════════════════════════════════╝
`);

// Ensure bin directory exists
if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

// Try to download pre-built binary from GitHub Releases
const BINARIES = ["defi", "mantle", "defi-mcp"];
const BASE_URL = `https://github.com/${REPO}/releases/download/v${VERSION}`;

let downloaded = false;

function downloadBinary(name) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}/${name}-${target}`;
    const dest = path.join(BIN_DIR, name);

    console.log(`  Downloading ${name} for ${target}...`);

    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode === 302) {
          // Follow redirect
          https
            .get(response.headers.location, (res) => {
              res.pipe(file);
              file.on("finish", () => {
                file.close();
                fs.chmodSync(dest, 0o755);
                console.log(`  ✓ ${name} installed`);
                resolve(true);
              });
            })
            .on("error", () => resolve(false));
        } else if (response.statusCode === 200) {
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            fs.chmodSync(dest, 0o755);
            console.log(`  ✓ ${name} installed`);
            resolve(true);
          });
        } else {
          file.close();
          fs.unlinkSync(dest);
          resolve(false);
        }
      })
      .on("error", () => resolve(false));
  });
}

async function main() {
  // Try downloading pre-built binaries
  for (const name of BINARIES) {
    const ok = await downloadBinary(name);
    if (ok) downloaded = true;
  }

  if (!downloaded) {
    console.log("");
    console.log("  Pre-built binaries not available for this version.");
    console.log("  Building from source with Cargo...");
    console.log("");

    try {
      // Check if cargo is available
      execSync("cargo --version", { stdio: "pipe" });

      // Find the repo root (npm package might be in npm/ subdirectory)
      const repoRoot = path.resolve(__dirname, "..");
      const cargoToml = path.join(repoRoot, "Cargo.toml");

      if (fs.existsSync(cargoToml)) {
        console.log("  Building defi-cli, mantle-cli, defi-mcp...");
        execSync(
          "cargo build --release --bin defi --bin mantle --bin defi-mcp",
          {
            cwd: repoRoot,
            stdio: "inherit",
          }
        );

        // Copy binaries
        for (const name of BINARIES) {
          const src = path.join(repoRoot, "target", "release", name);
          const dest = path.join(BIN_DIR, name);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            fs.chmodSync(dest, 0o755);
            console.log(`  ✓ ${name} built and installed`);
          }
        }
      } else {
        console.log("  Cargo.toml not found. Clone the repo first:");
        console.log(
          "  git clone https://github.com/hypurrquant/defi-cli.git"
        );
        console.log("  cd defi-cli && cargo build --release");
      }
    } catch {
      console.log("  Cargo not found. Install Rust: https://rustup.rs");
      console.log("  Or download binaries from:");
      console.log(`  https://github.com/${REPO}/releases`);
    }
  }

  console.log("");
  console.log("  Usage:");
  console.log("    defi scan --all-chains --once");
  console.log("    defi yield scan --asset USDC");
  console.log("    defi swap --chain mantle --from USDC --to WMNT --amount 100");
  console.log("    mantle whales --token WETH --top 10");
  console.log("");
}

main();
