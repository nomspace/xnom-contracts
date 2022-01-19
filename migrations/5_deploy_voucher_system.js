const NomVoucher = artifacts.require("NomVoucher");
const NomVoucherRegistrar = artifacts.require("NomVoucherRegistrar");
const NomRegistrarController = artifacts.require("NomRegistrarController");

module.exports = async (deployer, network) => {
  const nomRegistrarController = await NomRegistrarController.deployed();

  // await deployer.deploy(NomVoucher);
  const nomVoucher = await NomVoucher.deployed();

  await deployer.deploy(
    NomVoucherRegistrar,
    nomRegistrarController.address,
    nomVoucher.address
  );
  await NomVoucherRegistrar.deployed();
};
