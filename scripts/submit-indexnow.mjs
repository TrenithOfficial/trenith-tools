const key = process.env.INDEXNOW_KEY?.trim();
const host = process.env.INDEXNOW_HOST?.trim();
const keyLocation = process.env.INDEXNOW_KEY_LOCATION?.trim();

if (!key || !host || !keyLocation) {
  console.error("Set INDEXNOW_KEY, INDEXNOW_HOST and INDEXNOW_KEY_LOCATION before submitting URLs.");
  process.exit(1);
}

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("Add one or more changed paths, for example: npm run search:indexnow -- / /tools/metadata-remover");
  process.exit(1);
}

const urlList = paths.map((path) => new URL(path, `https://${host}/`).toString());
const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation, urlList }),
});

if (!response.ok) {
  console.error(`IndexNow returned HTTP ${response.status}: ${await response.text()}`);
  process.exit(1);
}

console.log(`Submitted ${urlList.length} changed URL${urlList.length === 1 ? "" : "s"} for ${host}.`);
