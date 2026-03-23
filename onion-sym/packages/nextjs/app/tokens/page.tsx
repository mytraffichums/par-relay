"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { encodePacked, keccak256 } from "viem";
import { useScaffoldReadContract, useScaffoldWriteContract, useScaffoldEventHistory } from "~~/hooks/scaffold-eth";

const Tokens: NextPage = () => {
  const [mintSecret, setMintSecret] = useState("");
  const [preimageInput, setPreimageInput] = useState("");

  const { data: totalMinted } = useScaffoldReadContract({
    contractName: "BlindTokenVault",
    functionName: "totalMinted",
  });

  const { data: totalRedeemed } = useScaffoldReadContract({
    contractName: "BlindTokenVault",
    functionName: "totalRedeemed",
  });

  const { data: activeTokens } = useScaffoldReadContract({
    contractName: "BlindTokenVault",
    functionName: "activeTokens",
  });

  const { writeContractAsync: writeVault, isPending } = useScaffoldWriteContract({
    contractName: "BlindTokenVault",
  });

  const { data: mintEvents } = useScaffoldEventHistory({
    contractName: "BlindTokenVault",
    eventName: "TokenMinted",
    watch: true,
    fromBlock: 0n,
  });

  const { data: redeemEvents } = useScaffoldEventHistory({
    contractName: "BlindTokenVault",
    eventName: "TokenRedeemed",
    watch: true,
    fromBlock: 0n,
  });

  const mintToken = async () => {
    if (!mintSecret) return;
    const preimage = keccak256(encodePacked(["string"], [mintSecret]));
    const commitment = keccak256(encodePacked(["bytes32"], [preimage]));
    await writeVault({
      functionName: "mintCommitment",
      args: [commitment],
    });
    setMintSecret("");
  };

  const redeemToken = async () => {
    if (!preimageInput) return;
    const preimage = keccak256(encodePacked(["string"], [preimageInput]));
    try {
      await writeVault({
        functionName: "redeem",
        args: [preimage],
      });
    } catch (e) {
      console.error("Redeem failed:", e);
    }
    setPreimageInput("");
  };

  return (
    <div className="flex flex-col grow p-6 max-w-4xl mx-auto gap-6 font-mono">
      <div>
        <div className="text-[#00ccff] text-sm font-bold uppercase tracking-wider">
          blind token vault
        </div>
        <div className="text-[10px] text-[#333] uppercase tracking-[0.15em] mt-1">
          BlindTokenVault.sol &mdash; hash-commitment payment tokens. unlinkable mint/redeem.
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-[1px] bg-[#1a1a2e]">
        <div className="bg-[#0a0a0f] p-4">
          <div className="text-[10px] text-[#555] uppercase tracking-wider">minted</div>
          <div className="text-[#00ccff] text-2xl font-bold mt-1">{totalMinted?.toString() || "0"}</div>
        </div>
        <div className="bg-[#0a0a0f] p-4">
          <div className="text-[10px] text-[#555] uppercase tracking-wider">redeemed</div>
          <div className="text-[#ff8800] text-2xl font-bold mt-1">{totalRedeemed?.toString() || "0"}</div>
        </div>
        <div className="bg-[#0a0a0f] p-4">
          <div className="text-[10px] text-[#555] uppercase tracking-wider">active</div>
          <div className="text-[#00ff88] text-2xl font-bold mt-1">{activeTokens?.toString() || "0"}</div>
        </div>
      </div>

      {/* Mint */}
      <div className="border border-[#1a1a2e] bg-[#0e0e18] p-4">
        <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">
          $ par token mint
        </div>
        <div className="text-[10px] text-[#333] mb-3">
          enter a secret. contract stores hash(hash(secret)) as commitment. only you know the preimage.
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="secret phrase..."
            className="flex-1 bg-[#0a0a0f] border border-[#1a1a2e] text-[#c8c8d0] text-xs px-3 py-2 font-mono focus:border-[#00ccff] focus:outline-none"
            value={mintSecret}
            onChange={e => setMintSecret(e.target.value)}
            onKeyDown={e => e.key === "Enter" && mintToken()}
          />
          <button
            className="border border-[#00ccff] text-[#00ccff] text-[10px] uppercase tracking-wider px-4 py-2 hover:bg-[#00ccff10] transition-colors disabled:opacity-30"
            disabled={isPending || !mintSecret}
            onClick={mintToken}
          >
            mint
          </button>
        </div>
      </div>

      {/* Redeem */}
      <div className="border border-[#1a1a2e] bg-[#0e0e18] p-4">
        <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">
          $ par token redeem
        </div>
        <div className="text-[10px] text-[#333] mb-3">
          provide original secret. anyone can redeem with the secret. redeemer =/= minter.
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="original secret..."
            className="flex-1 bg-[#0a0a0f] border border-[#1a1a2e] text-[#c8c8d0] text-xs px-3 py-2 font-mono focus:border-[#00ff88] focus:outline-none"
            value={preimageInput}
            onChange={e => setPreimageInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && redeemToken()}
          />
          <button
            className="border border-[#00ff88] text-[#00ff88] text-[10px] uppercase tracking-wider px-4 py-2 hover:bg-[#00ff8810] transition-colors disabled:opacity-30"
            disabled={isPending || !preimageInput}
            onClick={redeemToken}
          >
            redeem
          </button>
        </div>
      </div>

      {/* Event logs side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[1px] bg-[#1a1a2e]">
        <div className="bg-[#0a0a0f]">
          <div className="text-[10px] text-[#555] uppercase tracking-wider p-3 border-b border-[#1a1a2e]">
            TokenMinted events
          </div>
          <div className="overflow-y-auto max-h-40 p-1">
            {!mintEvents || mintEvents.length === 0 ? (
              <div className="text-[#222] text-xs italic p-3">none yet...</div>
            ) : (
              mintEvents.map((e, i) => (
                <div key={i} className="text-[10px] font-mono px-3 py-1.5 text-[#00ccff] border-l-2 border-l-[#00ccff] truncate">
                  {e.args?.commitment}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[#0a0a0f]">
          <div className="text-[10px] text-[#555] uppercase tracking-wider p-3 border-b border-[#1a1a2e]">
            TokenRedeemed events
          </div>
          <div className="overflow-y-auto max-h-40 p-1">
            {!redeemEvents || redeemEvents.length === 0 ? (
              <div className="text-[#222] text-xs italic p-3">none yet...</div>
            ) : (
              redeemEvents.map((e, i) => (
                <div key={i} className="text-[10px] font-mono px-3 py-1.5 border-l-2 border-l-[#00ff88] truncate">
                  <span className="text-[#00ff88]">{e.args?.commitment?.slice(0, 18)}...</span>
                  <span className="text-[#333]"> -&gt; </span>
                  <span className="text-[#888]">{e.args?.redeemer?.slice(0, 12)}...</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tokens;
