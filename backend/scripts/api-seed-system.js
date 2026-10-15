"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);

const mode = args.mode || process.env.NODE_ENV || "development";
const runId = args["run-id"];
const statusFile = args["status-file"];
const outputFile = args["output-file"];
const backendRoot = path.resolve(__dirname, "..");

if (!runId || !statusFile || !outputFile) {
  throw new Error(
    "Missing required arguments. Expected --run-id, --status-file, and --output-file.",
  );
}

fs.mkdirSync(path.dirname(statusFile), { recursive: true });
fs.mkdirSync(path.dirname(outputFile), { recursive: true });

const appendOutput = (message) => {
  fs.appendFileSync(outputFile, `${message}\n`);
};

const writeStatus = (status) => {
  fs.writeFileSync(statusFile, `${JSON.stringify(status, null, 2)}\n`);
};

const baseStatus = {
  run_id: runId,
  mode,
  status: "running",
  started_at: new Date().toISOString(),
  finished_at: null,
  output_file: outputFile,
  steps: [
    {
      name: "db_seed_all",
      command: "node scripts/run-sequelize-cli.js <mode> db:seed:all",
      status: "pending",
      started_at: null,
      finished_at: null,
      exit_code: null,
      error: null,
    },
    {
      name: "seed_time_slots",
      command: "node scripts/seed-time-slots.js <mode>",
      status: "pending",
      started_at: null,
      finished_at: null,
      exit_code: null,
      error: null,
    },
  ],
};

const runStep = (stepIndex, command, commandArgs) => {
  const step = baseStatus.steps[stepIndex];
  step.status = "running";
  step.started_at = new Date().toISOString();
  writeStatus(baseStatus);

  appendOutput(`\n[seed-run:${runId}] Starting ${step.name}`);
  appendOutput(
    `[seed-run:${runId}] Command: ${command} ${commandArgs.join(" ")}`,
  );

  const result = spawnSync(command, commandArgs, {
    cwd: backendRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: mode,
    },
  });

  if (result.stdout) {
    appendOutput(result.stdout.trimEnd());
  }
  if (result.stderr) {
    appendOutput(result.stderr.trimEnd());
  }

  const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`;

  step.finished_at = new Date().toISOString();
  step.exit_code = typeof result.status === "number" ? result.status : 1;

  if (result.status !== 0) {
    step.status = "failed";
    step.error = `Command failed with exit code ${step.exit_code}`;
    throw new Error(step.error);
  }

  step.status = "completed";
  writeStatus(baseStatus);
};

const main = async () => {
  writeStatus(baseStatus);
  appendOutput(`[seed-run:${runId}] Background seed started in ${mode} mode`);

  try {
    runStep(0, process.execPath, [
      "scripts/run-sequelize-cli.js",
      mode,
      "db:seed:all",
    ]);

    runStep(1, process.execPath, ["scripts/seed-time-slots.js", mode]);

    baseStatus.status = "completed";
    baseStatus.finished_at = new Date().toISOString();
    writeStatus(baseStatus);
    appendOutput(`[seed-run:${runId}] Seed workflow completed successfully`);
  } catch (error) {
    baseStatus.status = "failed";
    baseStatus.finished_at = new Date().toISOString();
    writeStatus(baseStatus);
    appendOutput(
      `[seed-run:${runId}] Seed workflow failed: ${
        error && error.message ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
};

main().catch((error) => {
  baseStatus.status = "failed";
  baseStatus.finished_at = new Date().toISOString();
  appendOutput(
    `[seed-run:${runId}] Unhandled failure: ${
      error && error.message ? error.message : String(error)
    }`,
  );
  writeStatus(baseStatus);
  process.exitCode = 1;
});
