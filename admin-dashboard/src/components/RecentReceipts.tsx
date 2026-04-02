import { supabaseAdmin } from '@/lib/supabase'
import { Receipt } from '@/lib/types'

async function getRecentReceipts(): Promise<Receipt[]> {
  const { data: receipts } = await supabaseAdmin
    .from('receipts')
    .select(`
      id,
      user_id,
      job_id,
      amount,
      vendor,
      receipt_date,
      category,
      description,
      created_at,
      users!inner(first_name, telegram_username),
      jobs(name)
    `)
    .order('created_at', { ascending: false })
    .limit(15)

  return receipts?.map(receipt => ({
    id: receipt.id,
    user_id: receipt.user_id,
    job_id: receipt.job_id,
    amount: parseFloat(receipt.amount || '0'),
    vendor: receipt.vendor,
    receipt_date: receipt.receipt_date,
    category: receipt.category,
    description: receipt.description,
    created_at: receipt.created_at,
    user: Array.isArray(receipt.users) ? receipt.users[0] : receipt.users,
    job: Array.isArray(receipt.jobs) ? receipt.jobs[0] : receipt.jobs
  })) || []
}

function getCategoryEmoji(category: string) {
  const emojiMap: { [key: string]: string } = {
    materials: '🔧',
    fuel: '⛽',
    tools: '🔨',
    food: '🍔',
    labor: '👷',
    vehicle: '🚗',
    office: '📎',
    other: '📦'
  }
  return emojiMap[category] || '📦'
}

export default async function RecentReceipts() {
  const receipts = await getRecentReceipts()

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-6">Recent Receipts</h2>
      
      {receipts.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No receipts found</p>
      ) : (
        <div className="space-y-3">
          {receipts.map((receipt) => (
            <div 
              key={receipt.id} 
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-lg">
                    {getCategoryEmoji(receipt.category)}
                  </span>
                  <div>
                    <div className="font-medium">
                      ${receipt.amount.toFixed(2)}
                    </div>
                    {receipt.vendor && (
                      <div className="text-sm text-gray-600">
                        {receipt.vendor}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  {new Date(receipt.created_at).toLocaleDateString()}
                </div>
              </div>
              
              <div className="text-sm text-gray-600">
                <div className="flex justify-between items-center">
                  <span>
                    {receipt.user?.first_name || 'Unknown User'}
                    {receipt.user?.telegram_username && (
                      <span className="text-gray-400 ml-1">
                        @{receipt.user.telegram_username}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs capitalize">
                      {receipt.category}
                    </span>
                    {receipt.job && (
                      <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                        {receipt.job.name}
                      </span>
                    )}
                  </div>
                </div>
                
                {receipt.description && (
                  <div className="mt-2 text-gray-600">
                    {receipt.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div className="mt-4 text-center">
        <a 
          href="/receipts" 
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          View all receipts →
        </a>
      </div>
    </div>
  )
}