// Server-only entry: it reads the secrets file, so a browser bundle that imports
// the package index never pulls in the loader or node:fs.
import { loadSecrets } from "@gatelock/core/secrets";
import { CournotClient } from "./index.js";

/** For a provisioned prepaid account; a missing name fails without revealing any value. */
export function clientWithConfiguredKey(): CournotClient {
  const secrets = loadSecrets(["COURNOT_API_KEY"]);
  return new CournotClient({ apiKey: secrets.COURNOT_API_KEY });
}
