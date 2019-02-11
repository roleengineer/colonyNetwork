/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";

import { INITIAL_FUNDING } from "../../helpers/constants";
import { checkErrorRevert } from "../../helpers/test-helper";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony, fundColonyWithTokens } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const OneTxPayment = artifacts.require("OneTxPayment");

contract("One transaction payments", accounts => {
  let colony;
  let token;
  let colonyNetwork;
  let oneTxExtension;

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    await setupMetaColonyWithLockedCLNYToken(colonyNetwork);
    await colonyNetwork.initialiseReputationMining();
    await colonyNetwork.startNextCycle();
    oneTxExtension = await OneTxPayment.new();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    // Give oneTxExtension admin rights
    await colony.setAdminRole(oneTxExtension.address);
  });

  describe("Under normal conditions", () => {
    it("should allow a single transaction payment to occur", async () => {
      const balanceBefore = await token.balanceOf(accounts[4]);
      expect(balanceBefore).to.eq.BN(0);
      await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
      await colony.claimColonyFunds(token.address);
      // This is the one transactions. Those ones above don't count...
      await oneTxExtension.makePayment(colony.address, accounts[4], 1, token.address, 10);
      // Check it completed
      const balanceAfter = await token.balanceOf(accounts[4]);
      expect(balanceAfter).to.eq.BN(9);
    });

    it("should not allow a non-admin to make a single-transaction payment", async () => {
      await checkErrorRevert(
        oneTxExtension.makePayment(colony.address, accounts[4], 1, token.address, 10, { from: accounts[4] }),
        "colony-one-tx-payment-not-authorized"
      );
    });

    it("should not allow an admin to call makePayment on the colony directly", async () => {
      await checkErrorRevert(colony.makePayment(accounts[4], 1, token.address, 10), "colony-do-not-call-function-directly");
    });
  });
});
