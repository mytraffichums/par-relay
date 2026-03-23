"use client";

import { useState, useEffect, useCallback } from "react";
import type { NextPage } from "next";

const AGENT_API = "http://localhost:8003/audit";
const SERVICE_API = "http://localhost:9000/logs";

type AgentLog = {
  id: number;
  timestamp: number;
  method: string;
  url: string;
  private: number;
  status_code: number | null;
  circuit: string | null;
  response_summary: string | null;
  tx_hash: string | null;
};

type ServiceLog = {
  timestamp: string;
  endpoint: string;
  method: string;
  client_host: string;
  client_port: number;
  headers: Record<string, string>;
  query_params: Record<string, string>;
};

const MethodTag = ({ method }: { method: string }) => {
  const colors: Record<string, string> = {
    GET: "text-[#00ccff]",
    POST: "text-[#ffcc00]",
    DELETE: "text-[#ff4444]",
  };
  return <span className={`${colors[method] || "text-[#555]"} font-bold text-xs`}>{method}</span>;
};

const Dashboard: NextPage = () => {
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [serviceLogs, setServiceLogs] = useState<ServiceLog[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [aResp, sResp] = await Promise.all([
        fetch(AGENT_API).then(r => r.json()).catch(() => []),
        fetch(SERVICE_API).then(r => r.json()).catch(() => []),
      ]);
      setAgentLogs(aResp);
      setServiceLogs(sResp);
      setTick(t => t + 1);
    } catch {
      /* endpoints not running */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  const clearLogs = async () => {
    await fetch("http://localhost:9000/logs", { method: "DELETE" }).catch(() => {});
    refresh();
  };

  return (
    <div className="flex flex-col grow p-4 gap-4 font-mono">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[#1a1a2e] pb-3">
        <div>
          <div className="text-[#00ff88] text-sm font-bold uppercase tracking-wider">
            privacy dashboard
          </div>
          <div className="text-[10px] text-[#333] uppercase tracking-[0.15em] mt-1">
            poll #{tick} &middot; 2s interval &middot;
            <span className="text-[#00ff88] cursor-blink"> _</span>
          </div>
        </div>
        <button
          className="text-[10px] uppercase tracking-wider border border-[#ff4444] text-[#ff4444] px-3 py-1 hover:bg-[#ff444420] transition-colors"
          onClick={clearLogs}
        >
          clear logs
        </button>
      </div>

      {/* Split panes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[1px] bg-[#1a1a2e] grow">
        {/* Left: Agent Audit */}
        <div className="bg-[#0a0a0f] p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[#00ff88] text-xs font-bold uppercase">agent audit</span>
            <span className="text-[10px] text-[#333] border border-[#1a1a2e] px-1">:8003</span>
          </div>
          <div className="text-[10px] text-[#333] mb-3">
            what your agent knows it sent &mdash; full local audit trail
          </div>
          <div className="overflow-y-auto flex-1 max-h-[65vh] space-y-1">
            {agentLogs.length === 0 ? (
              <div className="text-[#222] text-xs italic">waiting for requests...</div>
            ) : (
              agentLogs.map(log => (
                <div
                  key={log.id}
                  className={`p-2 border-l-2 ${
                    log.private
                      ? "border-l-[#00ff88] bg-[#00ff8808]"
                      : "border-l-[#ff8800] bg-[#ff880008]"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <MethodTag method={log.method} />
                    <span className="text-[#888] truncate flex-1">{log.url}</span>
                    <span
                      className={`text-[10px] px-1 ${
                        log.status_code && log.status_code >= 400
                          ? "text-[#ff4444] border border-[#ff4444]"
                          : "text-[#00ff88] border border-[#00ff88]"
                      }`}
                    >
                      {log.status_code || "???"}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#333] mt-1 flex gap-3 flex-wrap">
                    <span>{new Date(log.timestamp * 1000).toLocaleTimeString()}</span>
                    <span className={log.private ? "text-[#00ff88]" : "text-[#ff8800]"}>
                      {log.private ? "ONION" : "DIRECT"}
                    </span>
                    {log.circuit && (
                      <span className="text-[#444]">
                        {JSON.parse(log.circuit)
                          .map((u: string) => u.replace("http://", "").replace("https://", ""))
                          .join(" -> ")}
                      </span>
                    )}
                  </div>
                  {log.response_summary && (
                    <div className="text-[10px] text-[#282828] mt-1 truncate">{log.response_summary}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Service Logs */}
        <div className="bg-[#0a0a0f] p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[#ff8800] text-xs font-bold uppercase">service view</span>
            <span className="text-[10px] text-[#333] border border-[#1a1a2e] px-1">:9000</span>
          </div>
          <div className="text-[10px] text-[#333] mb-3">
            what the destination service sees &mdash; who called it
          </div>
          <div className="overflow-y-auto flex-1 max-h-[65vh] space-y-1">
            {serviceLogs.length === 0 ? (
              <div className="text-[#222] text-xs italic">no requests received...</div>
            ) : (
              serviceLogs.map((log, i) => (
                <div key={i} className="p-2 bg-[#0e0e18] border-l-2 border-l-[#1a1a2e]">
                  <div className="flex items-center gap-2 text-xs">
                    <MethodTag method={log.method} />
                    <span className="text-[#888]">{log.endpoint}</span>
                  </div>
                  <div className="text-[10px] mt-1 space-y-0.5">
                    <div className="text-[#444]">
                      client:{" "}
                      <span className="text-[#ff4444] font-bold">
                        {log.client_host}:{log.client_port}
                      </span>
                    </div>
                    <div className="text-[#333]">
                      params: {JSON.stringify(log.query_params)}
                    </div>
                    <div className="text-[#222] truncate">
                      ua: {log.headers?.["user-agent"] || "n/a"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
