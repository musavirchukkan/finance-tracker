"use client";

import { useSyncExternalStore } from "react";

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Hello";
}

/** Time-of-day greeting in the browser's local timezone. */
export function LocalGreeting({ name }: { name: string }) {
  const greeting = useSyncExternalStore(
    () => () => {},
    () => greetingForHour(new Date().getHours()),
    () => "Hello",
  );

  return (
    <h2 className="greeting-title">
      {greeting}, {name}
    </h2>
  );
}
