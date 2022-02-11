require("dotenv").config();
const { abi: erc20Abi } = require("../build/contracts/ERC20.json");
const refunds = require("./refunds.json");
const { toWei } = require("web3-utils");
const fs = require("fs");
const Web3 = require("web3");

const start = 20;
const end = start + 1;

const main = async (t) => {
  //   const cusd = await ERC20.at("0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1");
  //   const explorer = "https://alfajores-blockscout.celo-testnet.org";
  const explorer = "https://explorer.celo.org";
  const web3 = new Web3("https://forno.celo.org");
  const { address: senderAccount } = web3.eth.accounts.wallet.add(
    process.env.PRIVATE_KEY
  );
  const vnom = new web3.eth.Contract(
    erc20Abi,
    "0x0956525490C753fe8134BC64873374167D0f3923"
  );
  const filename = "refunds1.csv";

  const rows = ["owner,amount,transaction"];
  for (let i = start; i < end; i++) {
    const { address, amount } = refunds[i];
    try {
      const tx = await vnom.methods
        .transfer(address, toWei(amount.toFixed(18)))
        .send({ from: senderAccount, gas: 2e6 });
      const txLink = `${explorer}/tx/${tx.transactionHash}`;
      console.log(`#${i}`, txLink);
      rows.push(`${address},${amount},${txLink}`);
      fs.writeFileSync(filename, rows.join("\n"));
    } catch (e) {
      console.warn(e);
    }
  }
};

main().catch(console.error);
