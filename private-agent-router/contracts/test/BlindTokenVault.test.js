const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BlindTokenVault", function () {
  let vault, owner, redeemer;

  beforeEach(async function () {
    [owner, redeemer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BlindTokenVault");
    vault = await Factory.deploy();
  });

  it("mints and redeems a token", async function () {
    const preimage = ethers.encodeBytes32String("secret123");
    const commitment = ethers.keccak256(ethers.solidityPacked(["bytes32"], [preimage]));

    await vault.mintCommitment(commitment);
    expect(await vault.isValid(commitment)).to.be.true;

    await vault.connect(redeemer).redeem(preimage);
    expect(await vault.isValid(commitment)).to.be.false;
  });

  it("rejects double redemption", async function () {
    const preimage = ethers.encodeBytes32String("secret456");
    const commitment = ethers.keccak256(ethers.solidityPacked(["bytes32"], [preimage]));

    await vault.mintCommitment(commitment);
    await vault.connect(redeemer).redeem(preimage);

    await expect(
      vault.connect(redeemer).redeem(preimage)
    ).to.be.revertedWith("already redeemed");
  });

  it("rejects unknown commitment", async function () {
    const preimage = ethers.encodeBytes32String("unknown");
    await expect(
      vault.connect(redeemer).redeem(preimage)
    ).to.be.revertedWith("unknown commitment");
  });

  it("batch mints commitments", async function () {
    const preimages = ["a", "b", "c"].map(s => ethers.encodeBytes32String(s));
    const commitments = preimages.map(p =>
      ethers.keccak256(ethers.solidityPacked(["bytes32"], [p]))
    );

    await vault.mintBatch(commitments);
    for (const c of commitments) {
      expect(await vault.isValid(c)).to.be.true;
    }
  });
});
