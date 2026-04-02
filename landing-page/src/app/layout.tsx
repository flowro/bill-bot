import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bill Bot - Smart Expense Tracking with AI',
  description: 'Track expenses with your phone camera. Snap receipts, get instant categorization, and ask questions in plain English. Perfect for tradespeople and small businesses.',
  keywords: 'expense tracking, receipt scanner, AI, telegram bot, small business, tradesperson, accounting',
  openGraph: {
    title: 'Bill Bot - Smart Expense Tracking with AI',
    description: 'Track expenses with your phone camera. Snap receipts, get instant categorization.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}