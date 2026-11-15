"use client";
import dynamic from "next/dynamic";
const CustomerApp = dynamic(() => import("@/components/customer/CustomerApp"), { ssr: false });
// Full screen on every device: phones get the app, wider screens the desk layout (CustomerApp decides).
export default function Page() {
  return <div className="h-[100dvh] w-full overflow-hidden"><CustomerApp /></div>;
}
