const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SpendingPolicy", function () {
  let policy, owner, agent, other;

  beforeEach(async function () {
    [owner, agent, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SpendingPolicy");
    policy = await Factory.deploy(
      agent.address,
      ethers.parseEther("1"),   // maxPerTx = 1 ETH
      ethers.parseEther("5")    // maxPerDay = 5 ETH
    );
  });

  it("allows agent to record spend within limits", async function () {
    await policy.toggleService("weather", true);
    await policy.connect(agent).recordSpend(ethers.parseEther("0.5"), "weather");
    const remaining = await policy.remainingDailyBudget();
    expect(remaining).to.equal(ethers.parseEther("4.5"));
  });

  it("rejects spend exceeding per-tx limit", async function () {
    await policy.toggleService("weather", true);
    await expect(
      policy.connect(agent).recordSpend(ethers.parseEther("2"), "weather")
    ).to.be.revertedWith("exceeds per-tx limit");
  });

  it("rejects spend exceeding daily limit", async function () {
    await policy.toggleService("weather", true);
    for (let i = 0; i < 5; i++) {
      await policy.connect(agent).recordSpend(ethers.parseEther("1"), "weather");
    }
    await expect(
      policy.connect(agent).recordSpend(ethers.parseEther("0.1"), "weather")
    ).to.be.revertedWith("exceeds daily limit");
  });

  it("rejects non-allowed services", async function () {
    await expect(
      policy.connect(agent).recordSpend(ethers.parseEther("0.1"), "blocked")
    ).to.be.revertedWith("service not allowed");
  });

  it("rejects non-agent callers", async function () {
    await policy.toggleService("weather", true);
    await expect(
      policy.connect(other).recordSpend(ethers.parseEther("0.1"), "weather")
    ).to.be.revertedWith("not agent");
  });
});
