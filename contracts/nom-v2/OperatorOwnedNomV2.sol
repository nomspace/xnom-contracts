// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "@ensdomains/ens-contracts/contracts/resolvers/Resolver.sol";
import "@ensdomains/ens-contracts/contracts/registry/ReverseRegistrar.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC721Metadata.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "../OperatorOwned.sol";
import "./NomRegistrarController.sol";

contract OperatorOwnedNomV2 is OperatorOwned {
  NomRegistrarController public immutable controller;
  BaseRegistrar public immutable base;
  ENS public immutable ens;

  constructor(NomRegistrarController _controller) OperatorOwned(msg.sender) {
    controller = _controller;
    base = _controller.base();
    ens = _controller.base().ens();
  }

  modifier onlyOperatorOrNameOwner(string memory name) {
    uint256 tokenId = uint256(keccak256(bytes(name)));
    require(msg.sender == operator, "Only operator or token owner is allowed");
    _;
  }

  // Controller overrides

  function renew(string calldata name, uint256 duration) external onlyOperator {
    controller.renew(name, duration);
  }

  function batchRegister(
    string[] memory names,
    address[] memory owners,
    uint256[] memory durations,
    address[] memory resolvers,
    address[] memory addrs
  ) external onlyOperator {
    for (uint256 i = 0; i < names.length; i++) {
      register(names[i], owners[i], durations[i], resolvers[i], addrs[i]);
    }
  }

  function register(
    string memory name,
    address owner,
    uint256 duration,
    address resolver,
    address addr
  ) public onlyOperator {
    controller.registerWithConfig(name, owner, duration, resolver, addr);
  }
}
