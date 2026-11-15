"use client";
import dynamic from "next/dynamic";
import { PhoneShell } from "@/components/ui";
const AgentApp = dynamic(() => import("@/components/agent/AgentApp"), { ssr: false });
export default function Page() {
  return <PhoneShell><AgentApp /></PhoneShell>;
}
