import { Camera, Brain, FileText } from 'lucide-react'

export default function HowItWorks() {
  const steps = [
    {
      icon: Camera,
      title: 'Snap',
      description: 'Take a photo of any receipt or invoice with your phone camera'
    },
    {
      icon: Brain,
      title: 'Categorize',
      description: 'AI instantly extracts amount, vendor, date, and categorizes the expense'
    },
    {
      icon: FileText,
      title: 'Report',
      description: 'Ask questions, get summaries, or export data for your accountant'
    }
  ]

  return (
    <div className="py-16 bg-white" id="how-it-works">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:text-center">
          <h2 className="text-base text-blue-600 font-semibold tracking-wide uppercase">How it works</h2>
          <p className="mt-2 text-3xl leading-8 font-bold tracking-tight text-gray-900 sm:text-4xl">
            Three simple steps
          </p>
          <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
            From receipt to report in seconds. No manual typing, no complex software.
          </p>
        </div>

        <div className="mt-16">
          <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10">
            {steps.map((step, index) => (
              <div key={step.title} className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                    <step.icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">
                    {index + 1}. {step.title}
                  </p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  {step.description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}