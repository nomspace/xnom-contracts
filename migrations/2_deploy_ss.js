const VotableStakingRewards = artifacts.require("VotableStakingRewards");

module.exports = function (deployer, network) {
  if (network === "celo") {
    deployer.deploy(
      VotableStakingRewards,
      "0x0Ce41DbCEA62580Ae2C894a7D93E97da0c3daC3a",
      "0x0Ce41DbCEA62580Ae2C894a7D93E97da0c3daC3a",
      "0x00be915b9dcf56a3cbe739d9b9c202ca692409ec",
      "0x00be915b9dcf56a3cbe739d9b9c202ca692409ec",
      "0xa7581d8E26007f4D2374507736327f5b46Dd6bA8"
    );
  }
};
