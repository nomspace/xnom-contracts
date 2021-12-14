// SPDX-License-Identifier: MIT

pragma solidity ^0.8.3;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC721Metadata.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "../OperatorOwned.sol";
import "../interfaces/INom.sol";

contract OperatorOwnedNom is OperatorOwned, INom {
  INom public immutable nom;

  mapping(bytes32 => address) private _owners;

  constructor(address _operator, INom _nom) OperatorOwned(_operator) {
    nom = _nom;
  }

  modifier onlyOperatorOrNameOwner(bytes32 name) {
    require(
      msg.sender == operator || msg.sender == nameOwner(name),
      "Only operator or token owner is allowed"
    );
    _;
  }

  function reserve(bytes32, uint256) external pure override {
    require(false, "Should never be called");
  }

  function extend(bytes32 name, uint256 durationToExtend)
    external
    override
    onlyOperatorOrNameOwner(name)
  {
    nom.extend(name, durationToExtend);
  }

  function resolve(bytes32 name)
    external
    view
    override
    returns (address resolution)
  {
    return nom.resolve(name);
  }

  function expirations(bytes32 name)
    external
    view
    override
    returns (uint256 expiration)
  {
    return nom.expirations(name);
  }

  function changeResolution(bytes32 name, address newResolution)
    external
    override
    onlyOperatorOrNameOwner(name)
  {
    nom.changeResolution(name, newResolution);
  }

  function nameOwner(bytes32 name)
    public
    view
    override
    returns (address owner)
  {
    address underlyingOwner = nom.nameOwner(name);
    if (underlyingOwner == address(this)) {
      return _owners[name];
    }
    return underlyingOwner;
  }

  function changeNameOwner(bytes32 name, address newOwner)
    external
    override
    onlyOperatorOrNameOwner(name)
  {
    nom.changeNameOwner(name, newOwner);
  }

  function isExpired(bytes32 name)
    external
    view
    override
    returns (bool expired)
  {
    return nom.isExpired(name);
  }

  function mintIn(
    bytes32 _name,
    uint256 _durationToReserve,
    address _onBehalfOf
  ) external {
    nom.reserve(_name, _durationToReserve);
    nom.changeNameOwner(_name, address(this));
    _owners[_name] = _onBehalfOf;
  }

  function migrateOut(bytes32 _name, address _to)
    external
    onlyOperatorOrNameOwner(_name)
  {
    nom.changeNameOwner(_name, _to);
    _owners[_name] = address(0);
  }
}
