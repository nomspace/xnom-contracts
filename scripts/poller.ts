require("dotenv").config({ path: __dirname + "/.env" });
import { Operator } from "../src/index";
import {
  buildConfig,
  FORWARDERS,
  PORTALS,
  SIGNERS,
} from "../src/configs/default";

const signers = SIGNERS;
const portals = PORTALS;
const forwarders = FORWARDERS;
const POLL_DELAY = Number(process.env.POLL_DELAY) || 10_000;

// const config = buildConfig([44787]);
const config = buildConfig([42220]);

const operator = new Operator(signers, portals, forwarders, config);

const main = async () => {
  console.log("Poller starting...");
  while (true) {
    try {
      const pendingCommitments = await operator.fetchPendingCommitments();
      console.log(
        `Number of pending commitments: ${pendingCommitments.length}`
      );
      if (pendingCommitments.length > 0) {
        await operator.finalizePendingCommitments(pendingCommitments);
      }
    } catch (e) {
      console.error(e);
    }
    await new Promise((r) => setTimeout(r, POLL_DELAY));
  }
};

main().catch(console.error);
