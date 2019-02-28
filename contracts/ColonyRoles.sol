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

pragma solidity >=0.4.23;

import "./CommonAuthority.sol";


contract ColonyRoles is CommonAuthority {
  mapping(address=>mapping(uint256=>bytes32)) _user_roles;

  // New function signatures taking arbitrary domains

  function getUserRoles(address who, uint256 where) public view returns (bytes32) {
    return _user_roles[who][where];
  }

  function setUserRole(address who, uint256 where, uint8 role, bool enabled) public auth {
    bytes32 last_roles = _user_roles[who][where];
    bytes32 shifted = bytes32(uint256(uint256(2) ** uint256(role)));
    if (enabled) {
      _user_roles[who][where] = last_roles | shifted;
    } else {
      _user_roles[who][where] = last_roles & BITNOT(shifted);
    }
  }

  function hasUserRole(address who, uint256 where, uint8 role) public view returns (bool) {
    bytes32 roles = getUserRoles(who, where);
    bytes32 shifted = bytes32(uint256(uint256(2) ** uint256(role)));
    return bytes32(0) != roles & shifted;
  }

  function canCall(address caller, uint256 domainId, address code, bytes4 sig) public view returns (bool) {
    if (isUserRoot(caller) || isCapabilityPublic(code, sig)) {
      return true;
    } else {
      bytes32 has_roles = getUserRoles(caller, domainId);
      bytes32 needs_one_of = getCapabilityRoles(code, sig);
      return bytes32(0) != has_roles & needs_one_of;
    }
  }

  function canCallBecause(address caller, uint256 domainId, uint8 role, address code, bytes4 sig) public view returns (bool) {
    bytes32 needs_one_of = getCapabilityRoles(code, sig);
    bytes32 has_roles = getUserRoles(caller, domainId);
    bytes32 shifted = bytes32(uint256(uint256(2) ** uint256(role)));

    // See if the permission comes from a specific role
    return bytes32(0) == (needs_one_of & has_roles) ^ shifted;
  }

  // Support old function signatures for root domain

  function getUserRoles(address who) public view returns (bytes32) {
    return getUserRoles(who, 1);
  }

  function setUserRole(address who, uint8 role, bool enabled) public auth {
    return setUserRole(who, 1, role, enabled);
  }

  function hasUserRole(address who, uint8 role) public view returns (bool) {
    return hasUserRole(who, 1, role);
  }

  function canCall(address caller, address code, bytes4 sig) public view returns (bool) {
    return canCall(caller, 1, code, sig);
  }

}
