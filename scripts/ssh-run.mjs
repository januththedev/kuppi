// One-off helper: run a command on the VM via password SSH auth (used only to
// install the agent key when paste is unavailable). Password comes from env.
import { Client } from "ssh2";

const [host, user, ...cmdParts] = process.argv.slice(2);
const password = process.env.SSH_PASSWORD;
if (!password || !cmdParts.length) {
  console.error("usage: SSH_PASSWORD=... node scripts/ssh-run.mjs host user -- command");
  process.exit(2);
}

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(cmdParts.join(" "), (err, stream) => {
      if (err) throw err;
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => {
        console.log(`\n[exit ${code}]`);
        conn.end();
        process.exitCode = code === 0 ? 0 : 1;
      });
    });
  })
  .on("error", (e) => {
    console.error("SSH error:", e.message);
    process.exit(1);
  })
  .connect({ host, port: 22, username: user, password, readyTimeout: 25000 });
