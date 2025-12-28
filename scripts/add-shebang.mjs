import fs from "fs";

const p = new URL("../dist/cli.js", import.meta.url);
let s = fs.readFileSync(p, "utf8");
if (!s.startsWith("#!/usr/bin/env node")) {
  s = `#!/usr/bin/env node\n${s}`;
  fs.writeFileSync(p, s, "utf8");
}
