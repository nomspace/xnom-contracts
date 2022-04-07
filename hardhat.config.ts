import { task } from "hardhat/config";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import { NomRegistrarController__factory } from "./typechain/factories/NomRegistrarController__factory";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("decode-register", "Decode register")
  .addParam("data", "data to decode")
  .setAction(async ({ data }) => {
    const f = NomRegistrarController__factory.createInterface();
    const decoded = f.decodeFunctionData("registerWithConfig", data);
    console.log(decoded);
  });

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.9",
  typechain: {
    outDir: "typechain",
  },
};
