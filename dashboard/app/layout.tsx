import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NOMAD Stop Detection Dashboard',
  description: 'Learn, visualize, and compare stop detection algorithms used in human mobility science.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
