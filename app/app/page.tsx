"use client";
import dynamic from "next/dynamic";
import { PhoneShell } from "@/components/ui";
const CustomerApp = dynamic(() => import("@/components/customer/CustomerApp"), { ssr: false });
export default function Page() {
  return <PhoneShell><CustomerApp /></PhoneShell>;
}
