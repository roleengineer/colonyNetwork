/* globals artifacts */
import chai from "chai";
import bnChai from "bn-chai";

import { getTokenArgs, web3GetNetwork, web3GetBalance, checkErrorRevert, expectEvent } from "../helpers/test-helper";
import { ZERO_ADDRESS } from "../helpers/constants";
import { setupColonyNetwork, setupMetaColonyWithLockedCLNYToken, setupRandomColony } from "../helpers/test-data-generator";

const namehash = require("eth-ens-namehash");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ENSRegistry = artifacts.require("ENSRegistry");
const EtherRouter = artifacts.require("EtherRouter");
const Resolver = artifacts.require("Resolver");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const DSToken = artifacts.require("DSToken");

contract("Colony Network", accounts => {
  const SAMPLE_RESOLVER = "0x65a760e7441cf435086ae45e14a0c8fc1080f54c";
  const TOKEN_ARGS = getTokenArgs();
  const OTHER_ACCOUNT = accounts[1];
  let colonyNetwork;
  let metaColony;
  let createColonyGas;
  let version;

  before(async () => {
    const network = await web3GetNetwork();
    createColonyGas = network === "1999" ? "0xfffffffffff" : 4e6;
  });

  beforeEach(async () => {
    colonyNetwork = await setupColonyNetwork();
    version = await colonyNetwork.getCurrentColonyVersion();
    ({ metaColony } = await setupMetaColonyWithLockedCLNYToken(colonyNetwork));
  });

  describe("when initialised", () => {
    it("should accept ether", async () => {
      await colonyNetwork.send(1);
      const colonyNetworkBalance = await web3GetBalance(colonyNetwork.address);
      expect(colonyNetworkBalance).to.eq.BN(1);
    });

    it("should have the correct current Colony version set", async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      expect(currentColonyVersion).to.eq.BN(1);
    });

    it("should have the Resolver for current Colony version set", async () => {
      const currentResolver = await colonyNetwork.getColonyVersionResolver(version);
      expect(currentResolver).to.not.equal(ZERO_ADDRESS);
    });

    it("should be able to register a higher Colony contract version", async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const updatedVersion = currentColonyVersion.addn(1);
      await metaColony.addNetworkColonyVersion(updatedVersion, SAMPLE_RESOLVER);

      const updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      expect(updatedColonyVersion).to.eq.BN(updatedVersion);
      const currentResolver = await colonyNetwork.getColonyVersionResolver(updatedVersion);
      expect(currentResolver.toLowerCase()).to.equal(SAMPLE_RESOLVER);
    });

    it("when registering a lower version of the Colony contract, should NOT update the current (latest) colony version", async () => {
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      await metaColony.addNetworkColonyVersion(currentColonyVersion.subn(1), SAMPLE_RESOLVER);

      const updatedColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      expect(updatedColonyVersion).to.eq.BN(currentColonyVersion);
    });

    it("should not be able to set the token locking contract twice", async () => {
      await checkErrorRevert(colonyNetwork.setTokenLocking(ZERO_ADDRESS), "colony-token-locking-address-already-set");
    });

    it("should not be able to initialise network twice", async () => {
      await checkErrorRevert(colonyNetwork.initialise("0xDde1400C69752A6596a7B2C1f2420Fb9A71c1FDA"), "colony-network-already-initialised");
    });

    it("should not be able to create a colony if the network is not initialised", async () => {
      const resolverColonyNetworkDeployed = await Resolver.deployed();
      const etherRouter = await EtherRouter.new();
      await etherRouter.setResolver(resolverColonyNetworkDeployed.address);
      colonyNetwork = await IColonyNetwork.at(etherRouter.address);

      await checkErrorRevert(
        colonyNetwork.createColony("0x8972e86549bb8E350673e0562fba9a4889d01637"),
        "colony-network-not-initialised-cannot-create-colony"
      );
    });
  });

  describe("when managing the mining process", () => {
    it("should not allow reinitialisation of reputation mining process", async () => {
      await colonyNetwork.initialiseReputationMining();
      await checkErrorRevert(colonyNetwork.initialiseReputationMining(), "colony-reputation-mining-already-initialised");
    });

    it("should not allow another mining cycle to start if the process isn't initialised", async () => {
      await checkErrorRevert(colonyNetwork.startNextCycle(), "colony-reputation-mining-not-initialised");
    });
  });

  describe("when creating new colonies", () => {
    it("should allow users to create new colonies", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const colonyCount = await colonyNetwork.getColonyCount();
      expect(colony.address).to.not.equal(ZERO_ADDRESS);
      expect(colonyCount).to.eq.BN(2);
    });

    it("should maintain correct count of colonies", async () => {
      const token = await DSToken.new(getTokenArgs()[1]);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      const colonyCount = await colonyNetwork.getColonyCount();
      expect(colonyCount).to.eq.BN(8);
    });

    it("when meta colony is created, should have the root global and local skills initialised, plus the local mining skill", async () => {
      const skillCount = await colonyNetwork.getSkillCount();
      expect(skillCount).to.eq.BN(3);
      const rootGlobalSkill = await colonyNetwork.getSkill(1);
      expect(parseInt(rootGlobalSkill.nParents, 10)).to.be.zero;
      expect(parseInt(rootGlobalSkill.nChildren, 10)).to.be.zero;

      const globalSkill1 = await colonyNetwork.getSkill(1);
      expect(globalSkill1.globalSkill).to.be.true;

      const globalSkill2 = await colonyNetwork.getSkill(2);
      expect(globalSkill2.globalSkill).to.be.false;

      const localSkill1 = await colonyNetwork.getSkill(3);
      expect(localSkill1.globalSkill).to.be.false;

      const rootGlobalSkillId = await colonyNetwork.getRootGlobalSkillId();
      expect(rootGlobalSkillId).to.eq.BN(1);
    });

    it("should fail to create meta colony if it already exists", async () => {
      const token = await DSToken.new(TOKEN_ARGS[1]);
      await checkErrorRevert(colonyNetwork.createMetaColony(token.address), "colony-meta-colony-exists-already");
    });

    it("should not allow users to create a colony with empty token", async () => {
      await checkErrorRevert(colonyNetwork.createColony(ZERO_ADDRESS), "colony-token-invalid-address");
    });

    it("when any colony is created, should have the root local skill initialised", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);

      const rootLocalSkill = await colonyNetwork.getSkill(1);
      expect(parseInt(rootLocalSkill.nParents, 10)).to.be.zero;
      expect(parseInt(rootLocalSkill.nChildren, 10)).to.be.zero;

      const skillCount = await colonyNetwork.getSkillCount();
      const skill = await colonyNetwork.getSkill(skillCount.addn(1));
      expect(skill.globalSkill).to.be.false;

      const rootDomain = await colony.getDomain(1);
      expect(rootDomain.skillId).to.eq.BN(4);
      expect(rootDomain.fundingPotId).to.eq.BN(1);

      const domainCount = await colony.getDomainCount();
      expect(domainCount).to.eq.BN(1);
    });

    it("should fail if ETH is sent", async () => {
      const token = await DSToken.new(TOKEN_ARGS[1]);
      await checkErrorRevert(colonyNetwork.createColony(token.address, { value: 1, gas: createColonyGas }));

      const colonyNetworkBalance = await web3GetBalance(colonyNetwork.address);
      expect(colonyNetworkBalance).to.be.zero;
    });

    it("should log a ColonyAdded event", async () => {
      const token = await DSToken.new(TOKEN_ARGS[1]);
      await expectEvent(colonyNetwork.createColony(token.address), "ColonyAdded");
    });
  });

  describe("when getting existing colonies", () => {
    it("should allow users to get the address of a colony by its index", async () => {
      const token = await DSToken.new(TOKEN_ARGS[1]);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      await colonyNetwork.createColony(token.address);
      const colonyAddress = await colonyNetwork.getColony(3);
      expect(colonyAddress).to.not.equal(ZERO_ADDRESS);
    });

    it("should return an empty address if there is no colony for the index provided", async () => {
      const colonyAddress = await colonyNetwork.getColony(15);
      expect(colonyAddress).to.equal(ZERO_ADDRESS);
    });

    it("should be able to get the Colony version", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const actualColonyVersion = await colony.version();
      expect(version).to.eq.BN(actualColonyVersion);
    });
  });

  describe("when upgrading a colony", () => {
    it("should be able to upgrade a colony, if a sender has founder role", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const colonyEtherRouter = await EtherRouter.at(colony.address);

      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1);
      await metaColony.addNetworkColonyVersion(newVersion, SAMPLE_RESOLVER);

      await colony.upgrade(newVersion);
      const colonyResolver = await colonyEtherRouter.resolver();
      expect(colonyResolver.toLowerCase()).to.equal(SAMPLE_RESOLVER);
    });

    it("should not be able to set colony resolver by directly calling `setResolver`", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1);
      await metaColony.addNetworkColonyVersion(newVersion, SAMPLE_RESOLVER);
      const etherRouter = await EtherRouter.at(colony.address);
      await checkErrorRevert(etherRouter.setResolver(SAMPLE_RESOLVER), "ds-auth-unauthorized");
    });

    it("should NOT be able to upgrade a colony to a lower version", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.subn(1);
      await metaColony.addNetworkColonyVersion(newVersion, SAMPLE_RESOLVER);

      await checkErrorRevert(colony.upgrade(newVersion), "colony-version-must-be-newer");
      expect(version).to.eq.BN(currentColonyVersion);
    });

    it("should NOT be able to upgrade a colony to a nonexistent version", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1);

      await checkErrorRevert(colony.upgrade(newVersion), "colony-version-must-be-registered");
      expect(version).to.eq.BN(currentColonyVersion);
    });

    it("should NOT be able to upgrade a colony if sender don't have founder role", async () => {
      const { colony } = await setupRandomColony(colonyNetwork);
      const colonyEtherRouter = await EtherRouter.at(colony.address);
      const colonyResolver = await colonyEtherRouter.resolver();

      const currentColonyVersion = await colonyNetwork.getCurrentColonyVersion();
      const newVersion = currentColonyVersion.addn(1);
      await metaColony.addNetworkColonyVersion(newVersion, SAMPLE_RESOLVER);

      await checkErrorRevert(colony.upgrade(newVersion, { from: OTHER_ACCOUNT }), "ds-auth-unauthorized");
      expect(colonyResolver).to.not.equal(SAMPLE_RESOLVER);
    });
  });

  describe("when adding a skill", () => {
    it("should not be able to add a global skill, by an address that is not the meta colony ", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(1, true), "colony-must-be-meta-colony");
    });

    it("should NOT be able to add a local skill, by an address that is not a Colony", async () => {
      await checkErrorRevert(colonyNetwork.addSkill(1, false), "colony-caller-must-be-colony");
    });
  });

  describe("when managing ENS names", () => {
    const orbitDBAddress = "QmPFtHi3cmfZerxtH9ySLdzpg1yFhocYDZgEZywdUXHxFU/my-db-name";
    const rootNode = namehash.hash("joincolony.eth");
    let ensRegistry;

    beforeEach(async () => {
      ensRegistry = await ENSRegistry.new();
      await ensRegistry.setOwner(rootNode, colonyNetwork.address);
      await colonyNetwork.setupRegistrar(ensRegistry.address, rootNode);
    });

    it("should be able to get the ENSRegistrar", async () => {
      const registrarAddress = await colonyNetwork.getENSRegistrar();
      expect(registrarAddress).to.equal(ensRegistry.address);
    });

    it("should own the root domains", async () => {
      let owner;
      owner = await ensRegistry.owner(rootNode);
      expect(owner).to.equal(colonyNetwork.address);

      owner = await ensRegistry.owner(namehash.hash("user.joincolony.eth"));
      expect(owner).to.equal(colonyNetwork.address);

      owner = await ensRegistry.owner(namehash.hash("colony.joincolony.eth"));
      expect(owner).to.equal(colonyNetwork.address);
    });

    it("should be able to register one unique label per user", async () => {
      const username = "test";
      const username2 = "test2";
      const hash = namehash.hash("test.user.joincolony.eth");

      // User cannot register blank label
      await checkErrorRevert(colonyNetwork.registerUserLabel("", orbitDBAddress, { from: accounts[1] }), "colony-user-label-invalid");

      // User can register unique label
      await colonyNetwork.registerUserLabel("test", orbitDBAddress, { from: accounts[1] });

      // Check label resolves correctly.
      // First, query the registry to get the resolver
      const resolverAddress = await ensRegistry.resolver(hash);
      expect(resolverAddress).to.equal(colonyNetwork.address);
      // Then query the resolver
      const resolvedAddress = await colonyNetwork.addr(hash);
      expect(resolvedAddress).to.equal(accounts[1]);
      const owner = await ensRegistry.owner(hash);
      expect(owner).to.equal(colonyNetwork.address);

      // Check reverse lookup
      const lookedUpENSDomain = await colonyNetwork.lookupRegisteredENSDomain(accounts[1]);
      expect(lookedUpENSDomain).to.equal("test.user.joincolony.eth");

      // Get stored orbitdb address
      const retrievedOrbitDB = await colonyNetwork.getProfileDBAddress(hash);
      expect(retrievedOrbitDB).to.equal(orbitDBAddress);

      // Label already in use
      await checkErrorRevert(colonyNetwork.registerUserLabel(username, orbitDBAddress, { from: accounts[2] }), "colony-label-already-owned");

      // Can't register two labels for a user
      await checkErrorRevert(colonyNetwork.registerUserLabel(username2, orbitDBAddress, { from: accounts[1] }), "colony-user-label-already-owned");
    });

    it("should be able to register one unique label per colony, if founder", async () => {
      const colonyName = "test";
      const colonyName2 = "test2";
      const hash = namehash.hash("test.colony.joincolony.eth");

      const { colony } = await setupRandomColony(colonyNetwork);

      // Non-founder can't register label for colony
      await checkErrorRevert(colony.registerColonyLabel(colonyName, orbitDBAddress, { from: accounts[1] }), "ds-auth-unauthorized");

      // Founder cannot register blank label
      await checkErrorRevert(colony.registerColonyLabel("", orbitDBAddress, { from: accounts[0] }), "colony-colony-label-invalid");

      // Founder can register label for colony
      await colony.registerColonyLabel(colonyName, orbitDBAddress, { from: accounts[0] });
      const owner = await ensRegistry.owner(hash);
      expect(owner).to.equal(colonyNetwork.address);

      // Check label resolves correctly
      // First, query the registry to get the resolver
      const resolverAddress = await ensRegistry.resolver(hash);
      expect(resolverAddress).to.equal(colonyNetwork.address);
      // Then query the resolver
      const resolvedAddress = await colonyNetwork.addr(hash);
      expect(resolvedAddress).to.equal(colony.address);

      // Check reverse lookup
      const lookedUpENSDomain = await colonyNetwork.lookupRegisteredENSDomain(colony.address);
      expect(lookedUpENSDomain).to.equal("test.colony.joincolony.eth");
      // Get stored orbitdb address
      const retrievedOrbitDB = await colonyNetwork.getProfileDBAddress(hash);
      expect(retrievedOrbitDB).to.equal(orbitDBAddress);

      // Can't register two labels for a colony
      await checkErrorRevert(colony.registerColonyLabel(colonyName2, orbitDBAddress, { from: accounts[0] }), "colony-already-labeled");
    });

    it("should be able to register same name for user and a colony, and reverse lookup still work", async () => {
      // Register user
      await colonyNetwork.registerUserLabel("test", orbitDBAddress, { from: accounts[1] });

      // Set up colony
      const { colony } = await setupRandomColony(colonyNetwork);

      // Register colony
      // Founder can register label for colony
      await colony.registerColonyLabel("test", orbitDBAddress, { from: accounts[0] });

      // Check reverse lookup for colony
      const lookedUpENSDomainColony = await colonyNetwork.lookupRegisteredENSDomain(colony.address);
      expect(lookedUpENSDomainColony).to.equal("test.colony.joincolony.eth");

      // Check reverse lookup
      const lookedUpENSDomainUser = await colonyNetwork.lookupRegisteredENSDomain(accounts[1]);
      expect(lookedUpENSDomainUser).to.equal("test.user.joincolony.eth");
    });

    it("should return a blank address if looking up an address with no Colony-based ENS name", async () => {
      const lookedUpENSDomain = await colonyNetwork.lookupRegisteredENSDomain(accounts[2]);
      expect(lookedUpENSDomain).to.equal("");
    });

    it("should respond correctly to queries regarding ENS interfaces it supports", async () => {
      let response = await colonyNetwork.supportsInterface("0x01ffc9a7"); // supports 'supportsInterface(bytes4)'
      expect(response).to.be.true;
      response = await colonyNetwork.supportsInterface("0x01ffc9a7"); // supports 'addr(bytes32)'
      expect(response).to.be.true;
    });

    it("owner should be able to set and get the ttl of their node", async () => {
      ensRegistry = await ENSRegistry.new();
      const hash = namehash.hash("jane.user.joincolony.eth");

      await ensRegistry.setTTL(hash, 123);
      const ttl = await ensRegistry.ttl(hash);
      expect(ttl).to.eq.BN(123);
    });

    it("use should NOT be able to set and get the ttl of a node they don't own", async () => {
      const hash = namehash.hash("jane.user.joincolony.eth");
      await colonyNetwork.registerUserLabel("jane", orbitDBAddress);
      await checkErrorRevert(ensRegistry.setTTL(hash, 123), "colony-ens-non-owner-access");
    });

    it("setting owner on a subnode should fail for a non existent subnode", async () => {
      ensRegistry = await ENSRegistry.new();
      const hash = namehash.hash("jane.user.joincolony.eth");

      await checkErrorRevert(ensRegistry.setSubnodeOwner(hash, hash, accounts[0]), "unowned-node");
    });
  });
});
