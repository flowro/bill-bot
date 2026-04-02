import { ArrowRight, Phone } from 'lucide-react'

export default function Hero() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
      <div className="lg:grid lg:grid-cols-12 lg:gap-8">
        <div className="sm:text-center md:max-w-2xl md:mx-auto lg:col-span-6 lg:text-left">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight sm:text-5xl md:text-6xl">
            Track expenses with your 
            <span className="text-blue-600"> phone camera</span>
          </h1>
          
          <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
            Snap receipts. Get instant categorization. Ask questions in plain English. 
            Perfect for tradespeople, freelancers, and small businesses.
          </p>
          
          <div className="mt-8 sm:max-w-lg sm:mx-auto sm:text-center lg:text-left lg:mx-0">
            <a
              href="#get-started"
              className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 md:py-4 md:text-lg md:px-10"
            >
              Start Free on Telegram
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
            
            <div className="mt-4 flex items-center justify-center lg:justify-start text-sm text-gray-500">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                Your data stays private
              </div>
              <div className="ml-6 flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                No app to download
              </div>
              <div className="ml-6 flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                Works in seconds
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-12 relative sm:max-w-lg sm:mx-auto lg:mt-0 lg:max-w-none lg:mx-0 lg:col-span-6 lg:flex lg:items-center">
          <div className="relative mx-auto w-full rounded-lg shadow-lg lg:max-w-md">
            <div className="relative block w-full bg-white rounded-lg overflow-hidden">
              <div className="bg-gray-800 px-6 py-4">
                <div className="flex items-center">
                  <Phone className="h-5 w-5 text-green-400 mr-2" />
                  <span className="text-white font-medium">Bill Bot</span>
                </div>
              </div>
              <div className="px-6 py-8">
                <div className="bg-blue-100 rounded-lg p-4 mb-4">
                  <p className="text-sm text-gray-700">📸 Photo received! Processing...</p>
                </div>
                <div className="bg-gray-100 rounded-lg p-4">
                  <p className="text-sm text-gray-700">✅ <strong>$47.82</strong> from <strong>Home Depot</strong></p>
                  <p className="text-sm text-gray-700">📁 Categorized as <strong>Materials</strong></p>
                  <p className="text-sm text-gray-700">💬 PVC pipes and fittings</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}