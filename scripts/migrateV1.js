require("dotenv").config();
const { parseUnits } = require("ethers/lib/utils");
const { getNomsToMigrate } = require("./fetchV1");

const {
  abi: NomRegistrarControllerAbi,
} = require("../build/contracts/NomRegistrarController.json");
const {
  abi: PublicResolverAbi,
} = require("../build/contracts/PublicResolver.json");
const Web3 = require("web3");

const BUFFER = 60 * 60 * 24 * 7; // 1 week gift
const BUCKET_SIZE = 5;
const START = 0;
const now = Math.floor(Date.now() / 1000);

const fn = async (t) => {
  const web3 = new Web3(process.env.CELO_RPC);
  const { address: senderAccount } = web3.eth.accounts.wallet.add(
    process.env.PRIVATE_KEY
  );
  const operator = senderAccount;
  const nomRegistrarController = new web3.eth.Contract( // edit if doing alfajores
    NomRegistrarControllerAbi,
    "0x046D19c5E5E8938D54FB02DCC396ACf7F275490A"
  );
  if (!(await nomRegistrarController.methods.whitelist(operator).call())) {
    await nomRegistrarController.methods
      .addToWhitelist(operator)
      .send({ from: senderAccount, gas: 2e6 });
  }
  const resolver = new web3.eth.Contract( // edit if doing alfajores
    PublicResolverAbi,
    "0x4030B393bbd64142a8a69E904A0bf15f87993d9A"
  );

  const toMigrate = await getNomsToMigrate();
  let i = START;
  console.log(`Migrating ${toMigrate.length} names`);
  while (i < toMigrate.length) {
    console.log(`Migrating #${i} - ${i + BUCKET_SIZE - 1}`);
    const noms = toMigrate.slice(i, i + BUCKET_SIZE);
    const numSkipped = BUCKET_SIZE - noms.length;
    if (numSkipped > 0) console.log(`Skipping ${numSkipped} noms`);
    if (numSkipped === BUCKET_SIZE) {
      i += BUCKET_SIZE;
      continue;
    }
    const names = noms.map(({ name }) => name);
    try {
      const params = {
        from: senderAccount,
        gasPrice: parseUnits("0.75", "gwei"),
      };
      const gas = await nomRegistrarController.methods
        .batchRegisterWithConfig(
          names,
          noms.map(({ owner }) => owner),
          noms.map(({ expiration }) => expiration - now + BUFFER),
          noms.map(() => resolver.options.address),
          noms.map(({ resolution }) => resolution)
        )
        .estimateGas(params);
      await nomRegistrarController.methods
        .batchRegisterWithConfig(
          names,
          noms.map(({ owner }) => owner),
          noms.map(({ expiration }) => expiration - now + BUFFER),
          noms.map(() => resolver.options.address),
          noms.map(({ resolution }) => resolution)
        )
        .send({ ...params, gas });
    } catch (e) {
      console.error(e);
      console.log("Failed for: ", names);
    }
    i += BUCKET_SIZE;
  }
  await nomRegistrarController.methods
    .removeFromWhitelist(operator)
    .send({ from: senderAccount, gas: 2e6 });
};

fn().catch(console.error);
