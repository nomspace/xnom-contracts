const { getNomsToMigrate } = require("./migrate");

const OperatorOwnedNomV2 = artifacts.require("OperatorOwnedNomV2");
const PublicResolver = artifacts.require("PublicResolver");

const BUFFER = 60 * 60 * 24 * 7; // 1 week gift
const BUCKET_SIZE = 20;
const START = 4800;

module.exports = async (deployer) => {
  const operatorOwnedNomV2 = await OperatorOwnedNomV2.deployed();
  const resolver = await PublicResolver.deployed();

  const toMigrate = await getNomsToMigrate();
  const now = Math.floor(Date.now() / 1000);
  let i = START;
  while (i < toMigrate.length) {
    console.log(`Migrating #${i} - ${i + BUCKET_SIZE - 1}`);
    const noms = toMigrate
      .slice(i, i + BUCKET_SIZE)
      .filter(({ expiration }) => expiration > now);
    const numSkipped = BUCKET_SIZE - noms.length;
    if (numSkipped > 0) console.log(`Skipping ${numSkipped} noms`);
    if (numSkipped === BUCKET_SIZE) {
      i += BUCKET_SIZE;
      continue;
    }
    const names = noms.map(({ name }) => name);
    try {
      await operatorOwnedNomV2.batchRegister(
        names,
        noms.map(({ owner }) => owner),
        noms.map(({ expiration }) => expiration - now + BUFFER),
        noms.map(() => resolver.address),
        noms.map(({ resolution }) => resolution)
      );
    } catch (e) {
      console.log("Failed for: ", names);
    }
    i += BUCKET_SIZE;
  }
};
