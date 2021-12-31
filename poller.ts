require("dotenv").config({ path: __dirname + "/.env" });
import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "ethers";
import { Operator } from "./src/index";
import { ReservePortal__factory } from "./typechain/factories/ReservePortal__factory";
import { CeloProvider, CeloWallet } from "@celo-tools/celo-ethers-wrapper";
import { buildConfig } from "./src/configs/default";

const { PRIVATE_KEY } = process.env;
if (!PRIVATE_KEY) {
  console.warn("PRIVATE_KEY not specified");
}

const providers = {
  [44787]: new CeloProvider("https://alfajores-forno.celo-testnet.org"),
  [43113]: new JsonRpcProvider("https://api.avax-test.network/ext/bc/C/rpc"),
};

const signers = {
  [44787]: PRIVATE_KEY && new CeloWallet(PRIVATE_KEY, providers[44787]),
  [43113]: PRIVATE_KEY && new Wallet(PRIVATE_KEY, providers[43113]),
};

const deployments = {
  [44787]: ReservePortal__factory.connect(
    "0x3E9e0d874C028fb84fE1CF314e4d4FF927457745",
    signers[44787]
  ),
  [43113]: ReservePortal__factory.connect(
    "0x30b3BB80cBE514AE3A2e2316Da66B42f5a882247",
    signers[43113]
  ),
};

const config = buildConfig([44787]);

const operator = new Operator(signers, deployments, config);

const main = async () => {
  const pendingCommitments = await operator.fetchPendingCommitments();
  console.log(`Number of pending commitments: ${pendingCommitments.length}`);
  await operator.finalizePendingCommitments(pendingCommitments);
};

main().catch(console.error);
