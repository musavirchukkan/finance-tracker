import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quick Add",
  appleWebApp: {
    title: "Quick Add",
  },
};

export default function QuickAddLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
