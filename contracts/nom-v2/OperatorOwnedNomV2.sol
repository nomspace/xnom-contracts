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

  function register(
    string memory name,
    address owner,
    uint256 duration,
    address resolver,
    address addr
  ) external {
    // Operator has subnode ownership, user has token ownership
    controller.registerWithConfig(
      name,
      address(this),
      duration,
      resolver,
      addr
    );
    bytes32 label = keccak256(bytes(name));
    uint256 tokenId = uint256(label);
    base.transferFrom(address(this), owner, tokenId);
  }

  // Resolver overrides

  function setABI(
    string memory name,
    uint256 contentType,
    bytes calldata data
  ) external onlyOperatorOrNameOwner(name) {
    bytes32 label = keccak256(bytes(name));
    bytes32 node = keccak256(abi.encodePacked(base.baseNode(), label));
    Resolver(ens.resolver(node)).setABI(node, contentType, data);
  }

  function setAddr(string memory name, address addr)
    external
    onlyOperatorOrNameOwner(name)
  {
    bytes32 label = keccak256(bytes(name));
    bytes32 node = keccak256(abi.encodePacked(base.baseNode(), label));
    Resolver(ens.resolver(node)).setAddr(node, addr);
  }

  function setAddr(
    string memory name,
    uint256 coinType,
    bytes calldata a
  ) external onlyOperatorOrNameOwner(name) {
    bytes32 label = keccak256(bytes(name));
    bytes32 node = keccak256(abi.encodePacked(base.baseNode(), label));
    Resolver(ens.resolver(node)).setAddr(node, coinType, a);
  }

  function setContenthash(string memory name, bytes calldata hash)
    external
    onlyOperatorOrNameOwner(name)
  {
    bytes32 label = keccak256(bytes(name));
    bytes32 node = keccak256(abi.encodePacked(base.baseNode(), label));
    Resolver(ens.resolver(node)).setContenthash(node, hash);
  }

  function setDnsrr(string memory name, bytes calldata data)
    external
    onlyOperatorOrNameOwner(name)
  {
    bytes32 label = keccak256(bytes(name));
    bytes32 node = keccak256(abi.encodePacked(base.baseNode(), label));
    Resolver(ens.resolver(node)).setDnsrr(node, data);
  }

  function setName(string memory name, string calldata _name)
    external
    onlyOperatorOrNameOwner(name)
  {
    bytes32 label = keccak256(bytes(name));
    bytes32 node = keccak256(abi.encodePacked(base.baseNode(), label));
    Resolver(ens.resolver(node)).setName(node, _name);
  }

  function setPubkey(
    string memory name,
    bytes32 x,
    bytes32 y
  ) external onlyOperatorOrNameOwner(name) {
    bytes32 label = keccak256(bytes(name));
    bytes32 node = keccak256(abi.encodePacked(base.baseNode(), label));
    Resolver(ens.resolver(node)).setPubkey(node, x, y);
  }

  function setText(
    string memory name,
    string calldata key,
    string calldata value
  ) external onlyOperatorOrNameOwner(name) {
    bytes32 label = keccak256(bytes(name));
    bytes32 node = keccak256(abi.encodePacked(base.baseNode(), label));
    Resolver(ens.resolver(node)).setText(node, key, value);
  }

  function setInterface(
    string memory name,
    bytes4 interfaceID,
    address implementer
  ) external onlyOperatorOrNameOwner(name) {
    bytes32 label = keccak256(bytes(name));
    bytes32 node = keccak256(abi.encodePacked(base.baseNode(), label));
    Resolver(ens.resolver(node)).setInterface(node, interfaceID, implementer);
  }

  function setReverseRecord(address addr, string memory name)
    external
    onlyOperatorOrNameOwner(name)
  {
    ReverseRegistrar(ens.owner(ADDR_REVERSE_NODE)).setNameForAddr(
      addr,
      address(this),
      name
    );
  }
}
