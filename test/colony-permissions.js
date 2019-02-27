/* global artifacts */
import { BN } from "bn.js";
import chai from "chai";
import bnChai from "bn-chai";

import {
  WAD,
  INITIAL_FUNDING,
  ZERO_ADDRESS,
} from "../helpers/constants";

import {
  checkErrorRevert,
  expectEvent,
  expectAllEvents,
  forwardTime
} from "../helpers/test-helper";

import {
  fundColonyWithTokens,
  setupFinalizedTask,
  setupRatedTask,
  setupAssignedTask,
  setupFundedTask,
  setupRandomColony
} from "../helpers/test-data-generator";

const ethers = require("ethers");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");

contract("ColonyTask", accounts => {
  const ROOT = accounts[0];
  const USER1 = accounts[1];
  const USER2 = accounts[2];

  let colonyNetwork;
  let colony;
  let token;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));
    await colony.setRewardInverse(100);
  });

  describe("when managing domain-level permissions", () => {
    it("should give colony creator all permissions in root domain", async () => {
    	// Roles 0-2 are the existing Founder, Admin, and Recovery roles
    	const fundingRole = await colony.hasUserRole(ROOT, 1, 3);
    	const administrationRole = await colony.hasUserRole(ROOT, 1, 4);
    	// const arbitrationRole = await colony.hasUserRole(ROOT, 1, 5); Not implemented yet.
    	const architectureRole = await colony.hasUserRole(ROOT, 1, 6);
    	const architectureSubdomainRole = await colony.hasUserRole(ROOT, 1, 7);
    	const rootRole = await colony.hasUserRole(ROOT, 1, 8);

    	expect(fundingRole).to.be.true;
    	expect(administrationRole).to.be.true;
    	expect(architectureRole).to.be.true;
    	expect(architectureSubdomainRole).to.be.true;
    	expect(rootRole).to.be.true;
    });
  });
});
