// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./EIP712Mod.sol";

contract OwnableMinimalForwarder is Ownable, EIP712Mod {
  using ECDSA for bytes32;

  struct ForwardRequest {
    address from;
    address to;
    uint256 value;
    uint256 gas;
    uint256 nonce;
    uint256 chainId;
    bytes data;
  }

  bytes32 private constant _TYPEHASH =
    keccak256(
      "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint256 chainId,bytes data)"
    );

  mapping(address => uint256) private _nonces;

  constructor() EIP712Mod("OwnableMinimalForwarder", "0.0.1") {}

  function getNonce(address from) external view returns (uint256) {
    return _nonces[from];
  }

  function verify(ForwardRequest calldata req, bytes calldata signature)
    public
    view
    returns (bool)
  {
    address signer = _hashTypedDataV4(
      req.chainId,
      keccak256(
        abi.encode(
          _TYPEHASH,
          req.from,
          req.to,
          req.value,
          req.gas,
          req.nonce,
          req.chainId,
          keccak256(req.data)
        )
      )
    ).recover(signature);
    return _nonces[req.from] == req.nonce && signer == req.from;
  }

  function execute(ForwardRequest calldata req, bytes calldata signature)
    external
    payable
    onlyOwner
    returns (bool, bytes memory)
  {
    require(
      verify(req, signature),
      "MinimalForwarder: signature does not match request"
    );
    _nonces[req.from] = req.nonce + 1;

    (bool success, bytes memory returndata) = req.to.call{
      gas: req.gas,
      value: req.value
    }(abi.encodePacked(req.data, req.from));
    // Validate that the relayer has sent enough gas for the call.
    // See https://ronan.eth.link/blog/ethereum-gas-dangers/
    assert(gasleft() > req.gas / 63);

    return (success, returndata);
  }
}
