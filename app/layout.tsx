import React from 'react';

export const metadata = {
  title: 'ระบบบริหารน้ำหนัก Big Bag',
  description: 'Big Bag Weight Management & Dispatch System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`body { font-family: 'Sarabun', sans-serif; }`}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
