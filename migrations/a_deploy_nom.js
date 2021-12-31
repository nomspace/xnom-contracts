const OperatorOwnedNomV1 = artifacts.require("OperatorOwnedNomV1");

module.exports = function (deployer, network, accounts) {
  if (network === "alfajores") {
    const signer = accounts[0]
    deployer.deploy(
      OperatorOwnedNomV1,
      signer,
      "0x36C976Da6A6499Cad683064F849afa69CD4dec2e"
    );
  }
};
