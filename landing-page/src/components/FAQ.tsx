'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const faqs = [
  {
    question: "What types of receipts does Bill Bot support?",
    answer: "Bill Bot works with paper receipts, digital receipts, invoices, and bills. It can read multiple languages and handles different formats from various vendors."
  },
  {
    question: "How accurate is the AI categorization?",
    answer: "Our AI is trained specifically for tradespeople and small businesses, achieving 95%+ accuracy on common expense categories like materials, fuel, tools, food, labor, and vehicle expenses."
  },
  {
    question: "Is my data secure and private?",
    answer: "Yes. Receipt images are processed securely and automatically deleted after extraction. Only the extracted data (amount, vendor, category) is stored, never the actual receipt images."
  },
  {
    question: "Can I export my data?",
    answer: "Absolutely. You can export your expense data as CSV for Excel or PDF summaries for your accountant. Pro users get additional export options and weekly summaries."
  },
  {
    question: "Do I need to download an app?",
    answer: "No! Bill Bot works through Telegram, which you probably already have. If not, Telegram is free and works on any device - phone, tablet, or computer."
  },
  {
    question: "What if Bill Bot makes a mistake?",
    answer: "You can easily correct any mistakes by replying with the correct information. Bill Bot learns from your corrections to improve accuracy over time."
  }
]

export default function FAQ() {
  const [openItems, setOpenItems] = useState<number[]>([])

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  return (
    <div className="py-16 bg-white" id="faq">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-base text-blue-600 font-semibold tracking-wide uppercase">FAQ</h2>
          <p className="mt-2 text-3xl leading-8 font-bold tracking-tight text-gray-900 sm:text-4xl">
            Frequently Asked Questions
          </p>
        </div>

        <div className="mt-12">
          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="border border-gray-200 rounded-lg">
                <button
                  className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
                  onClick={() => toggleItem(index)}
                >
                  <span className="font-medium text-gray-900">{faq.question}</span>
                  {openItems.includes(index) ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </button>
                {openItems.includes(index) && (
                  <div className="px-6 pb-4">
                    <p className="text-gray-700">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}