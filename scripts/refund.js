const ERC20 = artifacts.require("ERC20");
const refunds = require("./refunds.json");
const { toWei } = require("web3-utils");
const fs = require("fs");

const start = 637;
module.exports = async (t) => {
  const filename = `/tmp/refunds7.csv`;

  //   const cusd = await ERC20.at("0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1");
  //   const explorer = "https://alfajores-blockscout.celo-testnet.org";
  const explorer = "https://explorer.celo.org";
  const cusd = await ERC20.at("0x765DE816845861e75A25fCA122bb6898B8B1282a");

  const rows = ["owner,amount,transaction"];
  for (let i = start; i < refunds.length; i++) {
    const { address, amount } = refunds[i];
    try {
      const tx = await cusd.transfer(address, toWei(amount.toFixed(18)));
      const txLink = `${explorer}/tx/${tx.tx}`;
      console.log(`#${i}`, txLink);
      rows.push(`${address},${amount},${txLink}`);
      fs.writeFileSync(filename, rows.join("\n"));
    } catch (e) {
      console.warn(e);
    }
  }
};
