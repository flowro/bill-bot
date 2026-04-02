import { Suspense } from 'react'
import DashboardStats from '@/components/DashboardStats'
import UsersTable from '@/components/UsersTable'
import RecentReceipts from '@/components/RecentReceipts'

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Bill Bot Admin Dashboard
          </h1>
          <p className="text-gray-600">Monitor users, receipts, and system health</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Analytics Overview */}
          <Suspense fallback={<div className="animate-pulse bg-white p-6 rounded-lg shadow">Loading stats...</div>}>
            <DashboardStats />
          </Suspense>

          {/* Users and Receipts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Suspense fallback={<div className="animate-pulse bg-white p-6 rounded-lg shadow">Loading users...</div>}>
              <UsersTable />
            </Suspense>
            
            <Suspense fallback={<div className="animate-pulse bg-white p-6 rounded-lg shadow">Loading receipts...</div>}>
              <RecentReceipts />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  )
}