import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Lazy-load the OWS native module (NAPI binding, requires CJS require). */
export function loadOws(): any {
  try {
    return _require("@open-wallet-standard/core");
  } catch {
    throw new Error(
      "OWS not installed. Run: curl -fsSL https://docs.openwallet.sh/install.sh | bash",
    );
  }
}
