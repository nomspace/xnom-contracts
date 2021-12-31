const ReservePortal = artifacts.require("ReservePortal");

const HOUR_IN_SECONDS = 60 * 60;
const DAY_IN_SECONDS = HOUR_IN_SECONDS * 24;
module.exports = function (deployer, network, accounts) {
  const signer = accounts[0];
  const isTestnet = ["alfajores", "fuji"].includes(network);
  deployer.deploy(
    ReservePortal,
    isTestnet ? HOUR_IN_SECONDS : DAY_IN_SECONDS,
    signer
  );
};
