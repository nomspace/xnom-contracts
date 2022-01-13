# Official Cross-chain Nom contracts

## Design
Every chain will have a ReservePortal contract that accepts meta-transactions from users. These meta-transactions are watched by a cron-job that checks the meta-tx validitiy and executes them on the target chain. This design allows users to reserve and manage their .nom from any chain.

## Usage
This project is a hybrid Hardhat / Truffle project. In the future, we should just use Hardhat for everything, but for now the devs have decided to be weird.
### Installation
```
yarn
```

### Usage
```
yarn hardhat compile
# or
yarn truffle compile

yarn truffle migrate --network <network>

yarn truffle test
# or
yarn hardhat test
```