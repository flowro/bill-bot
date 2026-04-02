import { Check } from 'lucide-react'

export default function Pricing() {
  return (
    <div className="py-16 bg-white" id="pricing">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:text-center">
          <h2 className="text-base text-blue-600 font-semibold tracking-wide uppercase">Pricing</h2>
          <p className="mt-2 text-3xl leading-8 font-bold tracking-tight text-gray-900 sm:text-4xl">
            Simple, fair pricing
          </p>
          <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
            Start free, upgrade when you need more.
          </p>
        </div>

        <div className="mt-16 space-y-12 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-x-8">
          {/* Free Plan */}
          <div className="relative p-8 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col">
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900">Free Trial</h3>
              <p className="mt-4 flex items-baseline text-gray-900">
                <span className="text-5xl font-bold tracking-tight">$0</span>
                <span className="ml-1 text-xl font-semibold">/month</span>
              </p>
              <p className="mt-6 text-gray-500">Perfect for trying out Bill Bot</p>

              <ul role="list" className="mt-6 space-y-6">
                <li className="flex">
                  <Check className="flex-shrink-0 w-6 h-6 text-green-500" />
                  <span className="ml-3 text-gray-500">50 receipts per month</span>
                </li>
                <li className="flex">
                  <Check className="flex-shrink-0 w-6 h-6 text-green-500" />
                  <span className="ml-3 text-gray-500">Basic categorization</span>
                </li>
                <li className="flex">
                  <Check className="flex-shrink-0 w-6 h-6 text-green-500" />
                  <span className="ml-3 text-gray-500">Natural language queries</span>
                </li>
                <li className="flex">
                  <Check className="flex-shrink-0 w-6 h-6 text-green-500" />
                  <span className="ml-3 text-gray-500">CSV export</span>
                </li>
              </ul>
            </div>

            <a
              href="#get-started"
              className="mt-8 block w-full bg-gray-800 border border-gray-800 rounded-md py-3 px-6 text-center font-medium text-white hover:bg-gray-900"
            >
              Start Free
            </a>
          </div>

          {/* Pro Plan */}
          <div className="relative p-8 bg-blue-600 border border-blue-600 rounded-2xl shadow-sm flex flex-col">
            <div className="absolute top-0 right-6 -translate-y-1/2">
              <span className="inline-flex px-4 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-blue-800 text-white">
                Most Popular
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-white">Pro</h3>
              <p className="mt-4 flex items-baseline text-white">
                <span className="text-5xl font-bold tracking-tight">$19</span>
                <span className="ml-1 text-xl font-semibold">/month</span>
              </p>
              <p className="mt-6 text-blue-100">For serious professionals</p>

              <ul role="list" className="mt-6 space-y-6">
                <li className="flex">
                  <Check className="flex-shrink-0 w-6 h-6 text-blue-200" />
                  <span className="ml-3 text-blue-100">Unlimited receipts</span>
                </li>
                <li className="flex">
                  <Check className="flex-shrink-0 w-6 h-6 text-blue-200" />
                  <span className="ml-3 text-blue-100">Advanced categorization</span>
                </li>
                <li className="flex">
                  <Check className="flex-shrink-0 w-6 h-6 text-blue-200" />
                  <span className="ml-3 text-blue-100">Job/client tracking</span>
                </li>
                <li className="flex">
                  <Check className="flex-shrink-0 w-6 h-6 text-blue-200" />
                  <span className="ml-3 text-blue-100">PDF & CSV export</span>
                </li>
                <li className="flex">
                  <Check className="flex-shrink-0 w-6 h-6 text-blue-200" />
                  <span className="ml-3 text-blue-100">Weekly summaries</span>
                </li>
                <li className="flex">
                  <Check className="flex-shrink-0 w-6 h-6 text-blue-200" />
                  <span className="ml-3 text-blue-100">Priority support</span>
                </li>
              </ul>
            </div>

            <a
              href="#get-started"
              className="mt-8 block w-full bg-white border border-transparent rounded-md py-3 px-6 text-center font-medium text-blue-600 hover:bg-blue-50"
            >
              Start Pro Trial
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}