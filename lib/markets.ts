/** Markets covered by the CoStar data kit. Houston is the demo market (Greater Heights). */
export interface Market { city: string; anchor: string; lat: number; lng: number; demoHood: string; zoom: number }

export const MARKETS: Market[] = [
  { city: "Houston", anchor: "Downtown Houston", lat: 29.7589, lng: -95.3677, demoHood: "Greater Heights", zoom: 12 },
  { city: "Los Angeles", anchor: "Downtown LA", lat: 34.0522, lng: -118.2437, demoHood: "Downtown LA", zoom: 12 },
];
export const DEMO_CITY = process.env.NEXT_PUBLIC_DEMO_CITY || "Houston";
export const marketOf = (city?: string) => MARKETS.find((m) => m.city === city) || MARKETS.find((m) => m.city === DEMO_CITY) || MARKETS[0];
export const anchorShort = (city?: string) => (marketOf(city).city === "Houston" ? "downtown" : "DTLA");
