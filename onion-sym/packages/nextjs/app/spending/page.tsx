"use client";

import type { NextPage } from "next";
import { formatEther, parseEther } from "viem";
import { Address } from "@scaffold-ui/components";
import { useScaffoldReadContract, useScaffoldWriteContract, useScaffoldEventHistory } from "~~/hooks/scaffold-eth";

const Spending: NextPage = () => {
  const { data: maxPerTx } = useScaffoldReadContract({
    contractName: "SpendingPolicy",
    functionName: "maxPerTx",
  });

  const { data: maxPerDay } = useScaffoldReadContract({
    contractName: "SpendingPolicy",
    functionName: "maxPerDay",
  });

  const { data: dailySpent } = useScaffoldReadContract({
    contractName: "SpendingPolicy",
    functionName: "dailySpent",
  });

  const { data: remaining } = useScaffoldReadContract({
    contractName: "SpendingPolicy",
    functionName: "remainingDailyBudget",
  });

  const { data: agentAddr } = useScaffoldReadContract({
    contractName: "SpendingPolicy",
    functionName: "agent",
  });

  const { data: ownerAddr } = useScaffoldReadContract({
    contractName: "SpendingPolicy",
    functionName: "owner",
  });

  const { writeContractAsync: writeSpending, isPending: spendPending } = useScaffoldWriteContract({
    contractName: "SpendingPolicy",
  });

  const { data: spendEvents } = useScaffoldEventHistory({
    contractName: "SpendingPolicy",
    eventName: "SpendRecorded",
    watch: true,
    fromBlock: 0n,
  });

  const pctUsed = maxPerDay && dailySpent ? Number((dailySpent * 100n) / maxPerDay) : 0;

  const tryRecordSpend = async (amount: string, service: string) => {
    try {
      await writeSpending({
        functionName: "recordSpend",
        args: [parseEther(amount), service],
      });
    } catch (e: unknown) {
      console.error("Spend reverted:", e);
    }
  };

  return (
    <div className="flex flex-col grow p-6 max-w-4xl mx-auto gap-6 font-mono">
      <div>
        <div className="text-[#ffcc00] text-sm font-bold uppercase tracking-wider">
          spending policy
        </div>
        <div className="text-[10px] text-[#333] uppercase tracking-[0.15em] mt-1">
          SpendingPolicy.sol &mdash; on-chain guardrails your agent cannot exceed
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-[1px] bg-[#1a1a2e]">
        <div className="bg-[#0a0a0f] p-4">
          <div className="text-[10px] text-[#555] uppercase tracking-wider">max/tx</div>
          <div className="text-[#00ff88] text-xl font-bold mt-1">
            {maxPerTx ? formatEther(maxPerTx) : "..."}
            <span className="text-[10px] text-[#555] ml-1">ETH</span>
          </div>
        </div>
        <div className="bg-[#0a0a0f] p-4">
          <div className="text-[10px] text-[#555] uppercase tracking-wider">max/day</div>
          <div className="text-[#00ccff] text-xl font-bold mt-1">
            {maxPerDay ? formatEther(maxPerDay) : "..."}
            <span className="text-[10px] text-[#555] ml-1">ETH</span>
          </div>
        </div>
        <div className="bg-[#0a0a0f] p-4">
          <div className="text-[10px] text-[#555] uppercase tracking-wider">remaining</div>
          <div className={`text-xl font-bold mt-1 ${pctUsed > 80 ? "text-[#ff4444]" : "text-[#00ff88]"}`}>
            {remaining !== undefined ? formatEther(remaining) : "..."}
            <span className="text-[10px] text-[#555] ml-1">ETH</span>
          </div>
        </div>
      </div>

      {/* Budget bar */}
      <div>
        <div className="flex justify-between text-[10px] text-[#555] uppercase tracking-wider mb-2">
          <span>daily budget consumed</span>
          <span className={pctUsed > 80 ? "text-[#ff4444]" : "text-[#00ff88]"}>{pctUsed}%</span>
        </div>
        <div className="w-full h-2 bg-[#1a1a2e] overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${pctUsed > 80 ? "bg-[#ff4444]" : "bg-[#00ff88]"}`}
            style={{ width: `${Math.min(pctUsed, 100)}%` }}
          />
        </div>
      </div>

      {/* Addresses */}
      <div className="flex gap-8 text-xs border border-[#1a1a2e] p-3 bg-[#0e0e18]">
        <div className="flex items-center gap-2">
          <span className="text-[#555] text-[10px] uppercase">owner:</span>
          {ownerAddr && <Address address={ownerAddr} />}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#555] text-[10px] uppercase">agent:</span>
          {agentAddr && <Address address={agentAddr} />}
        </div>
      </div>

      {/* Demo buttons */}
      <div className="border border-[#1a1a2e] bg-[#0e0e18] p-4">
        <div className="text-[10px] text-[#555] uppercase tracking-wider mb-3">
          $ par spend --test
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="border border-[#00ff88] text-[#00ff88] text-[10px] uppercase tracking-wider px-3 py-2 hover:bg-[#00ff8810] transition-colors disabled:opacity-30"
            disabled={spendPending}
            onClick={() => tryRecordSpend("0.5", "weather")}
          >
            0.5 eth / weather
          </button>
          <button
            className="border border-[#ffcc00] text-[#ffcc00] text-[10px] uppercase tracking-wider px-3 py-2 hover:bg-[#ffcc0010] transition-colors disabled:opacity-30"
            disabled={spendPending}
            onClick={() => tryRecordSpend("1", "flights")}
          >
            1.0 eth / flights
          </button>
          <button
            className="border border-[#ff4444] text-[#ff4444] text-[10px] uppercase tracking-wider px-3 py-2 hover:bg-[#ff444410] transition-colors disabled:opacity-30"
            disabled={spendPending}
            onClick={() => tryRecordSpend("2", "booking")}
          >
            2.0 eth / over limit
          </button>
          <button
            className="border border-[#ff4444] text-[#ff4444] text-[10px] uppercase tracking-wider px-3 py-2 hover:bg-[#ff444410] transition-colors disabled:opacity-30"
            disabled={spendPending}
            onClick={() => tryRecordSpend("0.5", "gambling")}
          >
            0.5 eth / blocked svc
          </button>
        </div>
      </div>

      {/* Events */}
      <div className="border border-[#1a1a2e] bg-[#0e0e18]">
        <div className="text-[10px] text-[#555] uppercase tracking-wider p-3 border-b border-[#1a1a2e]">
          SpendRecorded events
        </div>
        <div className="overflow-y-auto max-h-48 p-1">
          {!spendEvents || spendEvents.length === 0 ? (
            <div className="text-[#222] text-xs italic p-3">no spends recorded yet...</div>
          ) : (
            spendEvents.map((e, i) => (
              <div
                key={i}
                className="px-3 py-2 border-l-2 border-l-[#00ff88] text-xs flex items-center gap-3"
              >
                <span className="text-[#00ff88] font-bold w-20">
                  {formatEther(e.args?.amount || 0n)} ETH
                </span>
                <span className="text-[#888]">{e.args?.service}</span>
                <span className="text-[#333] ml-auto text-[10px]">
                  blk #{e.blockNumber?.toString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Spending;
