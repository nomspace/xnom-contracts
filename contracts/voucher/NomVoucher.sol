// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NomVoucher is ERC20, Ownable {
  constructor() ERC20("Nom Voucher", "vNOM") {}

  function mint(address _to, uint256 _amount) external onlyOwner {
    _mint(_to, _amount);
  }
}
