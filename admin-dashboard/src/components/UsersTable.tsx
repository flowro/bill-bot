import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { User } from '@/lib/types'

async function getUsers(): Promise<User[]> {
  const { data: users } = await supabaseAdmin
    .from('users')
    .select(`
      id,
      telegram_id,
      telegram_username,
      first_name,
      created_at
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  // Get receipt counts for each user
  const userIds = users?.map(u => u.id) || []
  
  if (userIds.length === 0) return []

  const { data: receiptCounts } = await supabaseAdmin
    .from('receipts')
    .select('user_id')
    .in('user_id', userIds)

  const countsByUser = receiptCounts?.reduce((acc: any, receipt) => {
    acc[receipt.user_id] = (acc[receipt.user_id] || 0) + 1
    return acc
  }, {}) || {}

  // Get last active dates
  const { data: lastActive } = await supabaseAdmin
    .from('receipts')
    .select('user_id, created_at')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })

  const lastActiveByUser = lastActive?.reduce((acc: any, receipt) => {
    if (!acc[receipt.user_id]) {
      acc[receipt.user_id] = receipt.created_at
    }
    return acc
  }, {}) || {}

  return (users || []).map(user => ({
    ...user,
    receipt_count: countsByUser[user.id] || 0,
    last_active: lastActiveByUser[user.id]
  }))
}

export default async function UsersTable() {
  const users = await getUsers()

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-6">Recent Users</h2>
      
      {users.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No users found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 font-medium">User</th>
                <th className="text-left py-3 font-medium">Receipts</th>
                <th className="text-left py-3 font-medium">Joined</th>
                <th className="text-left py-3 font-medium">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="py-3">
                    <Link 
                      href={`/user/${user.id}`}
                      className="hover:text-blue-600"
                    >
                      <div>
                        <div className="font-medium">
                          {user.first_name || 'Unknown'}
                        </div>
                        {user.telegram_username && (
                          <div className="text-gray-500 text-xs">
                            @{user.telegram_username}
                          </div>
                        )}
                        <div className="text-gray-400 text-xs">
                          ID: {user.telegram_id}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="py-3">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                      {user.receipt_count}
                    </span>
                  </td>
                  <td className="py-3 text-gray-600">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 text-gray-600">
                    {user.last_active ? (
                      new Date(user.last_active).toLocaleDateString()
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <div className="mt-4 text-center">
        <Link 
          href="/users" 
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          View all users →
        </Link>
      </div>
    </div>
  )
}