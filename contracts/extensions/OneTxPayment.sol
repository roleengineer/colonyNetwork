/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity >=0.4.23 <0.5.0;
pragma experimental ABIEncoderV2;

import "./../IColony.sol";
import "./../../lib/dappsys/roles.sol";


contract OneTxPayment {
  function makePayment(address _colony, address _worker, uint256 _domainId, address _token, uint256 _amount) public {
    IColony colony = IColony(_colony);

    // Check caller is able to call makePayment on the colony
    // msg.sig is the same for this call as it is for the one we make below, so may as well use it here
    DSRoles authority = DSRoles(colony.authority());
    require(
      authority.canCall(
        msg.sender, 
        _colony, 
        bytes4(keccak256("makePayment(address,uint256,address,uint256)"))
      ),
      "colony-one-tx-payment-not-authorized"
    );

    // Make payment
    colony.makePayment(_worker, _domainId, _token, _amount);
  }


}
