import { Shield, Globe, Zap, MessageSquare, FileDown, Calculator } from 'lucide-react'

export default function Features() {
  const features = [
    {
      icon: Zap,
      title: 'Instant Processing',
      description: 'AI extracts data from receipts in under 3 seconds'
    },
    {
      icon: MessageSquare,
      title: 'Natural Language',
      description: 'Ask "How much did I spend on materials last month?" in plain English'
    },
    {
      icon: Shield,
      title: 'Privacy First',
      description: 'Your receipts are processed securely and never stored permanently'
    },
    {
      icon: Globe,
      title: 'Works Anywhere',
      description: 'Use Telegram on any device - phone, tablet, or computer'
    },
    {
      icon: Calculator,
      title: 'Smart Categorization',
      description: 'Auto-categorizes expenses for materials, fuel, tools, food, and more'
    },
    {
      icon: FileDown,
      title: 'Easy Export',
      description: 'Export to CSV or PDF for your accountant or tax filing'
    }
  ]

  return (
    <div className="py-16 bg-gray-50" id="features">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:text-center">
          <h2 className="text-base text-blue-600 font-semibold tracking-wide uppercase">Features</h2>
          <p className="mt-2 text-3xl leading-8 font-bold tracking-tight text-gray-900 sm:text-4xl">
            Built for busy professionals
          </p>
        </div>

        <div className="mt-16">
          <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-10">
            {features.map((feature) => (
              <div key={feature.title} className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                    <feature.icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">{feature.title}</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">{feature.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}