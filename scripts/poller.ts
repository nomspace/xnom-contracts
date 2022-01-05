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

const config = buildConfig([44787]);

const operator = new Operator(signers, portals, forwarders, config);

const main = async () => {
  console.log("Poller starting...");
  while (true) {
    try {
      const pendingCommitments = await operator.fetchPendingCommitments();
      if (pendingCommitments.length > 0) {
        console.log(
          `Number of pending commitments: ${pendingCommitments.length}`
        );
        await operator.finalizePendingCommitments(pendingCommitments);
      }
    } catch (e) {
      console.error(e);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
};

main().catch(console.error);
