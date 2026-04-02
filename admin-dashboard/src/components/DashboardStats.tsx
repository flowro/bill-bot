import { supabaseAdmin } from '@/lib/supabase'
import { Analytics } from '@/lib/types'

async function getAnalytics(): Promise<Analytics> {
  // Get total users
  const { count: totalUsers } = await supabaseAdmin
    .from('users')
    .select('*', { count: 'exact', head: true })

  // Get total receipts
  const { count: totalReceipts } = await supabaseAdmin
    .from('receipts')
    .select('*', { count: 'exact', head: true })

  // Get receipts today
  const today = new Date().toISOString().split('T')[0]
  const { count: receiptsToday } = await supabaseAdmin
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${today}T00:00:00Z`)

  // Get receipts this week
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const { count: receiptsThisWeek } = await supabaseAdmin
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', weekAgo.toISOString())

  // Get receipts this month
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { count: receiptsThisMonth } = await supabaseAdmin
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', monthStart.toISOString())

  // Get daily active users (users who created receipts in last 24h)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const { count: dailyActiveUsers } = await supabaseAdmin
    .from('receipts')
    .select('user_id', { count: 'exact', head: true })
    .gte('created_at', yesterday.toISOString())

  // Get top categories
  const { data: topCategories } = await supabaseAdmin
    .from('receipts')
    .select('category, amount')
    .not('category', 'is', null)

  const categoryStats = topCategories?.reduce((acc: any, receipt) => {
    const cat = receipt.category
    if (!acc[cat]) {
      acc[cat] = { count: 0, total_amount: 0 }
    }
    acc[cat].count++
    acc[cat].total_amount += parseFloat(receipt.amount || '0')
    return acc
  }, {})

  const topCategoriesArray = Object.entries(categoryStats || {})
    .map(([category, stats]: [string, any]) => ({
      category,
      count: stats.count,
      total_amount: stats.total_amount
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    totalUsers: totalUsers || 0,
    totalReceipts: totalReceipts || 0,
    receiptsToday: receiptsToday || 0,
    receiptsThisWeek: receiptsThisWeek || 0,
    receiptsThisMonth: receiptsThisMonth || 0,
    dailyActiveUsers: dailyActiveUsers || 0,
    avgReceiptsPerUser: totalUsers ? (totalReceipts || 0) / totalUsers : 0,
    topCategories: topCategoriesArray
  }
}

export default async function DashboardStats() {
  const analytics = await getAnalytics()

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-6">Analytics Overview</h2>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-blue-600">Total Users</h3>
          <p className="text-2xl font-bold text-blue-900">{analytics.totalUsers}</p>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-green-600">Total Receipts</h3>
          <p className="text-2xl font-bold text-green-900">{analytics.totalReceipts}</p>
        </div>
        
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-yellow-600">Receipts Today</h3>
          <p className="text-2xl font-bold text-yellow-900">{analytics.receiptsToday}</p>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-purple-600">Daily Active</h3>
          <p className="text-2xl font-bold text-purple-900">{analytics.dailyActiveUsers}</p>
        </div>
      </div>

      {/* Weekly/Monthly */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-600">This Week</h3>
          <p className="text-xl font-semibold">{analytics.receiptsThisWeek} receipts</p>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-600">This Month</h3>
          <p className="text-xl font-semibold">{analytics.receiptsThisMonth} receipts</p>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-600">Avg per User</h3>
          <p className="text-xl font-semibold">{analytics.avgReceiptsPerUser.toFixed(1)} receipts</p>
        </div>
      </div>

      {/* Top Categories */}
      {analytics.topCategories.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">Top Categories</h3>
          <div className="space-y-2">
            {analytics.topCategories.map((cat) => (
              <div key={cat.category} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded">
                <span className="capitalize">{cat.category}</span>
                <div className="text-right">
                  <span className="font-semibold">{cat.count} receipts</span>
                  <span className="text-sm text-gray-600 ml-2">
                    ${cat.total_amount.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}