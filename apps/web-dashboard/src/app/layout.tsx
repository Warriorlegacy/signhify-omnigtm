import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Signhify OmniGTM',
  description: 'Autonomous GTM, 60 FPS 3D previews and MCP tooling on a $0 stack.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
