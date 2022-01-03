// SPDX-License-Identifier: MIT

pragma solidity >=0.8.4;

import "@ensdomains/ens-contracts/contracts/ethregistrar/BaseRegistrarImplementation.sol";
import "@ensdomains/ens-contracts/contracts/ethregistrar/StringUtils.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/Resolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./FeeBase.sol";

/**
 * @dev A registrar controller for registering and renewing names at fixed cost.
 */
contract NomRegistrarController is Ownable, FeeBase {
  using StringUtils for *;
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  bytes4 private constant INTERFACE_META_ID =
    bytes4(keccak256("supportsInterface(bytes4)"));
  bytes4 private constant COMMITMENT_CONTROLLER_ID =
    bytes4(
      keccak256("rentPrice(string,uint256)") ^
        keccak256("available(string)") ^
        keccak256("register(string,address,uint256)") ^
        keccak256("renew(string,uint256)")
    );

  bytes4 private constant COMMITMENT_WITH_CONFIG_CONTROLLER_ID =
    bytes4(
      keccak256("registerWithConfig(string,address,uint256,address,address)")
    );

  BaseRegistrarImplementation public immutable base;

  event NameRegistered(
    string name,
    bytes32 indexed label,
    address indexed owner,
    uint256 cost,
    uint256 expires
  );
  event NameRenewed(
    string name,
    bytes32 indexed label,
    uint256 cost,
    uint256 expires
  );

  constructor(
    BaseRegistrarImplementation _base,
    IERC20 _feeCurrency,
    uint256 _feePerSecond,
    address _treasury
  ) FeeBase(_feeCurrency, _feePerSecond, _treasury) {
    base = _base;
  }

  function rentPrice(
    string memory _name,
    uint256 duration,
    address caller
  ) public view returns (uint256) {
    return duration.mul(this.feeRate(_name, caller));
  }

  function valid(string memory name) public pure returns (bool) {
    return name.strlen() >= 1;
  }

  function available(string memory name) external view returns (bool) {
    bytes32 label = keccak256(bytes(name));
    return valid(name) && base.available(uint256(label));
  }

  function register(
    string calldata name,
    address owner,
    uint256 duration
  ) external {
    registerWithConfig(name, owner, duration, address(0), address(0));
  }

  function registerWithConfig(
    string memory name,
    address owner,
    uint256 duration,
    address resolver,
    address addr
  ) public {
    uint256 cost = rentPrice(name, duration, msg.sender);
    if (cost > 0) {
      feeCurrency.safeTransferFrom(msg.sender, treasury, cost);
    }

    bytes32 label = keccak256(bytes(name));
    uint256 tokenId = uint256(label);

    uint256 expires;
    if (resolver != address(0)) {
      // Set this contract as the (temporary) owner, giving it
      // permission to set up the resolver.
      expires = base.register(tokenId, address(this), duration);

      // The nodehash of this label
      bytes32 nodehash = keccak256(abi.encodePacked(base.baseNode(), label));

      // Set the resolver
      base.ens().setResolver(nodehash, resolver);

      // Configure the resolver
      if (addr != address(0)) {
        Resolver(resolver).setAddr(nodehash, addr);
      }

      // Now transfer full ownership to the expeceted owner
      base.reclaim(tokenId, owner);
      base.transferFrom(address(this), owner, tokenId);
    } else {
      require(addr == address(0));
      expires = base.register(tokenId, owner, duration);
    }

    emit NameRegistered(name, label, owner, cost, expires);
  }

  function renew(string calldata name, uint256 duration) external {
    uint256 cost = rentPrice(name, duration, msg.sender);
    feeCurrency.safeTransferFrom(msg.sender, treasury, cost);

    bytes32 label = keccak256(bytes(name));
    uint256 expires = base.renew(uint256(label), duration);

    emit NameRenewed(name, label, cost, expires);
  }

  // @notice should only be used to rescue tokens
  function withdraw() external onlyOwner {
    payable(msg.sender).transfer(address(this).balance);
  }

  function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
    return
      interfaceID == INTERFACE_META_ID ||
      interfaceID == COMMITMENT_CONTROLLER_ID ||
      interfaceID == COMMITMENT_WITH_CONFIG_CONTROLLER_ID;
  }
}
