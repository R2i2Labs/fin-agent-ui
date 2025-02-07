"use client";

import * as React from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { usePlaygroundStore } from "@/stores/PlaygroundStore";
import { AgentIcon } from "./ui/Icons";
import { useQueryState } from "nuqs";

export function AgentSelector() {
  const { agents, setMessages } = usePlaygroundStore();

  const [agentId, setAgentId] = useQueryState("agent", {
    parse: (value) => value || undefined,
    history: "push",
  });

  const [, setModel] = useQueryState("model", {
    history: "push",
  });

  return (
    <Select
      value={agentId || ""}
      onValueChange={(value) => {
        const newAgent = value === agentId ? "" : value;
        setModel(
          agents.find((agent) => agent.value === newAgent)?.model.provider ||
            "",
        );
        setAgentId(newAgent);
        setMessages([]);
      }}
    >
      <SelectTrigger className="w-full border-primary/20 border text-xs font-medium bg-primaryAccent/50 rounded-lg uppercase">
        <SelectValue placeholder="Select Agent" />
      </SelectTrigger>
      <SelectContent className="border-primary/20 border bg-primaryAccent/50 rounded-lg">
        {agents.map((agent, index) => (
          <SelectItem key={`${agent.value}-${index}`} value={agent.value}>
            <div className="flex items-center gap-2 cursor-pointer uppercase text-xs font-medium">
              <AgentIcon /> {agent.label}
            </div>
          </SelectItem>
        ))}
        {agents.length === 0 && (
          <SelectItem
            value="no-agents"
            className="text-center cursor-not-allowed select-none"
          >
            No agents found
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
