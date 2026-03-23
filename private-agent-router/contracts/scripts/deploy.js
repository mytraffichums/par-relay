const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer, agentAccount] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Agent account:", agentAccount.address);

  // Deploy SpendingPolicy
  const SpendingPolicy = await ethers.getContractFactory("SpendingPolicy");
  const policy = await SpendingPolicy.deploy(
    agentAccount.address,
    ethers.parseEther("1"),   // maxPerTx
    ethers.parseEther("10")   // maxPerDay
  );
  await policy.waitForDeployment();
  const policyAddr = await policy.getAddress();
  console.log("SpendingPolicy deployed to:", policyAddr);

  // Enable services
  await policy.toggleService("weather", true);
  await policy.toggleService("flights", true);
  await policy.toggleService("booking", true);
  console.log("Services enabled: weather, flights, booking");

  // Deploy BlindTokenVault
  const BlindTokenVault = await ethers.getContractFactory("BlindTokenVault");
  const vault = await BlindTokenVault.deploy();
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("BlindTokenVault deployed to:", vaultAddr);

  // Mint some demo tokens
  const preimages = ["token1", "token2", "token3"].map(s =>
    ethers.encodeBytes32String(s)
  );
  const commitments = preimages.map(p =>
    ethers.keccak256(ethers.solidityPacked(["bytes32"], [p]))
  );
  await vault.mintBatch(commitments);
  console.log("Minted 3 demo blind tokens");

  // Deploy AuditLog
  const AuditLog = await ethers.getContractFactory("AuditLog");
  const auditLog = await AuditLog.deploy();
  await auditLog.waitForDeployment();
  const auditAddr = await auditLog.getAddress();
  console.log("AuditLog deployed to:", auditAddr);

  // Update config.json with contract addresses
  const configPath = path.resolve(__dirname, "../../config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  config.contracts = {
    SpendingPolicy: policyAddr,
    BlindTokenVault: vaultAddr,
    AuditLog: auditAddr,
    deployer: deployer.address,
    agent: agentAccount.address,
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("Config updated with contract addresses");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
