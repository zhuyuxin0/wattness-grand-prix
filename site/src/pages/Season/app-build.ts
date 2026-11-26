// The Wattness Season Mini App on this site: release 7's static build for the web, in
// public/apps/wattness-season/ with its receipt (receipt.json there: the release ZIP's SHA-256,
// the template commit it was built on, and each served file's SHA-256). test/season-app.test.mjs
// holds these constants, the receipt and the files to each other.

/** Where the site serves the App's build; the Season tab frames it in guest mode. */
export const APP_PATH = "/apps/wattness-season/";

/** The App on Flap's host, where a visitor can connect a wallet on BSC testnet. */
export const FLAP_APP_URL = "https://utter.cash/apps/wattness-season";

export const APP_RELEASE = 7;

/** The release's source package for Flap (app:package), as sent to Flap's review. */
export const APP_ZIP_SHA256 = "6328b9b604778510bdb48ebef8687a4a770d61fe42ea4d101aed9c3bc43d43a7";

/** github.com/flap-sh/flap-vault-component-template main, vault-runtime 0.1.50. */
export const APP_TEMPLATE_COMMIT = "b912fd1f89694a723adfba8e4e68757980239766";

/** The App's own message to the page that frames it: its height in CSS pixels. */
export const APP_HEIGHT_MESSAGE = "wattness-season:height";
