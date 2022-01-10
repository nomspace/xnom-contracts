const ENSRegistry = artifacts.require("ENSRegistry");
const PublicResolver = artifacts.require("PublicResolver");
const BaseRegistrarImplementation = artifacts.require(
  "BaseRegistrarImplementation"
);
const NomRegistrarController = artifacts.require("NomRegistrarController");
const ReverseRegistrar = artifacts.require("ReverseRegistrar");
const OwnableMinimalForwarder = artifacts.require("OwnableMinimalForwarder");
const namehash = require("eth-ens-namehash");
const { utils } = require("ethers");

const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label));

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const cUSD = {
  celo: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
  alfajores: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
};

module.exports = async function (deployer, network, accounts) {
  const isCelo = ["alfajores", "celo"].includes(network);
  if (isCelo) {
    const forwarder = await OwnableMinimalForwarder.deployed();
    // Deploy ens
    await deployer.deploy(ENSRegistry);
    const ens = await ENSRegistry.deployed();

    // Deploy resolver
    await deployer.deploy(PublicResolver, ens.address, ZERO_ADDRESS);
    const resolver = await PublicResolver.deployed();
    await resolver.setTrustedForwarder(forwarder.address, true);

    // Add resolver under .resolver
    const resolverNode = namehash.hash("resolver");
    const resolverLabel = labelhash("resolver");
    await ens.setSubnodeOwner(ZERO_HASH, resolverLabel, accounts[0]);
    await ens.setResolver(resolverNode, resolver.address);
    await resolver.setAddr(resolverNode, resolver.address);

    // Deploy a registrar for .nom
    const nomNode = namehash.hash("nom");
    const nomLabel = labelhash("nom");
    await deployer.deploy(BaseRegistrarImplementation, ens.address, nomNode);
    const baseRegistrarImplementation =
      await BaseRegistrarImplementation.deployed();
    await baseRegistrarImplementation.setTrustedForwarder(
      forwarder.address,
      true
    );
    await ens.setSubnodeOwner(
      ZERO_HASH,
      nomLabel,
      baseRegistrarImplementation.address
    );
    const nomRegistrarController = await deployer.deploy(
      NomRegistrarController,
      baseRegistrarImplementation.address,
      cUSD[network],
      158548959919, // $5 per year
      "0xf60d112c55aef2a97fc434c84a5e3d9e91af75f6" // Multisig
    );
    await baseRegistrarImplementation.addController(
      nomRegistrarController.address
    );
    await nomRegistrarController.addToWhitelist(forwarder.address);

    // Deploy a reverse registrar for .nom
    const reverseNode = namehash.hash("reverse");
    const reverseLabel = labelhash("reverse");
    await deployer.deploy(ReverseRegistrar, ens.address, resolver.address);
    const reverseRegistrar = await ReverseRegistrar.deployed();
    await reverseRegistrar.setTrustedForwarder(forwarder.address, true);

    // Add reverseRegistrar to .reverse under the root namespace
    await ens.setSubnodeOwner(ZERO_HASH, reverseLabel, accounts[0]);
    // Add reverseRegistrar to .addr under the reverse namespace
    await ens.setSubnodeOwner(
      reverseNode,
      labelhash("addr"),
      reverseRegistrar.address
    );
  }
};
