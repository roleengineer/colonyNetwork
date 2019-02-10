/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";

import { WORKER_ROLE, WAD, INITIAL_FUNDING } from "../helpers/constants";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony, fundColonyWithTokens } from "../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const OneClick = artifacts.require("OneClick");

contract("OneClick", accounts => {
  const USER = accounts[1];

  let colonyNetwork;
  let colony;
  let token;

  before(async () => {
    colonyNetwork = await setupColonyNetwork();
    await setupMetaColonyWithLockedCLNYToken(colonyNetwork);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await fundColonyWithTokens(colony, token, INITIAL_FUNDING);
  });

  describe("One-click functionality", () => {
    it("should send a payment with one tx", async () => {
      const oneClick = await OneClick.new(colony.address);
      await colony.setAdminRole(oneClick.address);

      const { logs } = await oneClick.makePayment(USER, 1, token.address, WAD);
      const { paymentId } = logs.filter(log => log.event === "PaymentMade")[0].args;

      await colony.claimPayout(paymentId, WORKER_ROLE, token.address, { from: USER });
      const userBalance = await token.balanceOf(USER);
      expect(userBalance).to.eq.BN(WAD.divn(100).muln(99).subn(1)); // eslint-disable-line prettier/prettier
    });
  });
});
