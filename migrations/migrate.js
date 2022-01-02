require("dotenv").config;
const Web3 = require("web3");
const NomAbi = require("../scripts/abi/Nom.json");
const MulticallAbi = require("../scripts/abi/Multicall.json");
const { ethers } = require("ethers");
const { normalize } = require("eth-ens-namehash");
const fs = require("fs");

const CREATION_BLOCK = 7240250;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BUCKET_SIZE = 200;

const getPastEvents = async (
  contract,
  eventName,
  startBlock,
  endBlock,
  filter
) => {
  const filename = `/tmp/${contract.options.address}_${eventName}.txt`;
  const bucketSize = 100;
  let events = [];
  try {
    events = JSON.parse(fs.readFileSync(filename).toString());
    startBlock = events[events.length - 1].blockNumber + 1;
  } catch (e) {}
  for (
    let i = Math.floor(startBlock / bucketSize);
    i < Math.ceil(endBlock / bucketSize);
    i++
  ) {
    const fromBlock = Math.max(i * bucketSize, startBlock);
    const toBlock = Math.min((i + 1) * bucketSize, endBlock) - 1;
    console.log(`Fetching events from ${fromBlock} to ${toBlock}`);
    events.push(
      ...(await contract.getPastEvents(eventName, {
        fromBlock,
        toBlock,
        filter,
      }))
    );
    fs.writeFileSync(filename, JSON.stringify(events));
  }
  console.info(`Fetched ${events.length} ${eventName} events`);

  return events;
};

const getResolutions = async (multicall, nom, reserveEvents) => {
  console.log("Fetching resolutions");
  const total = reserveEvents.length;
  let i = 0;
  const events = [];
  while (i < total) {
    events.push(
      ...(await multicall.methods
        .aggregate(
          reserveEvents
            .slice(i, i + BUCKET_SIZE)
            .map((e) => [
              nom.options.address,
              nom.methods.resolve(e.returnValues.name).encodeABI(),
            ])
        )
        .call()
        .then((cr) =>
          cr.returnData.map((address) =>
            address.replace("0x000000000000000000000000", "0x")
          )
        ))
    );
    i += BUCKET_SIZE;
  }
  return events;
};

const getOwners = async (multicall, nom, reserveEvents) => {
  console.log("Fetching owners");
  const total = reserveEvents.length;
  let i = 0;
  const events = [];
  while (i < total) {
    events.push(
      ...(await multicall.methods
        .aggregate(
          reserveEvents
            .slice(i, i + BUCKET_SIZE)
            .map((e) => [
              nom.options.address,
              nom.methods.nameOwner(e.returnValues.name).encodeABI(),
            ])
        )
        .call()
        .then((cr) =>
          cr.returnData.map((address) =>
            address.replace("0x000000000000000000000000", "0x")
          )
        ))
    );
    i += BUCKET_SIZE;
  }
  return events;
};

const getExpirations = async (multicall, nom, reserveEvents) => {
  console.log("Fetching expirations");
  const total = reserveEvents.length;
  let i = 0;
  const events = [];
  while (i < total) {
    events.push(
      ...(await multicall.methods
        .aggregate(
          reserveEvents
            .slice(i, i + BUCKET_SIZE)
            .map((e) => [
              nom.options.address,
              nom.methods.expirations(e.returnValues.name).encodeABI(),
            ])
        )
        .call()
        .then((cr) =>
          cr.returnData.map((expiration) => parseInt(expiration, 16))
        ))
    );
    i += BUCKET_SIZE;
  }

  return events;
};

const getNomsToMigrate = async () => {
  const web3 = new Web3(process.env.CELO_RPC);
  const nom = new web3.eth.Contract(
    NomAbi,
    "0xABf8faBbC071F320F222A526A2e1fBE26429344d"
  );
  const multicall = new web3.eth.Contract(
    MulticallAbi,
    "0x75f59534dd892c1f8a7b172d639fa854d529ada3"
  );

  const latestBlock = await web3.eth.getBlockNumber();
  const reserveEvents = await getPastEvents(
    nom,
    "NameOwnerChanged",
    CREATION_BLOCK,
    latestBlock,
    {
      previousOwner: ZERO_ADDRESS,
    }
  ).then((events) => {
    const seen = {};
    const filtered = [];
    for (const event of events) {
      const name = event.returnValues.name;
      if (!seen[name]) {
        filtered.push(event);
      }
      seen[name] = true;
    }
    return filtered;
  });

  const [resolutions, owners, expirations] = await Promise.all([
    getResolutions(multicall, nom, reserveEvents),
    getOwners(multicall, nom, reserveEvents),
    getExpirations(multicall, nom, reserveEvents),
  ]);

  const toMigrate = [];
  const seen = {};
  for (let i = 0; i < reserveEvents.length; i++) {
    let name = ethers.utils.toUtf8String(reserveEvents[i].returnValues.name);
    while (name.charAt(name.length - 1) === "\u0000") {
      name = name.slice(0, name.length - 1);
    }
    try {
      name = normalize(name);
      if (!seen[name]) {
        toMigrate.push({
          index: i,
          name,
          owner: owners[i],
          resolution: resolutions[i],
          expiration: expirations[i],
        });
      }
      seen[name] = true;
    } catch (e) {
      console.warn(`Can't normalize ${name}`);
    }
  }
  return toMigrate;
};

module.exports = {
  getNomsToMigrate,
};
