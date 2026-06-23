import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Document Summarizer',
  description: 'Upload documents and view generated summaries.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
