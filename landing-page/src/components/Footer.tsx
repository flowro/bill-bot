import { QrCode, MessageCircle } from 'lucide-react'

export default function Footer() {
  return (
    <div className="bg-gray-50" id="get-started">
      {/* Get Started Section */}
      <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Ready to get started?
          </h2>
          <p className="mt-4 text-xl text-gray-600">
            Start tracking expenses in under 60 seconds
          </p>
        </div>

        <div className="mt-12 flex flex-col sm:flex-row justify-center items-center gap-8">
          {/* QR Code Placeholder */}
          <div className="flex flex-col items-center">
            <div className="w-48 h-48 bg-white border-2 border-gray-300 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <QrCode className="h-24 w-24 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-500">QR Code</p>
                <p className="text-xs text-gray-400">Scan with your phone</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-600 max-w-xs text-center">
              Scan this QR code with your phone camera to start the bot on Telegram
            </p>
          </div>

          <div className="text-center sm:text-left">
            <div className="text-2xl font-bold text-gray-900 mb-2">OR</div>
            <a
              href="https://t.me/YourBillBot"
              className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <MessageCircle className="mr-3 h-6 w-6" />
              Open on Telegram
            </a>
            <p className="mt-4 text-sm text-gray-500 max-w-sm">
              Click the link above to start chatting with Bill Bot directly in Telegram
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <h3 className="text-xl font-bold text-gray-900">Bill Bot</h3>
              <p className="ml-4 text-gray-500">Smart expense tracking for busy professionals</p>
            </div>
            <div className="flex space-x-6 text-sm text-gray-500">
              <a href="#" className="hover:text-gray-900">Privacy</a>
              <a href="#" className="hover:text-gray-900">Terms</a>
              <a href="#" className="hover:text-gray-900">Support</a>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-200 pt-8">
            <p className="text-center text-sm text-gray-400">
              © 2026 Bill Bot. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}