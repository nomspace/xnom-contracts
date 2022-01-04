const OwnableMinimalForwarder = artifacts.require("OwnableMinimalForwarder");

module.exports = async (deployer, network) => {
  const isCelo = ["alfajores", "celo"].includes(network);
  if (isCelo) {
    // Deploy Forwarder
    await deployer.deploy(OwnableMinimalForwarder);
    await OwnableMinimalForwarder.deployed();
  }
};
