"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { encodePacked, keccak256 } from "viem";
import { useScaffoldReadContract, useScaffoldWriteContract, useScaffoldEventHistory } from "~~/hooks/scaffold-eth";

const Audit: NextPage = () => {
  const [hashInput, setHashInput] = useState("");
  const [circuitInput, setCircuitInput] = useState("");

  const { data: entryCount } = useScaffoldReadContract({
    contractName: "AuditLog",
    functionName: "entryCount",
  });

  const { writeContractAsync: writeAudit, isPending } = useScaffoldWriteContract({
    contractName: "AuditLog",
  });

  const { data: logEvents } = useScaffoldEventHistory({
    contractName: "AuditLog",
    eventName: "EntryLogged",
    watch: true,
    fromBlock: 0n,
  });

  const logEntry = async () => {
    const payloadHash = keccak256(encodePacked(["string"], [hashInput || "demo-payload"]));
    const circuitId = keccak256(encodePacked(["string"], [circuitInput || "circuit-1"]));
    await writeAudit({
      functionName: "log",
      args: [payloadHash, circuitId],
    });
    setHashInput("");
    setCircuitInput("");
  };

  return (
    <div className="flex flex-col grow p-6 max-w-4xl mx-auto gap-6 font-mono">
      <div>
        <div className="text-[#ff8800] text-sm font-bold uppercase tracking-wider">
          on-chain audit log
        </div>
        <div className="text-[10px] text-[#333] uppercase tracking-[0.15em] mt-1">
          AuditLog.sol &mdash; relays log payload hashes per circuit. hashes only, no content.
        </div>
      </div>

      {/* Entry count */}
      <div className="bg-[#0e0e18] border border-[#1a1a2e] p-4 inline-flex items-center gap-3 w-fit">
        <span className="text-[10px] text-[#555] uppercase tracking-wider">total entries:</span>
        <span className="text-[#ff8800] text-2xl font-bold">{entryCount?.toString() || "0"}</span>
      </div>

      {/* Log a hop */}
      <div className="border border-[#1a1a2e] bg-[#0e0e18] p-4">
        <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">
          $ par audit log-hop
        </div>
        <div className="text-[10px] text-[#333] mb-3">
          simulate a relay logging a payload hash for a circuit id
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="payload description..."
            className="flex-1 bg-[#0a0a0f] border border-[#1a1a2e] text-[#c8c8d0] text-xs px-3 py-2 font-mono focus:border-[#ff8800] focus:outline-none"
            value={hashInput}
            onChange={e => setHashInput(e.target.value)}
          />
          <input
            type="text"
            placeholder="circuit id..."
            className="flex-1 bg-[#0a0a0f] border border-[#1a1a2e] text-[#c8c8d0] text-xs px-3 py-2 font-mono focus:border-[#ff8800] focus:outline-none"
            value={circuitInput}
            onChange={e => setCircuitInput(e.target.value)}
          />
          <button
            className="border border-[#ff8800] text-[#ff8800] text-[10px] uppercase tracking-wider px-4 py-2 hover:bg-[#ff880010] transition-colors disabled:opacity-30"
            disabled={isPending}
            onClick={logEntry}
          >
            log hop
          </button>
        </div>
      </div>

      {/* Events table */}
      <div className="border border-[#1a1a2e] bg-[#0e0e18]">
        <div className="text-[10px] text-[#555] uppercase tracking-wider p-3 border-b border-[#1a1a2e]">
          EntryLogged events
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[#ff8800] uppercase tracking-wider border-b border-[#1a1a2e]">
                <th className="text-left p-3 font-normal">circuit_id</th>
                <th className="text-left p-3 font-normal">payload_hash</th>
                <th className="text-left p-3 font-normal">relay</th>
                <th className="text-right p-3 font-normal">block</th>
              </tr>
            </thead>
            <tbody>
              {!logEvents || logEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-[#222] italic p-4">
                    no entries logged yet...
                  </td>
                </tr>
              ) : (
                logEvents.map((e, i) => (
                  <tr key={i} className="border-b border-[#0e0e18] hover:bg-[#111120]">
                    <td className="p-3 text-[#888] truncate max-w-[140px]" title={e.args?.circuitId}>
                      {e.args?.circuitId?.slice(0, 16)}...
                    </td>
                    <td className="p-3 text-[#888] truncate max-w-[140px]" title={e.args?.payloadHash}>
                      {e.args?.payloadHash?.slice(0, 16)}...
                    </td>
                    <td className="p-3 text-[#555] truncate max-w-[120px]" title={e.args?.relay}>
                      {e.args?.relay?.slice(0, 12)}...
                    </td>
                    <td className="p-3 text-right text-[#333]">
                      #{e.blockNumber?.toString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Audit;
