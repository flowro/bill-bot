import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { User, Receipt, Job } from '@/lib/types'

interface UserDetailProps {
  params: Promise<{ id: string }>
}

async function getUserDetails(userId: string) {
  // Get user info
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (!user) return null

  // Get user's receipts
  const { data: receipts } = await supabaseAdmin
    .from('receipts')
    .select(`
      id,
      amount,
      vendor,
      receipt_date,
      category,
      description,
      created_at,
      job_id
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  // Get job names for receipts
  const receiptJobIds = receipts?.filter(r => r.job_id).map(r => r.job_id) || []
  const { data: receiptJobs } = receiptJobIds.length > 0 
    ? await supabaseAdmin.from('jobs').select('id, name').in('id', receiptJobIds)
    : { data: [] }
  
  const jobsMap = receiptJobs?.reduce((acc: any, job) => {
    acc[job.id] = job
    return acc
  }, {}) || {}

  // Get user's jobs
  const { data: jobs } = await supabaseAdmin
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  // Calculate spending stats
  const totalSpent = receipts?.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0) || 0
  const categoryStats = receipts?.reduce((acc: any, receipt) => {
    const cat = receipt.category
    if (!acc[cat]) acc[cat] = { count: 0, total: 0 }
    acc[cat].count++
    acc[cat].total += parseFloat(receipt.amount || '0')
    return acc
  }, {}) || {}

  const thisMonth = new Date()
  thisMonth.setDate(1)
  const monthlyReceipts = receipts?.filter(r => 
    new Date(r.created_at) >= thisMonth
  ) || []
  const monthlyTotal = monthlyReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0)

  return {
    user,
    receipts: receipts || [],
    jobs: jobs || [],
    jobsMap,
    stats: {
      totalSpent,
      totalReceipts: receipts?.length || 0,
      monthlyTotal,
      monthlyReceipts: monthlyReceipts.length,
      categoryStats
    }
  }
}

export default async function UserDetailPage({ params }: UserDetailProps) {
  const { id } = await params
  const userDetails = await getUserDetails(id)

  if (!userDetails) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <h1 className="text-xl text-gray-600">User not found</h1>
          </div>
        </div>
      </div>
    )
  }

  const { user, receipts, jobs, jobsMap, stats } = userDetails

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <Link href="/" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
          ← Back to Dashboard
        </Link>
        
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h1 className="text-2xl font-bold mb-2">
            {user.first_name || 'Unknown User'}
          </h1>
          <div className="text-gray-600 space-y-1">
            {user.telegram_username && (
              <p>Username: @{user.telegram_username}</p>
            )}
            <p>Telegram ID: {user.telegram_id}</p>
            <p>Joined: {new Date(user.created_at).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-600">Total Spent</h3>
            <p className="text-2xl font-bold text-green-600">
              ${stats.totalSpent.toFixed(2)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-600">Total Receipts</h3>
            <p className="text-2xl font-bold text-blue-600">
              {stats.totalReceipts}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-600">This Month</h3>
            <p className="text-2xl font-bold text-purple-600">
              ${stats.monthlyTotal.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500">
              {stats.monthlyReceipts} receipts
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-600">Active Jobs</h3>
            <p className="text-2xl font-bold text-orange-600">
              {jobs.filter(j => j.status === 'active').length}
            </p>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Receipts */}
          <div className="lg:col-span-2">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Recent Receipts</h2>
              {receipts.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No receipts found</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {receipts.slice(0, 20).map((receipt) => (
                    <div key={receipt.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium">${parseFloat(receipt.amount || '0').toFixed(2)}</div>
                          {receipt.vendor && (
                            <div className="text-sm text-gray-600">{receipt.vendor}</div>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(receipt.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs capitalize">
                          {receipt.category}
                        </span>
                        {receipt.job_id && jobsMap[receipt.job_id] && (
                          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                            {jobsMap[receipt.job_id].name}
                          </span>
                        )}
                      </div>
                      {receipt.description && (
                        <div className="mt-2 text-sm text-gray-600">
                          {receipt.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Jobs */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Jobs</h3>
              {jobs.length === 0 ? (
                <p className="text-gray-500 text-sm">No jobs created</p>
              ) : (
                <div className="space-y-2">
                  {jobs.map((job) => (
                    <div key={job.id} className="border border-gray-200 rounded p-3">
                      <div className="font-medium">{job.name}</div>
                      {job.client && (
                        <div className="text-sm text-gray-600">Client: {job.client}</div>
                      )}
                      <div className="flex justify-between items-center mt-1">
                        <span className={`px-2 py-1 rounded text-xs ${
                          job.status === 'active' 
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {job.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(job.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Category Breakdown */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Spending by Category</h3>
              {Object.keys(stats.categoryStats).length === 0 ? (
                <p className="text-gray-500 text-sm">No spending data</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(stats.categoryStats)
                    .sort(([,a]: [string, any], [,b]: [string, any]) => b.total - a.total)
                    .map(([category, data]: [string, any]) => (
                      <div key={category} className="flex justify-between items-center py-2">
                        <span className="capitalize text-sm">{category}</span>
                        <div className="text-right">
                          <div className="font-medium text-sm">${data.total.toFixed(2)}</div>
                          <div className="text-xs text-gray-500">{data.count} receipts</div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}