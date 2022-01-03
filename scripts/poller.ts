require("dotenv").config({ path: __dirname + "/.env" });
import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "ethers";
import { Operator } from "../src/index";
import { ReservePortal__factory } from "../typechain/factories/ReservePortal__factory";
import { CeloProvider, CeloWallet } from "@celo-tools/celo-ethers-wrapper";
import { buildConfig } from "../src/configs/default";
import { OwnableMinimalForwarder__factory } from "../typechain/factories/OwnableMinimalForwarder__factory";

const { PRIVATE_KEY } = process.env;
if (!PRIVATE_KEY) {
  console.warn("PRIVATE_KEY not specified");
}
const fallbackPrivateKey =
  "40ea2e72b6ea949a54974973083215fec2d6f2e2963f1999526899f1688406c5";

const providers = {
  [44787]: new CeloProvider("https://alfajores-forno.celo-testnet.org"),
  [43113]: new JsonRpcProvider("https://api.avax-test.network/ext/bc/C/rpc"),
};

const signers = {
  [44787]: new CeloWallet(PRIVATE_KEY || fallbackPrivateKey, providers[44787]),
  [43113]: new Wallet(PRIVATE_KEY || fallbackPrivateKey, providers[43113]),
};

const portals = {
  [44787]: ReservePortal__factory.connect(
    "0xE0e61BeF1AD40880F92e2bf7617A2BB538feA655",
    signers[44787]
  ),
  [43113]: ReservePortal__factory.connect(
    "0x1c743749d0070091D964356E710CeFA07B00A58b",
    signers[43113]
  ),
};

const forwarders = {
  [44787]: OwnableMinimalForwarder__factory.connect(
    "0xb14f85eCbb81A560016385A8fcdef709e6aaFbaf",
    signers[44787]
  ),
};

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
